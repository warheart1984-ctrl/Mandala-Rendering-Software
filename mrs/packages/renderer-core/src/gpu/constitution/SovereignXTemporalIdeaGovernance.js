/**
 * Sovereign X — Temporal Idea Governance (SX-PTIG)
 *
 * Common constitutional lifecycle + two independent guarantees:
 *   ContinuityGuarantee (preservation) ≠ AcceptanceGuarantee (activation)
 *
 * Status (Drive-G-1):
 *   - Epoch classification / route heuristics: **tested**
 *   - System-wide CI-* → JCK/COS/CER/ERS/RAC mapping: **declared** (not enforced)
 *   - Not a CKL deny gate; not full constitutional enforcement of PTIG.
 *
 * Acceptance hooks reference `acceptConformanceReport` decision *shapes* by
 * duck-typing so this module does not import crossRuntime (avoids cycles).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {object} */
export const LIFECYCLE_MANIFEST = Object.freeze(
  JSON.parse(readFileSync(join(__dirname, "lifecycle.json"), "utf8")),
);

export const SX_PTIG_CAPABILITY = "sovereignx.temporal-idea-governance.v1";
export const SX_PTIG_SCHEMA = "sovereignx.temporal-idea-governance.v1";
export const SX_PTIG_VERSION = LIFECYCLE_MANIFEST.version;

/** Idea epochs (order matters for classification). */
export const IDEA_EPOCHS = Object.freeze({
  SUBSTRATE: "substrate",
  SUBSTRATION: "substration",
  PROMOTION: "promotion",
  ACTIVATION: "activation",
});

export const EPOCH_ORDER = Object.freeze([
  IDEA_EPOCHS.SUBSTRATE,
  IDEA_EPOCHS.SUBSTRATION,
  IDEA_EPOCHS.PROMOTION,
  IDEA_EPOCHS.ACTIVATION,
]);

export const GUARANTEES = Object.freeze({
  CONTINUITY: "ContinuityGuarantee",
  ACCEPTANCE: "AcceptanceGuarantee",
});

export const ACTIVITY_STATES = Object.freeze({
  PRESERVED_INACTIVE: "preserved_inactive",
  ACCEPTED_ACTIVATED: "accepted_activated",
});

export const ROUTE_DECISIONS = Object.freeze({
  PRESERVE_INACTIVE: "preserve_inactive",
  ACCEPT_ACTIVATE: "accept_activate",
  DENY_DISCARD: "deny_discard",
  DENY_ACTIVATION: "deny_activation",
});

/**
 * @returns {Readonly<{capability:string,status:string,note:string,version:string,guarantees:readonly object[],epochs:readonly object[]}>}
 */
export function getTemporalIdeaGovernanceRegistration() {
  return Object.freeze({
    capability: SX_PTIG_CAPABILITY,
    schema: SX_PTIG_SCHEMA,
    version: SX_PTIG_VERSION,
    status: "tested",
    note:
      "SX-PTIG epoch classification and continuity≠acceptance routing are unit-tested. " +
      "System-wide CI mapping and CKL enforcement of PTIG are declared only — not claimed here.",
    guarantees: Object.freeze(
      (LIFECYCLE_MANIFEST.guarantees || []).map((g) => Object.freeze({ ...g })),
    ),
    epochs: Object.freeze(
      (LIFECYCLE_MANIFEST.epochs || []).map((e) => Object.freeze({ ...e })),
    ),
    nonClaims: Object.freeze([...(LIFECYCLE_MANIFEST.nonClaims || [])]),
  });
}

/**
 * Continuity epochs: Substrate + Substration (and any continuityOnly epoch).
 * @param {string} epoch
 * @returns {boolean}
 */
export function isContinuityOnlyEpoch(epoch) {
  const meta = (LIFECYCLE_MANIFEST.epochs || []).find((e) => e.id === epoch);
  return meta ? meta.continuityOnly === true : false;
}

