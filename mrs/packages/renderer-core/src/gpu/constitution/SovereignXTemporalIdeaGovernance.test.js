/**
 * SX-PTIG tests — continuity ≠ acceptance; activation requires evidence;
 * discard-without-review denied/declared.
 *
 * Run: node --test src/gpu/constitution/SovereignXTemporalIdeaGovernance.test.js
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVITY_STATES,
  GUARANTEES,
  IDEA_EPOCHS,
  LIFECYCLE_MANIFEST,
  ROUTE_DECISIONS,
  SX_PTIG_CAPABILITY,
  classifyIdeaEpoch,
  continuityVsAcceptanceTable,
  evaluateActivationEvidence,
  getTemporalIdeaGovernanceRegistration,
  inspectAcceptanceDecisionShape,
  isContinuityOnlyEpoch,
  routeIdea,
} from "./SovereignXTemporalIdeaGovernance.js";

/** Minimal AcceptanceDecision-shaped object (duck-typed; no crossRuntime import). */
function fakeAcceptDecision(overrides = {}) {
  return {
    schema: "4drs.cross-runtime.acceptance.v1",
    verdict: "accept",
    ok: true,
    enforce: false,
    acceptanceEvidence: {
      id: "ev-pi-conformance-acceptance",
      allRequiredPassed: true,
      verdict: "accept",
    },
    ...overrides,
  };
}

describe("SX-PTIG registration", () => {
  it("exposes capability and Continuity≠Acceptance guarantees", () => {
    const reg = getTemporalIdeaGovernanceRegistration();
    assert.equal(reg.capability, SX_PTIG_CAPABILITY);
    assert.equal(reg.status, "tested");
    const ids = reg.guarantees.map((g) => g.id);
    assert.ok(ids.includes(GUARANTEES.CONTINUITY));
    assert.ok(ids.includes(GUARANTEES.ACCEPTANCE));
    const continuity = reg.guarantees.find((g) => g.id === GUARANTEES.CONTINUITY);
    assert.equal(continuity.impliesAcceptance, false);
  });

  it("marks Substrate/Substration as continuity-only in manifest", () => {
    assert.equal(isContinuityOnlyEpoch(IDEA_EPOCHS.SUBSTRATE), true);
    assert.equal(isContinuityOnlyEpoch(IDEA_EPOCHS.SUBSTRATION), true);
    assert.equal(isContinuityOnlyEpoch(IDEA_EPOCHS.PROMOTION), false);
    assert.equal(isContinuityOnlyEpoch(IDEA_EPOCHS.ACTIVATION), false);
  });

  it("declares system-wide JCK/COS/CER/ERS/RAC framing without inventing expansions", () => {
    const map = LIFECYCLE_MANIFEST.crossSystemLinks.systemWideGuaranteeAcronyms;
    assert.equal(map.status, "declared");
    assert.deepEqual(map.citedTokens, ["JCK", "COS", "CER", "ERS", "RAC"]);
    assert.equal(typeof map.knownExpansionsInRepo.CER, "string");
    assert.equal(map.knownExpansionsInRepo.JCK, undefined);
  });
});

describe("continuity without acceptance", () => {
  it("classifies bare idea as substrate preserved-inactive", () => {
    const c = classifyIdeaEpoch({ id: "idea-1" });
    assert.equal(c.epoch, IDEA_EPOCHS.SUBSTRATE);
    assert.equal(c.activityState, ACTIVITY_STATES.PRESERVED_INACTIVE);
    assert.equal(c.continuity, true);
    assert.equal(c.accepted, false);
    assert.equal(c.continuityOnly, true);
    assert.deepEqual(c.guarantees, [GUARANTEES.CONTINUITY]);
  });

  it("classifies lineage-bound idea as substration still inactive", () => {
    const c = classifyIdeaEpoch({
      id: "idea-2",
      lineage: { derivedFrom: "theory-1" },
      provenance: { recordedBy: "steward" },
    });
    assert.equal(c.epoch, IDEA_EPOCHS.SUBSTRATION);
    assert.equal(c.accepted, false);
    assert.equal(c.activityState, ACTIVITY_STATES.PRESERVED_INACTIVE);
  });

  it("promotion with evidence candidates does not activate", () => {
    const c = classifyIdeaEpoch({
      id: "idea-3",
      evidenceCandidates: [{ kind: "ConformanceReport", ref: "r1" }],
    });
    assert.equal(c.epoch, IDEA_EPOCHS.PROMOTION);
    assert.equal(c.accepted, false);
    assert.ok(c.reasons.includes("acceptance_requires_decision_shape"));
  });

  it("route preserve keeps ContinuityGuarantee only", () => {
    const r = routeIdea({ id: "idea-4", lineage: { a: 1 } }, { action: "preserve" });
    assert.equal(r.decision, ROUTE_DECISIONS.PRESERVE_INACTIVE);
    assert.equal(r.ok, true);
    assert.equal(r.classification.accepted, false);
    assert.deepEqual(r.classification.guarantees, [GUARANTEES.CONTINUITY]);
  });
});

