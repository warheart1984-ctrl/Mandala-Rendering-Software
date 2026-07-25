"""CI-001..CI-006 and full-lineage checks."""

from __future__ import annotations

import copy

import pytest

from cros.artifacts import CreativeIntent, ProgressEvent, seal
from cros.evidence import EvidenceError, build_evidence, build_unverified_replay_record
from cros.resources import load_invariants
from cros.validation import (
    check_ci001_intent_immutable,
    check_ci002_planning_derived,
    check_ci003_execution_observable,
    check_ci004_evidence_before_completion,
    check_ci005_replayability,
    check_ci006_adapter_isolation,
    validate_lineage,
)
from conftest import build_gen_ai_lineage


def test_constitution_declares_six_invariants():
    data = load_invariants()
    ids = [i["id"] for i in data["invariants"]]
    assert ids == ["CI-001", "CI-002", "CI-003", "CI-004", "CI-005", "CI-006"]
    assert data["runtimeStatus"] == "absent"
    for inv in data["invariants"]:
        assert inv["status"] in {"partial", "declared", "skeleton"}
        assert inv["status"] != "enforced", "scaffold must not claim enforcement"


def test_ci001_body_change_yields_new_hash():
    a = CreativeIntent(
        id="ci-a",
        author="op",
        brief="first",
        profile="cros.gen-ai-nim",
        created_at="2026-07-24T21:00:00+00:00",
    ).to_dict()
    b = CreativeIntent(
        id="ci-a",
        author="op",
        brief="second",  # body change
        profile="cros.gen-ai-nim",
        created_at="2026-07-24T21:00:00+00:00",
    ).to_dict()
    result = check_ci001_intent_immutable(original=a, candidate=b)
    assert result.ok
    assert a["contentHash"] != b["contentHash"]


def test_ci001_detects_hash_theatre():
    """A body edit that keeps the old contentHash must fail CI-001."""
    a = CreativeIntent(
        id="ci-a",
        author="op",
        brief="first",
        profile="cros.gen-ai-nim",
        created_at="2026-07-24T21:00:00+00:00",
    ).to_dict()
    forged = dict(a)
    forged["brief"] = "tampered"
    # Keep the old hash on purpose — this is the failure mode CI-001 exists to catch.
    result = check_ci001_intent_immutable(original=a, candidate=forged)
    assert not result.ok


def test_ci002_plan_stays_within_capabilities(gen_ai_capabilities):
    lineage = build_gen_ai_lineage(capabilities=gen_ai_capabilities)
    result = check_ci002_planning_derived(
        lineage["RenderPlan"],
        lineage["RenderIntent"],
        declared_capabilities=gen_ai_capabilities.capability_names,
    )
    assert result.ok


def test_ci002_rejects_capability_overreach(gen_ai_capabilities):
    lineage = build_gen_ai_lineage(capabilities=gen_ai_capabilities)
    plan = copy.deepcopy(lineage["RenderPlan"])
    plan["steps"][0]["requiresCapabilities"] = ["gen.submit", "farm.distribute"]
    plan = seal(plan)
    result = check_ci002_planning_derived(
        plan,
        lineage["RenderIntent"],
        declared_capabilities=gen_ai_capabilities.capability_names,
    )
    assert not result.ok
    assert any("farm.distribute" in f for f in result.findings)


def test_ci003_requires_progress_and_monotonicity():
    lineage = build_gen_ai_lineage()
    assert check_ci003_execution_observable(lineage["RenderExecution"]).ok

    bad = dict(lineage["RenderExecution"])
    bad["progressEvents"] = [
        ProgressEvent(phase="a", fraction=0.5).to_dict(),
        ProgressEvent(phase="b", fraction=0.2).to_dict(),  # regression
    ]
    bad = seal(bad)
    assert not check_ci003_execution_observable(bad).ok


def test_ci003_rejects_empty_progress():
    lineage = build_gen_ai_lineage()
    # Bypass schema: construct an execution-like dict with no events, then seal.
    # Schema itself requires minItems=1; the check must also catch it.
    body = {
        k: v
        for k, v in lineage["RenderExecution"].items()
        if k != "contentHash"
    }
    body["progressEvents"] = []
    # Don't schema-validate — CI-003 is the check under test.
    sealed = seal(body)
    assert not check_ci003_execution_observable(sealed).ok


def test_ci004_blocks_delivery_without_evidence():
    lineage = build_gen_ai_lineage()
    result = lineage["RenderResult"]
    assert check_ci004_evidence_before_completion(
        result=result, evidence=None, delivered=False
    ).ok
    assert not check_ci004_evidence_before_completion(
        result=result, evidence=None, delivered=True
    ).ok
    assert check_ci004_evidence_before_completion(
        result=result, evidence=lineage["RenderEvidence"], delivered=True
    ).ok


def test_ci005_accepts_provider_contract_under_gen_ai():
    lineage = build_gen_ai_lineage()
    assert check_ci005_replayability(
        evidence_or_record=lineage["RenderEvidence"]
    ).ok
    record = build_unverified_replay_record(lineage["RenderEvidence"])
    assert check_ci005_replayability(evidence_or_record=record).ok
    assert record["verdict"] == "unverified"


def test_ci005_rejects_bit_identical_under_gen_ai():
    lineage = build_gen_ai_lineage()
    with pytest.raises(EvidenceError, match="bit-identical"):
        build_evidence(
            result=lineage["RenderResult"],
            execution=lineage["RenderExecution"],
            plan=lineage["RenderPlan"],
            render_intent=lineage["RenderIntent"],
            creative_intent=lineage["CreativeIntent"],
            replay_inputs=lineage["RenderEvidence"]["replay"]["inputs"],
            replay_class="bit-identical",
        )


def test_ci006_package_is_isolated():
    result = check_ci006_adapter_isolation()
    assert result.ok, result.findings


def test_validate_lineage_intact():
    lineage = build_gen_ai_lineage()
    result = validate_lineage(lineage)
    assert result.ok, result.findings


def test_validate_lineage_detects_skip():
    lineage = build_gen_ai_lineage()
    broken = {k: v for k, v in lineage.items() if k != "RenderExecution"}
    result = validate_lineage(broken)
    assert not result.ok
    assert any("RenderExecution" in f for f in result.findings)


def test_validate_lineage_detects_hash_tamper():
    lineage = build_gen_ai_lineage()
    tampered = dict(lineage["RenderIntent"])
    tampered["prompt"] = "quietly altered"
    # Re-seal so the intent's own hash is consistent, but the plan still cites
    # the OLD hash — that is the skip/tamper signature.
    tampered = seal(tampered)
    chain = dict(lineage)
    chain["RenderIntent"] = tampered
    result = validate_lineage(chain)
    assert not result.ok
    assert any("renderIntentHash" in f for f in result.findings)
