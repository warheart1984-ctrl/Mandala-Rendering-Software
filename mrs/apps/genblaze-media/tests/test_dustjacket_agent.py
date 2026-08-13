"""Dustjacket agent offline tests — shot-script layer (no Gemini, no network)."""

from __future__ import annotations

from app.dustjacket_agent import (
    DustjacketAgent,
    default_shot_script,
    parse_shot_script,
)


def test_default_shot_script_deterministic():
    a = default_shot_script("tesseract lattice cyan neon")
    b = default_shot_script("tesseract lattice cyan neon")
    assert a == b
    assert a["source"] == "deterministic-default"


def test_default_shot_script_preserves_prompt():
    script = default_shot_script("mandala neural lattice")
    assert script["shot_intent"] == "mandala neural lattice"
    assert script["refined_prompt"] == "mandala neural lattice"


def test_default_shot_script_has_required_keys():
    script = default_shot_script("x")
    for key in ("shot_intent", "camera", "lighting", "composition", "style", "render_params", "refined_prompt", "source"):
        assert key in script, f"missing key {key}"
    for key in ("quality", "then_scene", "then_polish"):
        assert key in script["render_params"], f"missing render_param {key}"


def test_parse_shot_script_plain_json():
    script = parse_shot_script('{"style": "anime", "refined_prompt": "p"}')
    assert script == {"style": "anime", "refined_prompt": "p"}


def test_parse_shot_script_fenced_json():
    raw = "```json\n{\"style\": \"photoreal\"}\n```"
    assert parse_shot_script(raw) == {"style": "photoreal"}


def test_parse_shot_script_invalid_returns_none():
    assert parse_shot_script("not json at all") is None
    assert parse_shot_script('[1, 2, 3]') is None
    assert parse_shot_script("") is None


def test_gemini_shot_script_forced_off_returns_default():
    agent = DustjacketAgent()
    script = agent._gemini_shot_script("slow pan across the lattice", use_gemini=False)
    assert script["source"] == "deterministic-default"
    assert script["shot_intent"] == "slow pan across the lattice"


def test_parse_shot_script_fence_without_lang():
    assert parse_shot_script("```\n{\"a\": 1}\n```") == {"a": 1}
