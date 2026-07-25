"""cros.gen-ai-nim profile honesty: provider-contract only, no bit-identical claim."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cros.bridge import BridgeError, evidence_from_genblaze_manifest
from cros.evidence import EvidenceError, build_evidence, build_unverified_replay_record
from cros.planning import UnsupportedProfileError, derive_plan
from cros.resources import load_profile
from cros.validation import check_ci005_replayability
from conftest import build_gen_ai_lineage


def test_gen_ai_profile_file_loads(package_root: Path):
    path = package_root / "profiles" / "cros.gen-ai-nim.json"
    assert path.is_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["profileId"] == "cros.gen-ai-nim"
    assert data["status"] == "skeleton"


def test_gen_ai_profile_forbids_bit_identical_replay():
    profile = load_profile("cros.gen-ai-nim")
    allowed = profile["replay"]["allowedClasses"]
    assert allowed == ["provider-contract"]
    assert "bit-identical" in profile["replay"]["forbiddenClasses"]
    assert "deterministic-parameters" in profile["replay"]["forbiddenClasses"]
    claim = profile["replay"]["claim"].lower()
    assert "pixel equality is not asserted" in claim or "not asserted" in claim
    assert "frame-exact" in claim or "frame-exact reproduction is not claimed" in claim


def test_dcc_offline_profile_is_declared_only(package_root: Path):
    profile = load_profile("cros.dcc-offline")
    assert profile["status"] == "declared"
    assert "bit-identical" in profile["replay"]["allowedClasses"]
    # Every requirement must be tagged declared — no silent "enforced".
    for req in profile["requirements"]:
        assert req["status"] == "declared", req["id"]
    # No adapter name may appear as if implemented.
    text = (package_root / "profiles" / "cros.dcc-offline.json").read_text(encoding="utf-8")
    lowered = text.lower()
    assert "no cycles" in lowered and "arnold" in lowered


def test_dcc_offline_planner_raises(gen_ai_capabilities):
    # Build a minimal offline-shaped intent by rewriting a gen-ai one — but the
    # planner must refuse before any work happens. Use a sealed CreativeIntent
    # path only through planning on a hand-built intent would be heavy; instead
    # call derive_plan with a profile the adapter doesn't declare, AND with a
    # properly sealed offline intent via a direct UnsupportedProfileError path.
    from cros.artifacts import CreativeIntent, RenderIntent

    creative = CreativeIntent(
        id="ci-offline",
        author="td",
        brief="hero still",
        profile="cros.dcc-offline",
        created_at="2026-07-24T21:00:00+00:00",
    ).to_dict()
    intent = RenderIntent(
        id="ri-offline",
        profile="cros.dcc-offline",
        derived_from=creative["id"],
        creative_intent_hash=creative["contentHash"],
        target={"modality": "image", "width": 1920, "height": 1080},
        created_at="2026-07-24T21:00:00+00:00",
        color_space="ACES",
    ).to_dict()

    # Adapter that claims the offline profile but still has no planner behind it.
    from cros.adapter import AdapterCapabilities, AdapterRef

    caps = AdapterCapabilities(
        adapter=AdapterRef("cros.test.offline-stub", "0.0.0"),
        profiles=("cros.dcc-offline",),
        modality=("image",),
        capability_names=("pathtrace",),
    )
    with pytest.raises(UnsupportedProfileError, match="declared, not implemented"):
        derive_plan(intent, caps)


def test_gen_ai_evidence_requires_seed_key_even_when_null():
    lineage = build_gen_ai_lineage(include_seed=True, seed=None)
    # seed: null is present — must succeed.
    assert lineage["RenderEvidence"]["replay"]["inputs"]["seed"] is None
    assert check_ci005_replayability(
        evidence_or_record=lineage["RenderEvidence"]
    ).ok


def test_gen_ai_evidence_rejects_missing_model_id():
    lineage = build_gen_ai_lineage()
    bad_inputs = dict(lineage["RenderEvidence"]["replay"]["inputs"])
    bad_inputs["model"] = {}  # missing id
    with pytest.raises(EvidenceError, match=r"requires evidence fields|replay\.inputs\.model\.id"):
        build_evidence(
            result=lineage["RenderResult"],
            execution=lineage["RenderExecution"],
            plan=lineage["RenderPlan"],
            render_intent=lineage["RenderIntent"],
            creative_intent=lineage["CreativeIntent"],
            replay_inputs=bad_inputs,
        )


def test_bridge_maps_genblaze_shaped_manifest():
    manifest = {
        "run_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "prompt": "a matte painting of a clifford torus",
        "model": "black-forest-labs/flux.1-schnell",
        "provider": "nvidia-image",
        "asset_sha256": "a" * 64,
        "asset_key": "mrs/genblaze/dry-run/aaaaaaaa/concept.png",
        "created_at": "2026-07-24T21:00:00+00:00",
        "modality": "image",
        "dry_run": True,
        "seed": None,
    }
    evidence = evidence_from_genblaze_manifest(manifest)
    assert evidence["kind"] == "RenderEvidence"
    assert evidence["profile"] == "cros.gen-ai-nim"
    assert evidence["replay"]["replayClass"] == "provider-contract"
    assert evidence["replay"]["inputs"]["model"]["id"] == manifest["model"]
    assert evidence["replay"]["inputs"]["seed"] is None
    assert evidence["assets"][0]["sha256"] == "a" * 64
    # Bridge must disclose that request id was synthesised when absent.
    assert evidence["manifest"]["synthesisedProviderRequestId"] is True
    assert check_ci005_replayability(evidence_or_record=evidence).ok
    record = build_unverified_replay_record(evidence)
    assert record["verdict"] == "unverified"


def test_bridge_rejects_incomplete_manifest():
    with pytest.raises(BridgeError):
        evidence_from_genblaze_manifest({"run_id": "x"})


def test_gen_ai_claim_text_travels_with_evidence():
    lineage = build_gen_ai_lineage()
    claim = lineage["RenderEvidence"]["replay"]["claim"].lower()
    assert "provider" in claim
    assert "not" in claim  # "NOT asserted" / "not claimed"
