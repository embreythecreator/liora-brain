"""Regression for #68523 — one systemctl timeout must not abort fleet restarts.

On hosts with many profile-backed ``liora-gateway*.service`` units,
``liora update`` used to wrap the entire per-scope unit loop in a single
``except subprocess.TimeoutExpired``. A timeout on unit N skipped units
N+1…, leaving later gateways on pre-update in-memory modules while the
checkout on disk was already new (mixed-generation crashes).
"""

from __future__ import annotations

import subprocess

import pytest

from liora_cli.main import (
    _for_each_systemd_gateway_unit,
    _service_unit_supports_graceful_sigusr1_restart,
    _warn_incomplete_gateway_fleet_restart,
)


def _list_units_stdout(names: list[str]) -> str:
    return "\n".join(f"{name}.service loaded active running" for name in names)


class TestFleetRestartTimeoutIsolation:
    def test_timeout_on_middle_unit_continues_remaining_units(self):
        units = [
            "liora-gateway-xiaomo1",
            "liora-gateway-xiaomo2",
            "liora-gateway-xiaomo3",
            "liora-gateway-xiaomo4",
            "liora-gateway-xiaomo5",
            "liora-gateway-xiaomo6",
            "liora-gateway-xiaomo7",
            "liora-gateway",
        ]
        restarted: list[str] = []
        failed: list[str] = []
        timeout_cmds: list = []

        def process_unit(svc_name: str) -> None:
            if svc_name == "liora-gateway-xiaomo5":
                raise subprocess.TimeoutExpired(
                    cmd=["systemctl", "--user", "--no-ask-password", "restart", svc_name],
                    timeout=15,
                )
            restarted.append(svc_name)

        def on_unit_timeout(svc_name: str, exc: subprocess.TimeoutExpired) -> None:
            failed.append(svc_name)
            timeout_cmds.append(exc.cmd)

        _for_each_systemd_gateway_unit(
            _list_units_stdout(units),
            process_unit=process_unit,
            on_unit_timeout=on_unit_timeout,
        )

        assert failed == ["liora-gateway-xiaomo5"]
        assert restarted == [
            "liora-gateway-xiaomo1",
            "liora-gateway-xiaomo2",
            "liora-gateway-xiaomo3",
            "liora-gateway-xiaomo4",
            "liora-gateway-xiaomo6",
            "liora-gateway-xiaomo7",
            "liora-gateway",
        ]
        assert set(restarted) | set(failed) == set(units)
        assert timeout_cmds == [
            ["systemctl", "--user", "--no-ask-password", "restart", "liora-gateway-xiaomo5"]
        ]

    def test_non_gateway_units_in_list_output_are_ignored(self):
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            "\n".join(
                [
                    "ssh.service loaded active running",
                    "liora-gateway-coder.service loaded active running",
                    "not-a-service loaded active running",
                    "",
                ]
            ),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["liora-gateway-coder"]

    def test_liora_serve_units_are_included(self):
        # #83438 — liora update restarted liora-gateway* units but left
        # liora-serve* (the Desktop app's backend) on stale pre-update code.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            "\n".join(
                [
                    "ssh.service loaded active running",
                    "liora-serve.service loaded active running",
                    "liora-serve-work.service loaded active running",
                    "liora-gateway.service loaded active running",
                    "",
                ]
            ),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["liora-serve", "liora-serve-work", "liora-gateway"]

    def test_liora_server_near_prefix_is_rejected(self):
        # Review on #83595: a bare ``startswith("liora-serve")`` gate also
        # accepts the unrelated ``liora-server.service``. Only the exact
        # base unit or the hyphenated profile family should pass.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            _list_units_stdout(["liora-server"]),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == []

    def test_liora_gateway_near_prefix_is_rejected(self):
        # Same strict shape on the gateway side: profile units are
        # ``liora-gateway-<profile>``, so a hypothetical
        # ``liora-gatewayd.service`` must not enter the restart path.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            _list_units_stdout(["liora-gatewayd", "liora-gateway-coder"]),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["liora-gateway-coder"]


class TestGracefulSigusr1Eligibility:
    def test_gateway_units_are_eligible(self):
        assert _service_unit_supports_graceful_sigusr1_restart("liora-gateway")
        assert _service_unit_supports_graceful_sigusr1_restart(
            "liora-gateway-work"
        )

    def test_serve_units_are_not_eligible(self):
        # liora-serve doesn't run gateway/run.py, so it never installs the
        # SIGUSR1 handler — sending it the signal would just terminate the
        # process (the default action) instead of draining gracefully.
        assert not _service_unit_supports_graceful_sigusr1_restart("liora-serve")
        assert not _service_unit_supports_graceful_sigusr1_restart(
            "liora-serve-work"
        )

    def test_process_errors_other_than_timeout_still_propagate(self):
        def process_unit(_svc_name: str) -> None:
            raise RuntimeError("not a timeout")

        with pytest.raises(RuntimeError, match="not a timeout"):
            _for_each_systemd_gateway_unit(
                _list_units_stdout(["liora-gateway"]),
                process_unit=process_unit,
                on_unit_timeout=lambda *_: pytest.fail("timeout handler must not run"),
            )


class TestIncompleteFleetRestartWarning:
    def test_warns_with_exact_unrestarted_units(self, capsys):
        _warn_incomplete_gateway_fleet_restart(
            ["liora-gateway-xiaomo5", "liora-gateway-xiaomo6", "liora-gateway-xiaomo5"]
        )
        out = capsys.readouterr().out
        assert "Update incomplete" in out
        assert out.count("liora-gateway-xiaomo5") == 1
        assert "liora-gateway-xiaomo6" in out
        assert "pre-update code" in out