describe("acceptance requires evidence", () => {
  it("evaluateActivationEvidence fails without evidence and decision", () => {
    const e = evaluateActivationEvidence({ id: "idea-5" });
    assert.equal(e.ok, false);
    assert.ok(e.reasons.includes("activation_requires_evidence"));
    assert.ok(e.reasons.includes("acceptance_requires_decision_shape"));
  });

  it("evidence candidates alone cannot activate", () => {
    const r = routeIdea(
      {
        id: "idea-6",
        evidenceCandidates: [{ ref: "ev-1" }],
      },
      { action: "activate" },
    );
    assert.equal(r.ok, false);
    assert.equal(r.decision, ROUTE_DECISIONS.DENY_ACTIVATION);
    assert.equal(r.classification.accepted, false);
    assert.equal(r.classification.activityState, ACTIVITY_STATES.PRESERVED_INACTIVE);
  });

  it("deny AcceptanceDecision shape blocks activation", () => {
    const deny = fakeAcceptDecision({
      verdict: "deny",
      ok: false,
      acceptanceEvidence: { allRequiredPassed: false, verdict: "deny" },
    });
    assert.equal(inspectAcceptanceDecisionShape(deny).ok, false);
    const r = routeIdea(
      {
        id: "idea-7",
        evidenceCandidates: [{ ref: "ev-1" }],
        acceptanceDecision: deny,
      },
      { action: "activate" },
    );
    assert.equal(r.ok, false);
    assert.equal(r.decision, ROUTE_DECISIONS.DENY_ACTIVATION);
  });

  it("accept-shaped decision + evidence activates", () => {
    const accept = fakeAcceptDecision();
    const r = routeIdea(
      {
        id: "idea-8",
        evidenceCandidates: [{ ref: "ev-pi" }],
        acceptanceDecision: accept,
      },
      { action: "activate" },
    );
    assert.equal(r.ok, true);
    assert.equal(r.decision, ROUTE_DECISIONS.ACCEPT_ACTIVATE);
    assert.equal(r.classification.epoch, IDEA_EPOCHS.ACTIVATION);
    assert.equal(r.classification.accepted, true);
    assert.equal(r.classification.activityState, ACTIVITY_STATES.ACCEPTED_ACTIVATED);
    assert.deepEqual(r.classification.guarantees, [
      GUARANTEES.CONTINUITY,
      GUARANTEES.ACCEPTANCE,
    ]);
  });

  it("declared activation epoch without acceptance stays preserved", () => {
    const c = classifyIdeaEpoch({
      id: "idea-9",
      epoch: IDEA_EPOCHS.ACTIVATION,
      evidenceCandidates: [{ ref: "ev" }],
    });
    assert.notEqual(c.epoch, IDEA_EPOCHS.ACTIVATION);
    assert.equal(c.accepted, false);
    assert.ok(c.reasons.includes("declared_activation_denied_without_acceptance"));
  });
});

describe("discard without review", () => {
  it("denies discard when reviewStatus missing (declared heuristic)", () => {
    const r = routeIdea({ id: "idea-10" }, { action: "discard" });
    assert.equal(r.ok, false);
    assert.equal(r.decision, ROUTE_DECISIONS.DENY_DISCARD);
    assert.equal(r.reason, "discard_without_review_denied");
    assert.equal(r.status, "declared");
  });

  it("allows discard path only after reviewed status (still not CKL)", () => {
    const r = routeIdea(
      { id: "idea-11", reviewStatus: "reviewed" },
      { action: "discard" },
    );
    assert.notEqual(r.decision, ROUTE_DECISIONS.DENY_DISCARD);
    assert.equal(r.decision, ROUTE_DECISIONS.PRESERVE_INACTIVE);
  });
});

describe("continuity vs acceptance table", () => {
  it("states that continuity must not imply acceptance", () => {
    const row = continuityVsAcceptanceTable().find(
      (r) => r.dimension === "Implies the other?",
    );
    assert.ok(row.continuity.includes("Must NOT imply acceptance"));
  });
});
