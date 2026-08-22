/**
 * Soft governance invariants for the holographic lab loop (CIEMS lens — Claim A).
 * Status: **partial** — receipt soft checks only; NOT charter / constitution enforcement.
 */

export const CIEMS_HOLOGRAPHY_STATUS = "partial";

export const CIEMS_LENS = Object.freeze({
  BulkSpacetimeEngine: {
    layer: "Implementation",
    role: "physical substrate (bulk)",
    status: "partial",
  },
  HolographicEncoder: {
    layer: "Specification",
    role: "informational representation contract (boundary encode)",
    status: "partial",
  },
  EGT: {
    layer: "Conformance",
    role: "graph dual / time-as-relationships check surface",
    status: "partial",
  },
  EntanglementRenderer: {
    layer: "Stewardship",
    role: "audit visualization of ρ / w / K",
    status: "partial",
  },
  reconstruction: {
    layer: "Stewardship",
    role: "reconstruction error + entanglement health audit metrics",
    status: "partial",
  },
});

/**
 * Invariant: no bulk step without corresponding EGT update in the lab loop.
 * Soft check — returns ok/fail for receipt; does not mutate constitution.
 *
 * @param {{ bulkStepped: boolean, egtUpdated: boolean, egtHashBefore?: string, egtHashAfter?: string }} event
 */
export function checkBulkEgtCoupling(event) {
  const bulkStepped = !!event.bulkStepped;
  const egtUpdated = !!event.egtUpdated;
  let ok = true;
  let code = "ok";
  let message = "bulk↔EGT coupling satisfied or idle";

  if (bulkStepped && !egtUpdated) {
    ok = false;
    code = "bulk-without-egt-update";
    message =
      "Invariant violated: bulk stepped without updateEGT (holographic lab soft check)";
  }

  return {
    id: "inv-bulk-egt-coupling",
    ok,
    code,
    message,
    bulkStepped,
    egtUpdated,
    egtHashBefore: event.egtHashBefore ?? null,
    egtHashAfter: event.egtHashAfter ?? null,
    status: CIEMS_HOLOGRAPHY_STATUS,
  };
}

/**
 * Entanglement health soft metrics for stewardship/audit receipt.
 * @param {object} egt
 */
export function entanglementHealth(egt) {
  let edgeSum = 0;
  let maxW = 0;
  let activeEdges = 0;
  for (const e of egt.edges) {
    edgeSum += e.w_ij;
    if (e.w_ij > maxW) maxW = e.w_ij;
    if (e.w_ij > 0) activeEdges++;
  }
  let maxRho = 0;
  let maxAbsK = 0;
  for (let i = 0; i < egt.rho.length; i++) {
    if (egt.rho[i] > maxRho) maxRho = egt.rho[i];
    const ak = Math.abs(egt.K[i]);
    if (ak > maxAbsK) maxAbsK = ak;
  }
  const healthy = edgeSum > 0 && maxRho > 0;
  return {
    id: "metric-entanglement-health",
    healthy,
    edgeSum,
    maxW,
    activeEdges,
    maxRho,
    maxAbsK,
    nodeCount: egt.nodes.length,
    status: CIEMS_HOLOGRAPHY_STATUS,
  };
}

/**
 * Build governance audit block for holography receipts.
 */
export function buildGovernanceAudit({
  coupling,
  health,
  reconstructionError = null,
  maxRhoPeakDist = null,
}) {
  const checks = [coupling, health].filter(Boolean);
  const allOk = checks.every((c) => c.ok !== false && c.healthy !== false);
  return {
    kind: "holography-ciems-audit",
    status: CIEMS_HOLOGRAPHY_STATUS,
    lens: CIEMS_LENS,
    modes: ["Spacetime", "Holographic", "Governance"],
    invariants: {
      bulkEgtCoupling: coupling,
    },
    metrics: {
      entanglementHealth: health,
      reconstructionError,
      maxRhoPeakDist,
    },
    ok: allOk,
    note: "Soft checks — Claim A lens; not root CHARTER enforcement",
  };
}

/**
 * Lab loop helper: step bulk (optional) then require updateEGT.
 * Used by tests to prove invariant fail when EGT update skipped.
 *
 * @param {{
 *   bulk: { stepBulk?: Function, state?: object },
 *   encoder: { buildEGT: Function, updateEGT: Function },
 *   skipEgtUpdate?: boolean,
 *   stepBulk?: boolean,
 * }} opts
 */
export function runGovernedLabStep(opts) {
  const wantStep = opts.stepBulk !== false;
  let egt = opts.egt || opts.encoder.buildEGT(opts.bulk.state || opts.bulk);
  const egtHashBefore = egt.hash;
  let bulkStepped = false;
  let egtUpdated = false;

  if (wantStep && opts.simulateBulkStep) {
    // Soft-lab simulation — no chamber mutation
    bulkStepped = true;
  } else if (wantStep && typeof opts.bulk.stepBulk === "function") {
    opts.bulk.stepBulk(1);
    bulkStepped = true;
  }

  if (!opts.skipEgtUpdate) {
    egt = opts.encoder.updateEGT(egt, opts.bulk.state || opts.bulk);
    egtUpdated = true;
  }

  const coupling = checkBulkEgtCoupling({
    bulkStepped,
    egtUpdated,
    egtHashBefore,
    egtHashAfter: egt.hash,
  });
  const health = entanglementHealth(egt);
  const audit = buildGovernanceAudit({ coupling, health });

  return { egt, audit, coupling, health };
}
