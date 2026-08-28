/**
 * Compose vs compiler vs Rosetta — three different jobs.
 *
 * Compose lives in contract.js / docs/math4d/CONTRACT.md.
 * This file does not rewrite that equation. It names the split and
 * builds a shared-state envelope. It does not implement Π or ρ/h_ij.
 *
 * Canonical: docs/math4d/ROSETTA.md
 */

import { MATH_FIRST_CONTRACT_ID } from "./contract.js";

export const ROSETTA_ID = "chamber.rosetta.v1";

/** State mapping only. Not Π identity. */
export const ROSETTA_STATUS = "partial";

/** Holography GPU raster is a different compiler target — not claimed here. */
export const ROSETTA_HOLO_GPU_STATUS = "declared";

export const ROSETTA_CLAIM =
  "Shared chamber state (X, t / time-as-w, camera, provenance, outDir) — not Π identity";

export const SHARED_STATE_KEYS = Object.freeze([
  "X",
  "t",
  "timeAsW",
  "camera",
  "provenance",
  "outDir",
]);

/**
 * Three jobs. Do not fuse.
 *
 * compose  — operators inside one contract (projection). See CONTRACT.md.
 * compiler — contract → backend. Hardware executes; it does not author.
 * rosetta  — between two contracts. Shared clock/actors; not shared Π.
 */
export const JOBS = Object.freeze({
  compose: Object.freeze({
    job: "compose",
    contractId: MATH_FIRST_CONTRACT_ID,
    sot: "docs/math4d/CONTRACT.md",
    meaning:
      "Operators compose inside one contract. math4d is the composer for the projection contract.",
    status: "enforced",
  }),
  compiler: Object.freeze({
    job: "compiler",
    meaning:
      "Hardware is executor. A backend must preserve its own contract. math4d/JS is the enforced compiler target for projection. Chamber holography GLSL is a partial compiler target for bulk→boundary, not a drop-in ℛ of the projection equation.",
    projection: Object.freeze({
      backend: "jsCpu",
      contractId: MATH_FIRST_CONTRACT_ID,
      status: "enforced",
    }),
    holography: Object.freeze({
      backend: "glslChamber",
      contract: "bulk-boundary",
      status: "partial",
      gpu: ROSETTA_HOLO_GPU_STATUS,
    }),
  }),
  rosetta: Object.freeze({
    job: "rosetta",
    id: ROSETTA_ID,
    meaning:
      "Thin bridge of shared chamber state between projection and holography. They share a world clock and actors. They do not share Π.",
    status: ROSETTA_STATUS,
    holographicIsNotPi: true,
    math4dIsNotHijCompiler: true,
  }),
});

function asVec4(p) {
  if (!p) return { x: 0, y: 0, z: 0, w: 0 };
  if (Array.isArray(p)) {
    return {
      x: Number(p[0] ?? 0),
      y: Number(p[1] ?? 0),
      z: Number(p[2] ?? 0),
      w: Number(p[3] ?? 0),
    };
  }
  return {
    x: Number(p.x ?? 0),
    y: Number(p.y ?? 0),
    z: Number(p.z ?? 0),
    w: Number(p.w ?? 0),
  };
}

function asTimeAsW(raw, t) {
  if (raw && typeof raw === "object") {
    const value = Number(raw.value ?? raw.w ?? t);
    return {
      value,
      usedBy: raw.usedBy ?? "unspecified",
      extrusion: raw.extrusion === true,
    };
  }
  return {
    value: Number(raw ?? t),
    usedBy: "unspecified",
    extrusion: false,
  };
}

/**
 * Build the shared chamber envelope.
 *
 * Does not run transformPipeline. Does not run EntanglementRenderer.
 * Coordinates are copied, not reprojected.
 *
 * @param {object} [input]
 * @param {{x?:number,y?:number,z?:number,w?:number}|number[]} [input.X]
 * @param {number} [input.t]
 * @param {object|number} [input.timeAsW]
 * @param {object|null} [input.camera]
 * @param {object} [input.provenance]
 * @param {string|null} [input.outDir]
 * @param {"projection"|"holography"|"unspecified"} [input.source]
 * @returns {object}
 */
export function buildSharedState(input = {}) {
  const t = Number(input.t ?? 0);
  const X = asVec4(input.X);
  const timeAsW = asTimeAsW(input.timeAsW, t);
  const provenance = {
    renderIdentity: null,
    worldId: null,
    timelineId: null,
    intentId: null,
    frameIndex: 0,
    timeSeconds: t,
    parameters: null,
    ...(input.provenance && typeof input.provenance === "object"
      ? input.provenance
      : {}),
  };

  return {
    id: ROSETTA_ID,
    status: ROSETTA_STATUS,
    claim: ROSETTA_CLAIM,
    jobs: JOBS,
    source: input.source === "projection" || input.source === "holography"
      ? input.source
      : "unspecified",
    X,
    t,
    timeAsW,
    camera: input.camera ?? null,
    provenance,
    outDir: input.outDir ?? null,
    sharePi: false,
    holographicIsNotPi: true,
    math4dIsNotHijCompiler: true,
  };
}

/**
 * Two envelopes may share a clock. They never share Π.
 *
 * @param {object} a
 * @param {object} b
 */
export function compareSharedState(a, b) {
  const left = a ?? {};
  const right = b ?? {};
  const shareClock =
    Number.isFinite(left.t) && Number.isFinite(right.t) && left.t === right.t;
  return {
    shareClock,
    shareActors: Boolean(left.X) && Boolean(right.X),
    sharePi: false,
    holographicIsNotPi: true,
  };
}
