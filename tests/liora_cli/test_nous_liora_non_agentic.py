"""Tests for the Nous-liora-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"liora"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``liora-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "liora" tag namespace.

``is_nous_liora_non_agentic`` should only match the actual Liora
liora-3 / Liora-4 chat family.
"""

from __future__ import annotations

import pytest

from liora_cli.model_switch import (
    _LIORA_MODEL_WARNING,
    _check_liora_model_warning,
    is_nous_liora_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "embreythecreator/liora-3-Llama-3.1-70B",
        "embreythecreator/liora-3-Llama-3.1-405B",
        "liora-3",
        "liora-3",
        "liora-4",
        "liora-4-405b",
        "liora_4_70b",
        "openrouter/liora3:70b",
        "openrouter/embreythecreator/liora-4-405b",
        "embreythecreator/liora3",
        "liora-3.1",
    ],
)
def test_matches_real_nous_liora_chat_models(model_name: str) -> None:
    assert is_nous_liora_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Liora 3/4"
    )
    assert _check_liora_model_warning(model_name) == _LIORA_MODEL_WARNING


