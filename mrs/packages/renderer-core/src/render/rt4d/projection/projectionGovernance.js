/**
 * ProjCC projection governance filter (non-protected CKL-style hook).
 *
 * Prefer this over editing default.policies.json unless a matching runtime
 * policy row is authorized. Attaches provenance for observation projection ops
 * and denies projection without PCC metadata when requirePccMetadata is set.
 *
 * SoT honesty: does not elevate aperture to print. printSoT always false.
 * Status: partial — unit-tested filter; not charter/default.policies enforced.
 */

export const PROJECTION_GOVERNANCE_STATUS = /** @type {const} */ ("partial");

export const PROJECTION_GOVERNANCE_BANNER =
  "Governed observation aperture — assist/preview only; CPU RT4D print remains SoT. Aperture ≠ print.";

export const POLICY_PROJECTION_REQUIRES_PCC = Object.freeze({
  id: "policy-projection-requires-pcc-metadata",
  scope: "projection",
  condition: "observe_projection_or_project_4d",
  rule: "deny_if_missing_pcc_metadata",
  severity: "high",
  status: "partial",
  message:
    "Observation projection requires PCC metadata (modeId/state); aperture ≠ print SoT.",
});

export const POLICY_PROJECTION_ATTACH_PROVENANCE = Object.freeze({
  id: "policy-projection-attach-provenance",
  scope: "projection",
  condition: "observe_projection_or_project_4d",
  rule: "attach_provenance",
  severity: "high",
  status: "partial",
  message:
    "Attach provenance for observation projection ops; does not grant print authority.",
});

/**
 * @param {object|null|undefined} intent
 * @returns {boolean}
 */
export function isProjectionIntent(intent) {
  const action = intent?.action ?? intent?.type ?? null;
  if (
    action === "observe_projection" ||
    action === "project_4d" ||
    action === "projcc_evaluate"
  ) {
    return true;
  }
  return Boolean(intent?.projection || intent?.observationProjection);
}

/**
 * @param {object|null|undefined} intent
 * @param {object|null|undefined} evidence
 * @returns {boolean}
 */
export function hasPccMetadata(intent, evidence) {
  const meta =
    intent?.pcc ??
    intent?.projection ??
    intent?.observationProjection ??
    evidence?.pcc ??
    evidence?.projection ??
    null;
  if (!meta || typeof meta !== "object") return false;
  if (meta.modeId || meta.state?.modeId) return true;
  if (meta.theta != null || meta.kappa != null) return true;
  return Boolean(meta.kernel || meta.aperture);
}

/**
 * Evaluate projection governance (CKL-style, package-local).
 *
 * @param {object|null} intent
 * @param {object|null} [evidence]
 * @param {{ requirePccMetadata?: boolean }} [opts]
 * @returns {{
 *   allow: boolean,
 *   deny: boolean,
 *   attachProvenance: boolean,
 *   status: string,
 *   printSoT: false,
 *   authority: "observation",
 *   policiesApplied: string[],
 *   reason: string,
 *   banner: string,
 *   provenance?: object,
 * }}
 */
export function evaluateProjectionGovernance(intent, evidence = null, opts = {}) {
  const requirePcc = opts.requirePccMetadata !== false;
  const policiesApplied = [];

  if (!isProjectionIntent(intent)) {
    return {
      allow: true,
      deny: false,
      attachProvenance: false,
      status: PROJECTION_GOVERNANCE_STATUS,
      printSoT: false,
      authority: "observation",
      policiesApplied,
      reason: "not a projection intent — filter no-ops",
      banner: PROJECTION_GOVERNANCE_BANNER,
    };
  }

  if (requirePcc && !hasPccMetadata(intent, evidence)) {
    policiesApplied.push(POLICY_PROJECTION_REQUIRES_PCC.id);
    return {
      allow: false,
      deny: true,
      attachProvenance: false,
      status: PROJECTION_GOVERNANCE_STATUS,
      printSoT: false,
      authority: "observation",
      policiesApplied,
      reason: POLICY_PROJECTION_REQUIRES_PCC.message,
      banner: PROJECTION_GOVERNANCE_BANNER,
    };
  }

  policiesApplied.push(POLICY_PROJECTION_ATTACH_PROVENANCE.id);
  const provenance = Object.freeze({
    intentId: intent?.id ?? null,
    modeId:
      intent?.pcc?.modeId ??
      intent?.projection?.modeId ??
      intent?.observationProjection?.modeId ??
      evidence?.pcc?.modeId ??
      null,
    printSoT: false,
    authority: "observation",
    banner: PROJECTION_GOVERNANCE_BANNER,
    attachedBy: POLICY_PROJECTION_ATTACH_PROVENANCE.id,
  });

  return {
    allow: true,
    deny: false,
    attachProvenance: true,
    status: PROJECTION_GOVERNANCE_STATUS,
    printSoT: false,
    authority: "observation",
    policiesApplied,
    reason: POLICY_PROJECTION_ATTACH_PROVENANCE.message,
    banner: PROJECTION_GOVERNANCE_BANNER,
    provenance,
  };
}
