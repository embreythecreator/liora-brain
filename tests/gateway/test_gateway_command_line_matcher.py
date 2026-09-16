"""Tests for the strict gateway command-line matcher.

Regression guard for the Windows ``liora gateway restart`` silent-outage bug:
the previous loose substring match (``"... gateway" in cmdline``) false-matched
``gateway status``/``dashboard`` siblings and unrelated processes such as
``python -m tui_gateway``, which let ``restart()`` race a still-draining old
process and ``status``/``start`` report false positives.
"""

from __future__ import annotations

import pytest

from gateway.status import (
    looks_like_gateway_command_line as matches,
    looks_like_gateway_runtime_command_line as matches_runtime,
)


ACCEPT = [
    "pythonw.exe -m liora_cli.main gateway run",
    r"C:\Users\me\liora\venv\Scripts\pythonw.exe -m liora_cli.main gateway run",
    "python -m liora_cli.main --profile work gateway run",
    "python -m liora_cli.main gateway run --replace",
    "python -m liora_cli/main.py gateway run",
    "python gateway/run.py",
    "liora-gateway.exe",
    "liora gateway",          # bare `liora gateway` defaults to run
    "liora gateway run",
    # profile selector AFTER the `gateway` token (argv is profile-position
    # agnostic — _apply_profile_override strips --profile/-p anywhere)
    "liora gateway --profile work run",
    "python -m liora_cli.main gateway -p work run",
    "liora gateway --profile=work run",
    # a profile literally NAMED "gateway"
    "liora -p gateway gateway run",
    "python -m liora_cli.main --profile gateway gateway run",
    # quoted Windows paths with spaces (shlex-aware tokenization)
    r'"C:\Program Files\Liora\liora-gateway.exe"',
    r'"C:\Program Files\Liora\gateway\run.py" run',
    r'"C:\Program Files\Py\pythonw.exe" -m liora_cli.main gateway run',
]

REJECT = [
    "python -m tui_gateway",                              # unrelated module
    "python -m liora_cli.main gateway status",           # other subcommand
    "python -m liora_cli.main gateway restart",
    "python -m liora_cli.main gateway stop",
    "python -m liora_cli.main --profile x dashboard",    # non-gateway subcommand
    "some random python -m mygateway thing",
    "",
    None,
]


@pytest.mark.parametrize("cmd", ACCEPT)
def test_accepts_real_gateway_run(cmd):
    assert matches(cmd) is True


