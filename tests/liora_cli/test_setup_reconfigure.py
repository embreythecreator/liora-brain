"""Tests for the setup wizard's returning-user behavior.

On an existing install:
- Bare `liora setup` drops straight into the full reconfigure wizard
  (every prompt shows the current value as its default).
- `liora setup --quick` runs the narrower "fill in missing items" flow.
- `liora setup --reconfigure` is a backwards-compat alias for the
  bare-setup default.

On a fresh install, all three are no-ops — fall through to first-time setup.
"""

from argparse import Namespace
from contextlib import ExitStack
from unittest.mock import patch

import pytest


def _make_setup_args(**overrides):
    return Namespace(
        non_interactive=overrides.get("non_interactive", False),
        section=overrides.get("section", None),
        reset=overrides.get("reset", False),
        reconfigure=overrides.get("reconfigure", False),
        quick=overrides.get("quick", False),
    )


@pytest.fixture
def existing_install(tmp_path, monkeypatch):
    """Simulate a returning user with an existing configured install."""
    home = tmp_path / ".liora"
    home.mkdir()
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)
    monkeypatch.setenv("LIORA_HOME", str(home))
    return home


@pytest.fixture
def fresh_install(tmp_path, monkeypatch):
    """Simulate a first-time user with no existing configuration."""
    home = tmp_path / ".liora"
    home.mkdir()
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)
    monkeypatch.setenv("LIORA_HOME", str(home))
    return home


def _enter_existing_install_patches(stack, **extra):
    """Apply standard existing-install mocks via an ExitStack.

    Returns a dict of mocks from the `extra` kwargs (which map mock-name to
    target path) so callers can assert on them.
    """
    # Unconditional mocks (no return values to assert against).
    for target, kwargs in [
        ("liora_cli.setup.ensure_liora_home", {}),
        ("liora_cli.setup.is_interactive_stdin", {"return_value": True}),
        ("liora_cli.config.is_managed", {"return_value": False}),
        ("liora_cli.setup.load_config", {"return_value": {}}),
        ("liora_cli.setup.save_config", {}),
        ("liora_cli.setup.get_env_value", {"return_value": None}),
        ("liora_cli.auth.get_active_provider", {"return_value": "openrouter"}),
        ("liora_cli.setup._print_setup_summary", {}),
        ("liora_cli.setup._offer_openclaw_migration", {"return_value": False}),
    ]:
        stack.enter_context(patch(target, **kwargs))

    # Named mocks caller wants to assert on.
    named = {}
    for name, target in extra.items():
        named[name] = stack.enter_context(patch(target))
    return named


def _enter_fresh_install_patches(stack, **extra):
    for target, kwargs in [
        ("liora_cli.setup.ensure_liora_home", {}),
        ("liora_cli.setup.is_interactive_stdin", {"return_value": True}),
        ("liora_cli.config.is_managed", {"return_value": False}),
        ("liora_cli.setup.load_config", {"return_value": {}}),
        ("liora_cli.setup.save_config", {}),
        ("liora_cli.auth.get_active_provider", {"return_value": None}),
        ("liora_cli.setup.get_env_value", {"return_value": None}),
        ("liora_cli.setup._offer_openclaw_migration", {"return_value": False}),
    ]:
        stack.enter_context(patch(target, **kwargs))

    named = {}
    for name, target_spec in extra.items():
        if isinstance(target_spec, tuple):
            target, kwargs = target_spec
            named[name] = stack.enter_context(patch(target, **kwargs))
        else:
            named[name] = stack.enter_context(patch(target_spec))
    return named


