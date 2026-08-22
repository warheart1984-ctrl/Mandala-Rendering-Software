/**
 * CharacterHolographicRig — facade over RigNode + governance (partial).
 * Not a second character organ; wraps character/holography rig-node.
 *
 * update() writes typed arrays matching holographic.vert attributes:
 *   entanglementDensity, entanglementDirection, curvature,
 *   entanglementWeight, governance, baseNormal, position
 *
 * THREE is optional — toThreeGeometry(THREE) is a host adapter only.
 */

import { buildRigNodes, defaultGovernanceCoord } from "./rig-node.mjs";
import { attachGovernanceCoords, aggregateGovernance } from "./rig-ciems.mjs";

export const HOLO_RIG_STATUS = "partial";
export const HOLO_RIG_BUFFERS_STATUS = "partial";
/** Sparse pack skip threshold (partial). Full node count kept for bone/joint slots. */
export const HOLO_VACUUM_RHO = 0.05;

const ATTR = Object.freeze([
  "position",
  "entanglementDensity",
  "entanglementDirection",
  "curvature",
  "entanglementWeight",
  "governance",
  "baseNormal",
]);

/**
 * Pack shader-bound Float32Arrays from RigNodes + EGT.
 * entanglementDensity=ρ, entanglementDirection=d̂ of E_i, curvature=K,
 * entanglementWeight=ε (Σ w_ij / w_sum), governance=CIEMS vec4, baseNormal.
 * Reuses `into` typed arrays when lengths match (no per-frame realloc).
 *
 * Sparse (partial): ρ < vacuumRho skips expensive principal/gov copies and
 * writes density=0 + position only — does NOT compact indices (joints stay mapped).
 */
function reuseOrAlloc(into, key, length) {
  const prev = into?.[key];
  if (prev instanceof Float32Array && prev.length === length) return prev;
  return new Float32Array(length);
}

export function packHolographicAttributeBuffers(nodes, egt, into = null, opts = {}) {
  const count = nodes.length;
  const vacuumRho = opts.vacuumRho ?? HOLO_VACUUM_RHO;
  const position = reuseOrAlloc(into, "position", count * 3);
  const entanglementDensity = reuseOrAlloc(into, "entanglementDensity", count);
  const entanglementDirection = reuseOrAlloc(into, "entanglementDirection", count * 3);
  const curvature = reuseOrAlloc(into, "curvature", count);
  const entanglementWeight = reuseOrAlloc(into, "entanglementWeight", count);
  const governance = reuseOrAlloc(into, "governance", count * 4);
  const baseNormal = reuseOrAlloc(into, "baseNormal", count * 3);

  let vacuumSkipped = 0;
  for (let i = 0; i < count; i++) {
    const n = nodes[i];
    const rho = n.rho ?? egt?.rho?.[i] ?? 0;
    const p = n.pos || { x: 0, y: 0, z: 0 };
    position[i * 3] = p.x;
    position[i * 3 + 1] = p.y;
    position[i * 3 + 2] = p.z;
    entanglementDensity[i] = rho;

    if (rho < vacuumRho) {
      // Cheap vacuum slot: zero draw-relevant attrs; keep index for topology.
      vacuumSkipped++;
      curvature[i] = 0;
      entanglementWeight[i] = 0;
      entanglementDirection[i * 3] = 0;
      entanglementDirection[i * 3 + 1] = 1;
      entanglementDirection[i * 3 + 2] = 0;
      governance[i * 4] = 0;
      governance[i * 4 + 1] = 0;
      governance[i * 4 + 2] = 0;
      governance[i * 4 + 3] = 0;
      baseNormal[i * 3] = 0;
      baseNormal[i * 3 + 1] = 1;
      baseNormal[i * 3 + 2] = 0;
      n.entanglementDensity = 0;
      continue;
    }

    const K = egt?.K?.[i] ?? n.curvature ?? 0;
    const eps = egt?.epsilon?.[i] ?? egt?.w_sum?.[i] ?? n.E_norm ?? 0;
    const pv = n.principal?.v || [0, 0, 1];
    const nn = n.normal || [0, 0, 1];
    const g = n.gov || defaultGovernanceCoord();

    curvature[i] = K;
    entanglementWeight[i] = eps;
    entanglementDirection[i * 3] = pv[0];
    entanglementDirection[i * 3 + 1] = pv[1];
    entanglementDirection[i * 3 + 2] = pv[2];
    governance[i * 4] = g.intent;
    governance[i * 4 + 1] = g.evidence;
    governance[i * 4 + 2] = g.conformance;
    governance[i * 4 + 3] = g.stewardship;
    baseNormal[i * 3] = nn[0];
    baseNormal[i * 3 + 1] = nn[1];
    baseNormal[i * 3 + 2] = nn[2];

    n.entanglementDensity = entanglementDensity[i];
    n.curvature = curvature[i];
    n.weight = entanglementWeight[i];
    n.direction = {
      x: entanglementDirection[i * 3],
      y: entanglementDirection[i * 3 + 1],
      z: entanglementDirection[i * 3 + 2],
    };
    n.governance = {
      intent: governance[i * 4],
      evidence: governance[i * 4 + 1],
      conformance: governance[i * 4 + 2],
      stewardship: governance[i * 4 + 3],
    };
    n.baseNormal = [
      baseNormal[i * 3],
      baseNormal[i * 3 + 1],
      baseNormal[i * 3 + 2],
    ];
  }

  return {
    count,
    vacuumSkipped,
    sparseStatus: "partial",
    attributeNames: ATTR,
    status: HOLO_RIG_BUFFERS_STATUS,
    position,
    entanglementDensity,
    entanglementDirection,
    curvature,
    entanglementWeight,
    governance,
    baseNormal,
    h_ij: egt?.h_ij || into?.h_ij || null,
  };
}

