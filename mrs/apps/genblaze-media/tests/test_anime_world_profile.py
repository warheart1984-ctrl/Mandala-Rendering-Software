"""Tests for AnimeWorldProfile v1.0 validator (partial)."""

from __future__ import annotations

from app.anime_world_profile import (
    ENFORCEMENT_STATUS,
    SCHEMA_VERSION,
    VALIDATION_STATUS,
    anime_profile_health_fragment,
    default_example_path,
    load_anime_world_profile,
    profile_gate_points,
    validate_anime_world_profile,
)


def test_example_profile_validates():
    path = default_example_path()
    assert path.is_file(), f"expected example at {path}"
    profile = load_anime_world_profile(path)
    issues = validate_anime_world_profile(profile)
    assert issues == [], issues
    assert profile["schemaVersion"] == SCHEMA_VERSION
    assert profile["profileId"] == "anime.mandala-cel.v1"
    assert profile["status"] == "partial"
    assert profile["bindings"]["genblazeStyle"] == "anime"


def test_missing_fields_reported():
    issues = validate_anime_world_profile({"profileId": "x"})
    assert any(i.startswith("missing:") for i in issues)
    assert "missing:color_palette" in issues


def test_bad_hex_reported():
    profile = load_anime_world_profile(default_example_path())
    profile["color_palette"]["roles"]["key"] = "not-a-color"
    issues = validate_anime_world_profile(profile)
    assert any(i.startswith("color_palette-role-bad-hex:") for i in issues)


def test_gate_points_declared_not_enforced():
    gates = profile_gate_points()
    assert gates["enforcement_status"] == "declared"
    assert gates["validation_status"] == "partial"
    ids = {g["id"] for g in gates["gate_points"]}
    assert "genblaze-style-steer" in ids
    assert "ckl-world-profile-bridge" in ids


def test_health_fragment_loads_example():
    frag = anime_profile_health_fragment(settings_style="anime")
    assert frag["enforcement_status"] == ENFORCEMENT_STATUS
    assert frag["validation_status"] == VALIDATION_STATUS
    assert frag["active_style"] == "anime"
    assert frag.get("example_valid") is True
