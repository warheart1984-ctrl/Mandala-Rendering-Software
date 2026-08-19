"""storyforge-mandala-contract/1.0 tests.

partial: schema + identity compare.
declared: Beatbox/Speakers/NTP (not exercised).
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

_DIR = Path(__file__).resolve().parent
import sys

if str(_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_DIR.parent))

from contract.canonical import CONTRACT_VERSION
from contract.map_infinity import from_infinity_backend_build, to_mandala_production_request
from contract.validate import ContractError, validate_production_artifact
from contract.vertical_slice import compare_identity, emit_shot_artifacts

FIXTURE = _DIR / "fixtures" / "infinity-backend-build-warrior-courtyard.json"


@pytest.fixture
def infinity_raw():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_contract_version_is_1_0():
    assert CONTRACT_VERSION == "storyforge-mandala-contract/1.0"


def test_maps_infinity_backend_build(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    assert artifact["kind"] == "StoryForgeProductionArtifact"
    assert artifact["infinityBuildId"] == "sf-build-warrior-courtyard-001"
    assert len(artifact["shots"]) == 8
    validate_production_artifact(artifact)


def test_mandala_request_and_shot1_equals_shot8_identity(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    request = to_mandala_production_request(artifact)
    shots = emit_shot_artifacts(request)
    assert shots[0]["shotId"] == "S01"
    assert shots[-1]["shotId"] == "S08"
    cmp = compare_identity(shots[0], shots[-1])
    assert cmp["equal"] is True
    assert cmp["findings"] == []
    assert shots[0]["characterStateHash"] == shots[-1]["characterStateHash"]
    assert shots[0]["worldStateHash"] == shots[-1]["worldStateHash"]
    assert shots[0]["equipmentHash"] == shots[-1]["equipmentHash"]
    assert shots[0]["meshHash"] == shots[-1]["meshHash"]
    assert shots[0]["rigHash"] == shots[-1]["rigHash"]


def test_pose_and_render_hash_evolve(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    shots = emit_shot_artifacts(to_mandala_production_request(artifact))
    poses = [s["pose"]["id"] for s in shots]
    assert len(set(poses)) >= 5
    assert shots[0]["renderHash"] != shots[-1]["renderHash"]
    assert shots[0]["projectionHash"] != shots[-1]["projectionHash"]


def test_identity_compare_fails_if_lock_mutates(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    request = to_mandala_production_request(artifact)
    mutated = deepcopy(request)
    mutated["actors"][0]["identityLock"]["weaponHeldIn"] = "left"
    from contract.identity import character_state_hash

    mutated["actors"][0]["characterStateHash"] = character_state_hash(
        mutated["actors"][0]["identityLock"]
    )
    shots = emit_shot_artifacts(mutated)
    # Same production mutated lock: all shots share the new hash, so compare
    # against the original S01 hash instead.
    original = emit_shot_artifacts(request)
    cmp = compare_identity(original[0], shots[-1])
    assert cmp["equal"] is False
    assert "characterStateHash drifted" in cmp["findings"]


def test_audio_plan_is_declared(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    assert artifact["audioPlan"]["statusTag"] == "declared"


def test_refuses_to_invent_identity_lock(infinity_raw):
    raw = deepcopy(infinity_raw)
    raw["narrative_state"]["characters"][0] = {"name": "Nameless"}
    with pytest.raises(ContractError, match="identityLock"):
        from_infinity_backend_build(raw)


def test_no_story_bible_engine_left_in_adapter():
    root = _DIR.parent
    leftovers = list(root.rglob("StoryBible.schema.json")) + list(
        root.rglob("story_bible.py")
    )
    assert leftovers == [], leftovers
