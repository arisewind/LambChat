from __future__ import annotations

import deepagents.middleware.summarization as summarization

from src.infra.llm.deepagents_patch import apply_deepagents_patches
from src.kernel.config import settings


class _ModelWithoutProfile:
    profile = None


def test_deepagents_patch_uses_configured_fallback_window(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DEEPAGENT_DEFAULT_MAX_INPUT_TOKENS", 64000, raising=False)
    monkeypatch.setattr(settings, "DEEPAGENT_SUMMARIZATION_TRIGGER_RATIO", 0.70, raising=False)
    monkeypatch.setattr(settings, "DEEPAGENT_SUMMARIZATION_KEEP_RATIO", 0.15, raising=False)
    apply_deepagents_patches()

    defaults = summarization.compute_summarization_defaults(_ModelWithoutProfile())

    assert defaults["trigger"] == ("tokens", 44800)
    assert defaults["keep"] == ("tokens", 9600)
    assert defaults["truncate_args_settings"]["trigger"] == ("tokens", 44800)
    assert defaults["truncate_args_settings"]["keep"] == ("tokens", 9600)


def test_deepagents_patch_ratios_are_configurable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DEEPAGENT_DEFAULT_MAX_INPUT_TOKENS", 100000, raising=False)
    monkeypatch.setattr(settings, "DEEPAGENT_SUMMARIZATION_TRIGGER_RATIO", 0.60, raising=False)
    monkeypatch.setattr(settings, "DEEPAGENT_SUMMARIZATION_KEEP_RATIO", 0.20, raising=False)
    apply_deepagents_patches()

    defaults = summarization.compute_summarization_defaults(_ModelWithoutProfile())

    assert defaults["trigger"] == ("tokens", 60000)
    assert defaults["keep"] == ("tokens", 20000)
