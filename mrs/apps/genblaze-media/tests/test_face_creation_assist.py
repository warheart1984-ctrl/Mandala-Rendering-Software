"""Face Creation Assist provider — opt-in + disabled default."""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.face_creation_assist_provider import (
    FaceCreationAssistError,
    face_creation_assist_availability,
    run_face_creation_assist,
)


def test_face_creation_assist_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FACE_CREATION_ASSIST_ENABLED", raising=False)
    settings = get_settings()
    avail = face_creation_assist_availability(settings)
    assert avail["enabled"] is False
    assert avail["assistOnly"] is True
    assert avail["printSoT"] is False


def test_face_creation_assist_run_requires_enable(monkeypatch):
    monkeypatch.delenv("FACE_CREATION_ASSIST_ENABLED", raising=False)
    settings = get_settings()
    with pytest.raises(FaceCreationAssistError, match="disabled"):
        run_face_creation_assist(settings, prompt="x", dry_run=True)


def test_face_creation_assist_cli_dry_run(monkeypatch):
    monkeypatch.setenv("FACE_CREATION_ASSIST_ENABLED", "1")
    # Force settings reload if cached — get_settings may be lru; clear via new call patterns
    from app import config as config_mod

    if hasattr(config_mod.get_settings, "cache_clear"):
        config_mod.get_settings.cache_clear()
    settings = get_settings()
    avail = face_creation_assist_availability(settings)
    if not avail["available"]:
        pytest.skip(f"CLI/node unavailable: {avail}")
    out = run_face_creation_assist(
        settings, prompt="unit face", dry_run=True
    )
    assert out.get("assistOnly") is True
    assert out.get("printSoT") is False
    assert out.get("characterSpec", {}).get("assistOnly") is True