export class CharacterHolographicRig {
  /**
   * @param {{ creature?: string, governance?: number|object }} [opts]
   */
  constructor(opts = {}) {
    this.status = HOLO_RIG_STATUS;
    this.buffersStatus = HOLO_RIG_BUFFERS_STATUS;
    this.creature = opts.creature || "Mythar";
    const g = opts.governance;
    this.governanceBias =
      typeof g === "number"
        ? defaultGovernanceCoord({
            intent: g,
            evidence: g,
            conformance: g,
            stewardship: Math.min(1, g + 0.05),
          })
        : defaultGovernanceCoord(g || {});
    this.nodes = [];
    this.egt = null;
    this.buffers = null;
  }

  update(egt, anatomy, govOverride) {
    const gov = { ...this.governanceBias, ...govOverride };
    this.nodes = buildRigNodes(egt, { mutate: true, gov });
    attachGovernanceCoords(egt);
    this.egt = egt;
    this.anatomy = anatomy || null;
    this.frameGovernance = aggregateGovernance(egt);
    this.buffers = packHolographicAttributeBuffers(this.nodes, egt, this.buffers);
    return this;
  }

  /**
   * Optional Three.js host adapter. Core Node tests must not import THREE.
   * @param {typeof import("three")} THREE
   */
  toThreeGeometry(THREE) {
    if (!THREE?.BufferGeometry || !THREE?.BufferAttribute) {
      throw new Error("toThreeGeometry requires a Three.js module");
    }
    const b = this.buffers;
    if (!b) throw new Error("toThreeGeometry: call update() first");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.position, 3));
    g.setAttribute("entanglementDensity", new THREE.BufferAttribute(b.entanglementDensity, 1));
    g.setAttribute("entanglementDirection", new THREE.BufferAttribute(b.entanglementDirection, 3));
    g.setAttribute("curvature", new THREE.BufferAttribute(b.curvature, 1));
    g.setAttribute("entanglementWeight", new THREE.BufferAttribute(b.entanglementWeight, 1));
    g.setAttribute("governance", new THREE.BufferAttribute(b.governance, 4));
    g.setAttribute("baseNormal", new THREE.BufferAttribute(b.baseNormal, 3));
    return g;
  }
}

export function createCharacterHolographicRig(opts) {
  return new CharacterHolographicRig(opts);
}