/**
 * Duck-typed check for an AcceptanceDecision-like object
 * (compatible with acceptConformanceReport return shape).
 *
 * @param {unknown} decision
 * @returns {{ok:boolean, verdict:string|null, allRequiredPassed:boolean|null, reason:string|null}}
 */
export function inspectAcceptanceDecisionShape(decision) {
  if (!decision || typeof decision !== "object") {
    return {
      ok: false,
      verdict: null,
      allRequiredPassed: null,
      reason: "missing_acceptance_decision",
    };
  }
  const d = /** @type {Record<string, unknown>} */ (decision);
  const verdict = typeof d.verdict === "string" ? d.verdict : null;
  const evidence = d.acceptanceEvidence;
  let allRequiredPassed = null;
  if (evidence && typeof evidence === "object") {
    const ev = /** @type {Record<string, unknown>} */ (evidence);
    if (typeof ev.allRequiredPassed === "boolean") {
      allRequiredPassed = ev.allRequiredPassed;
    }
  }
  if (allRequiredPassed === null && typeof d.ok === "boolean") {
    allRequiredPassed = d.ok;
  }
  const accept =
    verdict === "accept" && (d.ok === true || allRequiredPassed === true);
  return {
    ok: accept,
    verdict,
    allRequiredPassed,
    reason: accept ? null : "acceptance_criteria_unmet",
  };
}

/**
 * Evidence predicates for activation (no hard import of crossRuntime).
 *
 * Requires both (1) some evidence material and (2) an AcceptanceDecision-shaped
 * payload whose verdict is accept (soft or enforce — duck-typed).
 *
 * @param {object} idea
 * @param {{acceptanceDecision?: unknown}} [opts]
 * @returns {{ok:boolean, reasons:string[]}}
 */
