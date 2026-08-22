/**
 * CIEMS governance coordinates on rig/skin nodes (Claim A lens).
 *
 * GovernanceCoord { intent, evidence, conformance, stewardship } ∈ [0,1]
 * Frame aggregate → mean I,E,C,S stored in receipt as soft constitutional record.
 *
 * Links: docs/mandala/HOLOGRAPHIC_CIEMS.md
 * Reuses CIEMS_LENS vocabulary from mandala/holography/ciems-lab.mjs.
 * Status: **partial** — audit receipt only; NOT CHARTER / AGENTS enforcement.
 */

import { createHash } from "node:crypto";
import {
  CIEMS_HOLOGRAPHY_STATUS,
  CIEMS_LENS,
  entanglementHealth,
} from "../../mandala/holography/ciems-lab.mjs";
import {
  buildRigNodes,
  defaultGovernanceCoord,
  hashRigNodes,
  RIG_NODE_STATUS,
} from "./rig-node.mjs";

export const RIG_CIEMS_STATUS = "partial";
export const RIG_CIEMS_CLAIM =
  "Per-node CIEMS governance coords + frame aggregates — soft audit, not charter enforcement";

export { CIEMS_HOLOGRAPHY_STATUS, CIEMS_LENS, defaultGovernanceCoord };

/**
 * Score per-node GovernanceCoord from local EGT state (soft heuristics).
 *
 * intent      — coupling / |E| (action locality)
 * evidence    — ρ stress proxy (observable density)
 * conformance — |K| regularity (curvature within expected band)
 * stewardship — layerMuscle + edge health contribution
 */
export function scoreGovernanceCoord(egt, i, opts = {}) {
  const eNorm = egt.nodes[i]?.E_norm ?? egt.E_norms?.[i] ?? 0;
  const rho = egt.rho?.[i] ?? 0;
  const kAbs = Math.abs(egt.K?.[i] || 0);
  const layerMuscle =
    egt.nodes[i]?.layerMuscle ?? egt.layers?.muscle?.[i] ?? 0.3;
  // Conformance: mid-range |K| preferred (not zero, not extreme)
  const conf =
    0.35 +
    0.45 * Math.exp(-((kAbs - 0.15) ** 2) / (2 * 0.2 ** 2)) +
    0.1 * Math.min(1, eNorm);

  return defaultGovernanceCoord({
    intent: 0.25 + 0.7 * (eNorm / (1 + eNorm)),
    evidence: 0.2 + 0.75 * Math.min(1, rho),
    conformance: Math.max(0, Math.min(1, conf)),
    stewardship: 0.3 + 0.5 * layerMuscle + 0.15 * Math.min(1, eNorm / (1 + eNorm)),
    ...opts.override,
  });
}

/**
 * Attach / refresh gov coords on all nodes (requires RigNodes or builds them).
 */
export function attachGovernanceCoords(egt, opts = {}) {
  if (!egt.rigNodes) {
    buildRigNodes(egt, { mutate: true, gov: opts.gov });
  }
  const n = egt.nodes.length;
  for (let i = 0; i < n; i++) {
    const gov = scoreGovernanceCoord(egt, i, opts);
    egt.nodes[i].gov = gov;
    if (egt.rigNodes?.[i]) egt.rigNodes[i].gov = gov;
  }
  egt.rigCiemsStatus = RIG_CIEMS_STATUS;
  return egt;
}

/**
 * Frame aggregate means of I,E,C,S over nodes (optionally belly subset).
 *
 * @returns {{ intent: number, evidence: number, conformance: number, stewardship: number, count: number }}
 */
export function aggregateGovernance(egt, opts = {}) {
  const ids = opts.vertexIds
    ? opts.vertexIds
    : Array.from({ length: egt.nodes.length }, (_, i) => i);
  let I = 0;
  let E = 0;
  let C = 0;
  let S = 0;
  let count = 0;
  for (const i of ids) {
    const g = egt.nodes[i]?.gov;
    if (!g) continue;
    I += g.intent;
    E += g.evidence;
    C += g.conformance;
    S += g.stewardship;
    count++;
  }
  if (!count) {
    return { intent: 0, evidence: 0, conformance: 0, stewardship: 0, count: 0 };
  }
  return {
    intent: I / count,
    evidence: E / count,
    conformance: C / count,
    stewardship: S / count,
    count,
  };
}

/**
 * Build receipt block: constitutional soft record for a frame / demo.
 */
export function buildRigGovernanceReceipt(egt, opts = {}) {
  attachGovernanceCoords(egt, opts);
  const frame = aggregateGovernance(egt, opts);
  const health = entanglementHealth(egt);
  const rigHash = egt.rigNodes ? hashRigNodes(egt.rigNodes) : null;

  let meanE = 0;
  let maxE = 0;
  const norms = egt.E_norms;
  if (norms) {
    for (let i = 0; i < norms.length; i++) {
      meanE += norms[i];
      if (norms[i] > maxE) maxE = norms[i];
    }
    meanE /= norms.length || 1;
  }

  const fingerprint = createHash("sha256")
    .update("character.holography.rig-ciems.v1")
    .update(
      `${frame.intent.toFixed(6)},${frame.evidence.toFixed(6)},${frame.conformance.toFixed(6)},${frame.stewardship.toFixed(6)}`,
    )
    .update(rigHash || "")
    .digest("hex");

  return {
    kind: "rig-ciems-governance-receipt",
    status: RIG_CIEMS_STATUS,
    claim: RIG_CIEMS_CLAIM,
    note:
      "Partial audit record — CIEMS lens (intent/evidence/conformance/stewardship). Not CHARTER enforcement; not constitutional holographic organism arena.",
    docs: "docs/mandala/HOLOGRAPHIC_CIEMS.md",
    lens: CIEMS_LENS,
    holographyCiemsStatus: CIEMS_HOLOGRAPHY_STATUS,
    rigNodeStatus: RIG_NODE_STATUS,
    frameGovernance: {
      I: frame.intent,
      E: frame.evidence,
      C: frame.conformance,
      S: frame.stewardship,
      means: frame,
    },
    entanglement: {
      meanE_norm: meanE,
      maxE_norm: maxE,
      health,
    },
    fingerprint,
    tags: {
      rigCiems: RIG_CIEMS_STATUS,
      charterEnforced: false,
      organismArena: "declared", // not claimed enforced
    },
  };
}

/**
 * Full enrich: RigNodes + gov + receipt.
 */
export function enrichWithRigCiems(egt, opts = {}) {
  buildRigNodes(egt, { mutate: true, gov: opts.gov });
  attachGovernanceCoords(egt, opts);
  const receipt = buildRigGovernanceReceipt(egt, opts);
  egt.governanceReceipt = receipt;
  return { egt, receipt };
}
