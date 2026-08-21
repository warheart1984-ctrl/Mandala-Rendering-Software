"""storyforge-mandala-contract/1.1 tests.

partial: schema + identity compare + audioPlan cue mapping.
declared: Beatbox live invoke / Speakers mix / NTP (not exercised).
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

from contract.audio import compare_score_identity, local_click_playlist
from contract.canonical import CONTRACT_VERSION
from contract.map_infinity import from_infinity_backend_build, to_mandala_production_request
from contract.validate import ContractError, validate_production_artifact
from contract.vertical_slice import compare_identity, emit_shot_artifacts

FIXTURE = _DIR / "fixtures" / "infinity-backend-build-warrior-courtyard.json"


@pytest.fixture
def infinity_raw():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_contract_version_is_1_1():
    assert CONTRACT_VERSION == "storyforge-mandala-contract/1.1"


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


def test_audio_plan_is_declared_and_cues_match_shots(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    plan = artifact["audioPlan"]
    assert plan["statusTag"] == "declared"
    assert plan["mappingStatusTag"] == "partial"
    assert plan["scoreIdentity"] == "courtyard-warrior-theme-v1"
    assert [c["shotId"] for c in plan["cues"]] == [s["shotId"] for s in artifact["shots"]]
    assert plan["cues"][0]["cue"] == "cue-enter-courtyard"
    assert plan["cues"][-1]["cue"] == "cue-look-gate"
    assert any(s.get("carriesScoreIdentity") for s in plan["stems"])
    duck_ids = {d["stemId"] for d in plan["forbiddenDucking"]}
    assert "courtyard-identity-bed" in duck_ids
    assert plan["beatbox"]["livePathStatusTag"] == "declared"
    assert "BeatboxLane.score" in plan["beatbox"]["scoreEntry"]


def test_score_identity_holds_while_cues_evolve(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    shots = emit_shot_artifacts(to_mandala_production_request(artifact))
    cmp = compare_score_identity(shots[0], shots[-1])
    assert cmp["equal"] is True
    assert cmp["cuesEvolved"] is True
    assert cmp["findings"] == []
    assert shots[0]["scoreIdentity"] == shots[-1]["scoreIdentity"]
    assert shots[0]["audioCueId"] != shots[-1]["audioCueId"]
    assert shots[0]["audioIntensity"] != shots[-1]["audioIntensity"]
    assert shots[0]["audioCueId"].startswith("S01:")
    assert shots[-1]["audioCueId"].startswith("S08:")


def test_local_fallback_is_click_playlist_not_original_score(infinity_raw):
    artifact = from_infinity_backend_build(infinity_raw)
    playlist = local_click_playlist(artifact["audioPlan"])
    assert playlist["beatboxInvoked"] is False
    assert "not an original" in playlist["claim"]
    assert playlist["scoreIdentity"] == artifact["audioPlan"]["scoreIdentity"]
    assert len(playlist["entries"]) == 8
    assert playlist["entries"][0]["clickHz"] != playlist["entries"][-1]["clickHz"]


def test_live_beatbox_mp4_is_declared_without_video_path(infinity_raw):
    from contract.live_beatbox_mp4 import run_live_handoff

    evidence = run_live_handoff(video_path=None)
    assert evidence["beatbox"]["invoked"] is False
    assert evidence["beatbox"]["livePathStatusTag"] == "declared"
    assert evidence["speakers"]["skip"] is True
    assert evidence["speakers"]["statusTag"] == "declared"
    assert evidence["characterId"] == "warrior-anthro-fox-01"
    assert Path(evidence["evidencePath"]).is_file()


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