export function evaluateActivationEvidence(idea, opts = {}) {
  const reasons = [];
  const acceptanceDecision =
    opts.acceptanceDecision ?? idea?.acceptanceDecision ?? null;

  const evidenceCandidates = Array.isArray(idea?.evidenceCandidates)
    ? idea.evidenceCandidates
    : [];
  const hasEvidence =
    evidenceCandidates.length > 0 ||
    idea?.evidence != null ||
    idea?.conformanceReport != null ||
    (acceptanceDecision != null &&
      typeof acceptanceDecision === "object" &&
      /** @type {Record<string, unknown>} */ (acceptanceDecision)
        .acceptanceEvidence != null);

  if (!hasEvidence) {
    reasons.push("activation_requires_evidence");
  }

  if (acceptanceDecision == null) {
    reasons.push("acceptance_requires_decision_shape");
  } else {
    const shape = inspectAcceptanceDecisionShape(acceptanceDecision);
    if (!shape.ok) {
      reasons.push(shape.reason || "acceptance_criteria_unmet");
    }
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * Classify which epoch an idea currently occupies.
 *
 * Heuristic (tested, not CKL-enforced):
 * - activation only when acceptance criteria pass
 * - promotion when evidence candidates exist but not activated
 * - substration when lineage/provenance bound
 * - otherwise substrate
 *
 * @param {object} idea
 * @param {{acceptanceDecision?: unknown}} [opts]
 * @returns {{
 *   epoch: string,
 *   activityState: string,
 *   continuity: boolean,
 *   accepted: boolean,
 *   continuityOnly: boolean,
 *   reasons: string[],
 *   status: 'tested'
 * }}
 */
export function classifyIdeaEpoch(idea, opts = {}) {
  const reasons = [];
  const id = idea?.id ?? idea?.ideaId ?? null;
  if (id == null || id === "") {
    reasons.push("missing_idea_identity");
  }

  const declaredEpoch =
    typeof idea?.epoch === "string" ? idea.epoch : null;
  if (declaredEpoch && !EPOCH_ORDER.includes(declaredEpoch)) {
    reasons.push(`unknown_epoch:${declaredEpoch}`);
  }

  const hasLineage =
    idea?.lineage != null ||
    idea?.provenance != null ||
    idea?.derivedFrom != null ||
    idea?.contentHash != null;

  const evidenceCandidates = Array.isArray(idea?.evidenceCandidates)
    ? idea.evidenceCandidates
    : [];
  const hasEvidenceCandidates =
    evidenceCandidates.length > 0 ||
    idea?.evidence != null ||
    idea?.conformanceReport != null;

  const acceptanceDecision =
    opts.acceptanceDecision ?? idea?.acceptanceDecision ?? null;
  const activationEval = evaluateActivationEvidence(idea || {}, {
    acceptanceDecision,
  });

  // Evidence material for promotion (candidates or nested decision evidence).
  const hasPromotionMaterial =
    hasEvidenceCandidates ||
    (acceptanceDecision != null &&
      typeof acceptanceDecision === "object" &&
      /** @type {Record<string, unknown>} */ (acceptanceDecision)
        .acceptanceEvidence != null);

  let epoch = IDEA_EPOCHS.SUBSTRATE;
  if (activationEval.ok) {
    epoch = IDEA_EPOCHS.ACTIVATION;
  } else if (hasPromotionMaterial) {
    epoch = IDEA_EPOCHS.PROMOTION;
    reasons.push(...activationEval.reasons);
  } else if (hasLineage) {
    epoch = IDEA_EPOCHS.SUBSTRATION;
  }

  // Explicit epoch may lower-bound classification but cannot skip acceptance.
  if (declaredEpoch === IDEA_EPOCHS.ACTIVATION && !activationEval.ok) {
    epoch = hasEvidenceCandidates
      ? IDEA_EPOCHS.PROMOTION
      : hasLineage
        ? IDEA_EPOCHS.SUBSTRATION
        : IDEA_EPOCHS.SUBSTRATE;
    reasons.push("declared_activation_denied_without_acceptance");
  } else if (
    declaredEpoch &&
    EPOCH_ORDER.includes(declaredEpoch) &&
    EPOCH_ORDER.indexOf(declaredEpoch) < EPOCH_ORDER.indexOf(epoch)
  ) {
    // Allow explicit earlier epoch to stick (operator demotion / hold).
    epoch = declaredEpoch;
  }

  const continuityOnly = isContinuityOnlyEpoch(epoch);
  const accepted = epoch === IDEA_EPOCHS.ACTIVATION && activationEval.ok;
  const activityState = accepted
    ? ACTIVITY_STATES.ACCEPTED_ACTIVATED
    : ACTIVITY_STATES.PRESERVED_INACTIVE;

  return Object.freeze({
    epoch,
    activityState,
    continuity: true,
    accepted,
    continuityOnly,
    reasons: Object.freeze([...new Set(reasons)]),
    status: /** @type {const} */ ("tested"),
    guarantees: Object.freeze(
      accepted
        ? [GUARANTEES.CONTINUITY, GUARANTEES.ACCEPTANCE]
        : [GUARANTEES.CONTINUITY],
    ),
  });
}

/**
 * Route an idea action under PTIG rules.
 *
 * @param {object} idea
 * @param {{
 *   action?: 'preserve'|'promote'|'activate'|'discard'|'review',
 *   acceptanceDecision?: unknown,
 *   reviewStatus?: string,
 * }} [opts]
 * @returns {Readonly<object>}
 */
export function routeIdea(idea, opts = {}) {
  const action = opts.action || "preserve";
  const reviewStatus =
    opts.reviewStatus ?? idea?.reviewStatus ?? null;

  if (action === "discard") {
    const reviewed =
      reviewStatus === "reviewed" ||
      reviewStatus === "approved" ||
      reviewStatus === "audit_complete";
    if (!reviewed) {
      return Object.freeze({
        schema: SX_PTIG_SCHEMA,
        decision: ROUTE_DECISIONS.DENY_DISCARD,
        ok: false,
        action,
        reason: "discard_without_review_denied",
        status: /** @type {const} */ ("declared"),
        classification: classifyIdeaEpoch(idea, opts),
        note:
          "Discard without review is denied/declared by SX-PTIG heuristic; " +
          "not wired into engine default.policies.json.",
      });
    }
  }

  const classification = classifyIdeaEpoch(idea, opts);

  if (action === "activate") {
    const activationEval = evaluateActivationEvidence(idea || {}, {
      acceptanceDecision: opts.acceptanceDecision ?? idea?.acceptanceDecision,
    });
    if (!activationEval.ok) {
      return Object.freeze({
        schema: SX_PTIG_SCHEMA,
        decision: ROUTE_DECISIONS.DENY_ACTIVATION,
        ok: false,
        action,
        reasons: Object.freeze([...activationEval.reasons]),
        status: /** @type {const} */ ("tested"),
        classification: Object.freeze({
          ...classification,
          epoch:
            classification.epoch === IDEA_EPOCHS.ACTIVATION
              ? IDEA_EPOCHS.PROMOTION
              : classification.epoch,
          accepted: false,
          activityState: ACTIVITY_STATES.PRESERVED_INACTIVE,
        }),
        note:
          "AcceptanceGuarantee requires evidence + AcceptanceDecision-shaped criteria. " +
          "Idea remains preserved-inactive (ContinuityGuarantee only).",
      });
    }
    return Object.freeze({
      schema: SX_PTIG_SCHEMA,
      decision: ROUTE_DECISIONS.ACCEPT_ACTIVATE,
      ok: true,
      action,
      status: /** @type {const} */ ("tested"),
      classification: Object.freeze({
        ...classification,
        epoch: IDEA_EPOCHS.ACTIVATION,
        accepted: true,
        activityState: ACTIVITY_STATES.ACCEPTED_ACTIVATED,
        continuityOnly: false,
        guarantees: Object.freeze([
          GUARANTEES.CONTINUITY,
          GUARANTEES.ACCEPTANCE,
        ]),
      }),
    });
  }

  // preserve / promote / review → continuity without implying acceptance
  return Object.freeze({
    schema: SX_PTIG_SCHEMA,
    decision: ROUTE_DECISIONS.PRESERVE_INACTIVE,
    ok: true,
    action,
    status: /** @type {const} */ ("tested"),
    classification: Object.freeze({
      ...classification,
      accepted: false,
      activityState: ACTIVITY_STATES.PRESERVED_INACTIVE,
      guarantees: Object.freeze([GUARANTEES.CONTINUITY]),
    }),
    note:
      action === "promote"
        ? "Promotion attaches evidence candidates only; ContinuityGuarantee does not imply AcceptanceGuarantee."
        : "Preserved inactive under ContinuityGuarantee.",
  });
}

/**
 * Continuity vs Acceptance comparison table (for docs/tests).
 * @returns {readonly object[]}
 */
export function continuityVsAcceptanceTable() {
  return Object.freeze([
    Object.freeze({
      dimension: "Purpose",
      continuity: "Preserve identity, lineage, provenance, context",
      acceptance: "Activate as constitutional artifact",
    }),
    Object.freeze({
      dimension: "Inactive ideas",
      continuity: "Allowed indefinitely",
      acceptance: "Not activated",
    }),
    Object.freeze({
      dimension: "Evidence",
      continuity: "Optional (promotion may attach candidates)",
      acceptance: "Required (predicates + AcceptanceDecision shape)",
    }),
    Object.freeze({
      dimension: "Epochs",
      continuity: "Substrate, Substration (+ preserved after Promotion)",
      acceptance: "Activation only",
    }),
    Object.freeze({
      dimension: "Implies the other?",
      continuity: "Must NOT imply acceptance",
      acceptance: "Presupposes continuity (identity retained)",
    }),
    Object.freeze({
      dimension: "Status (Drive-G-1)",
      continuity: "declared model; route heuristic tested",
      acceptance: "declared model; evidence gate heuristic tested",
    }),
  ]);
}