class TestExistingInstallDefault:
    """Bare `liora setup` on an existing install = full reconfigure wizard."""

    def test_bare_setup_runs_full_reconfigure_without_menu(self, existing_install):
        """No menu, no prompt_choice — just run every section in sequence."""
        args = _make_setup_args()  # no flags

        with ExitStack() as stack:
            m = _enter_existing_install_patches(
                stack,
                prompt_choice="liora_cli.setup.prompt_choice",
                quick="liora_cli.setup._run_quick_setup",
                model="liora_cli.setup.setup_model_provider",
                terminal="liora_cli.setup.setup_terminal_backend",
                agent="liora_cli.setup.setup_agent_settings",
                gateway="liora_cli.setup.setup_gateway",
                tools="liora_cli.setup.setup_tools",
            )
            from liora_cli.setup import run_setup_wizard
            run_setup_wizard(args)

        # No menu shown.
        m["prompt_choice"].assert_not_called()
        # Quick-setup path NOT taken.
        m["quick"].assert_not_called()
        # Model/terminal/gateway/tools run; agent settings are no longer
        # prompted on existing installs (they keep their tuned values).
        m["model"].assert_called_once()
        m["terminal"].assert_called_once()
        m["agent"].assert_not_called()
        m["gateway"].assert_called_once()
        m["tools"].assert_called_once()


class TestQuickFlag:
    """`--quick` on an existing install runs the fill-missing flow."""

    def test_quick_flag_runs_quick_setup_only(self, existing_install):
        args = _make_setup_args(quick=True)

        with ExitStack() as stack:
            m = _enter_existing_install_patches(
                stack,
                quick="liora_cli.setup._run_quick_setup",
                model="liora_cli.setup.setup_model_provider",
                terminal="liora_cli.setup.setup_terminal_backend",
                agent="liora_cli.setup.setup_agent_settings",
                gateway="liora_cli.setup.setup_gateway",
                tools="liora_cli.setup.setup_tools",
            )
            from liora_cli.setup import run_setup_wizard
            from liora_cli import setup as setup_mod

            section_indexes = []
            m["quick"].side_effect = lambda *_args: section_indexes.append(
                setup_mod._SETUP_NAVIGATION.get().section_index
            )
            run_setup_wizard(args)

        m["quick"].assert_called_once()
        assert section_indexes == [0]
        # Full reconfigure sections must NOT run.
        m["model"].assert_not_called()
        m["terminal"].assert_not_called()
        m["agent"].assert_not_called()
        m["gateway"].assert_not_called()
        m["tools"].assert_not_called()


class TestFreshInstall:
    """On a fresh install (no active provider), flags are no-ops."""


    def test_reconfigure_on_fresh_install_falls_through(self, fresh_install):
        args = _make_setup_args(reconfigure=True)

        with ExitStack() as stack:
            m = _enter_fresh_install_patches(
                stack,
                prompt=("liora_cli.setup.prompt_choice", {"return_value": 0}),
                first="liora_cli.setup._run_first_time_quick_setup",
            )
            from liora_cli.setup import run_setup_wizard
            from liora_cli import setup as setup_mod

            section_indexes = []
            m["first"].side_effect = lambda *_args: section_indexes.append(
                setup_mod._SETUP_NAVIGATION.get().section_index
            )
            run_setup_wizard(args)

        m["prompt"].assert_called_once()
        m["first"].assert_called_once()
        assert section_indexes == [0]

    def test_blank_slate_runs_inside_navigation_step(self, fresh_install):
        args = _make_setup_args()

        with ExitStack() as stack:
            m = _enter_fresh_install_patches(
                stack,
                prompt=("liora_cli.setup.prompt_choice", {"return_value": 2}),
                blank="liora_cli.setup._run_blank_slate_setup",
            )
            from liora_cli import setup as setup_mod

            section_indexes = []
            m["blank"].side_effect = lambda *_args: section_indexes.append(
                setup_mod._SETUP_NAVIGATION.get().section_index
            )
            setup_mod.run_setup_wizard(args)

        m["blank"].assert_called_once()
        assert section_indexes == [0]


class TestArgparse:
    """The flags are plumbed through argparse to cmd_setup."""

    def test_reconfigure_flag_reaches_cmd_setup(self, monkeypatch):
        import sys
        from liora_cli.main import main

        captured = {}
        monkeypatch.setattr(
            "liora_cli.setup.run_setup_wizard",
            lambda args: captured.setdefault("args", args),
        )
        monkeypatch.setattr(sys, "argv", ["liora", "setup", "--reconfigure"])
        try:
            main()
        except SystemExit:
            pass
        assert captured["args"].reconfigure is True
        assert captured["args"].quick is False
