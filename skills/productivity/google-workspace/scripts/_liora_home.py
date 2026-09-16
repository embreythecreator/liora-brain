"""Resolve LIORA_HOME for standalone skill scripts.

Skill scripts may run outside the Liora process (e.g. system Python,
nix env, CI) where ``liora_constants`` is not importable.  This module
provides the same ``get_liora_home()`` and ``display_liora_home()``
contracts as ``liora_constants`` without requiring it on ``sys.path``.

When ``liora_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``liora_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``LIORA_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from liora_constants import display_liora_home as display_liora_home
    from liora_constants import get_liora_home as get_liora_home
except (ModuleNotFoundError, ImportError):

    def get_liora_home() -> Path:
        """Return the Liora home directory (default: ~/.liora).

        Mirrors ``liora_constants.get_liora_home()``."""
        val = os.environ.get("LIORA_HOME", "").strip()
        return Path(val) if val else Path.home() / ".liora"

    def display_liora_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``liora_constants.display_liora_home()``."""
        home = get_liora_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
