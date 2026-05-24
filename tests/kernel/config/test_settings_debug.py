from __future__ import annotations

from src.kernel.config.base import Settings


def test_settings_treats_release_debug_env_as_false(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "release")

    settings = Settings(_env_file=None)

    assert settings.DEBUG is False


def test_settings_treats_debug_env_as_true(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "debug")

    settings = Settings(_env_file=None)

    assert settings.DEBUG is True
