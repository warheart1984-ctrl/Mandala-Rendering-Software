"""Face polish default helpers."""

from app.face_polish_defaults import (
    FACE_POLISH_DEFAULT_PROMPT,
    FACE_POLISH_MAX_DEFAULT_STRENGTH,
    resolve_face_polish_prompt,
    resolve_face_polish_strength,
)


def test_face_prompt_default_when_empty_and_face_rig():
    assert resolve_face_polish_prompt(None, face_rig=True) == FACE_POLISH_DEFAULT_PROMPT
    assert "preserve facial structure" in resolve_face_polish_prompt("", face_rig=True)


def test_face_prompt_respects_explicit():
    assert resolve_face_polish_prompt("my look", face_rig=True) == "my look"


def test_face_strength_caps_default():
    assert (
        resolve_face_polish_strength(None, face_rig=True, default_strength=0.8)
        == FACE_POLISH_MAX_DEFAULT_STRENGTH
    )
    assert resolve_face_polish_strength(0.6, face_rig=True, default_strength=0.8) == 0.6
