"""Resolve LIORA_HOME for standalone skill scripts.

Skill scripts may run outside the Liora process (system Python, nix env,
CI) where ``liora_constants`` is not importable.  This module provides the
same ``get_liora_home()`` contract without requiring it on ``sys.path``.

When ``liora_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from liora_constants import get_liora_home as get_liora_home
except (ModuleNotFoundError, ImportError):

    def get_liora_home() -> Path:
        """Return the Liora home directory (default: ``~/.liora``)."""
        val = os.environ.get("LIORA_HOME", "").strip()
        return Path(val) if val else Path.home() / ".liora"
