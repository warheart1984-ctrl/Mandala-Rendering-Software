/**
 * Validation predicates that consume measurements (or measurement-shaped args).
 *
 * Foundational PI predicates are re-exported from physicalInvariants.js.
 * Engine predicates either wrap existing math or stay stubs until numerically proven.
 */

import { vec4, dot } from "../math/vec4.js";
import { cosineWeightedPDF_S3, cosineWeightedSampleS3 } from "../math/s3.js";
import { Lambertian4D } from "../material/bsdf4d.js";
import { Projector4D } from "../output/projector.js";
import { Transform4D } from "../math/transform.js";
import {
  PHYSICAL_INVARIANT_TOL,
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
} from "../math/physicalInvariants.js";
import { buildTinyReferenceFrame, hashBytes } from "../pipeline/CPUConformanceGate.js";

/** Canonical Lambertian BRDF factor 3/(4π) — must match bsdf4d.js / normalization tests. */
export const LAMBERTIAN_BRDF_FACTOR = 3 / (4 * Math.PI);

export {
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
};

/**
 * EI-PROJ-FIDELITY: Projector4D output matches closed-form d4/d3 projection.
 *
 * @param {{x:number,y:number,z:number,w:number}} point
 * @param {{d4?:number,d3?:number,scale?:number,width?:number,height?:number}} [opts]
 * @param {number} [tol]
 * @returns {{ok:boolean, expected3d:object, actual3d:object, expected2d:object, actual2d:object}}
 */
export function projectionFidelityHolds(point, opts = {}, tol = PHYSICAL_INVARIANT_TOL) {
  const projector = new Projector4D(opts);
  const d4 = projector.d4;
  const d3 = projector.d3;
  const wProj = d4 / (d4 + point.w);
  const expected3d = {
    x: point.x * wProj,
    y: point.y * wProj,
    z: point.z * wProj,
  };
  const actual3d = projector.project4Dto3D(point);
  const perspective = expected3d.z === 0 ? 1 : d3 / (d3 + expected3d.z);
  const expected2d = {
    sx: expected3d.x * projector.scale * perspective + projector.width / 2,
    sy: expected3d.y * projector.scale * perspective + projector.height / 2,
  };
  const actual2d = projector.project4Dto2D(point);

  const ok3 =
    Math.abs(actual3d.x - expected3d.x) < tol &&
    Math.abs(actual3d.y - expected3d.y) < tol &&
    Math.abs(actual3d.z - expected3d.z) < tol;
  const ok2 =
    Math.abs(actual2d.sx - expected2d.sx) < tol &&
    Math.abs(actual2d.sy - expected2d.sy) < tol;

  return {
    ok: ok3 && ok2,
    expected3d,
    actual3d: { x: actual3d.x, y: actual3d.y, z: actual3d.z },
    expected2d,
    actual2d,
  };
}

/**
 * EI-RADIOMETRIC: Lambertian BRDF constant + PDF at normal = 3/(4π).
 * Does not redefine formulas — evaluates existing Lambertian4D / s3 helpers.
 *
 * @param {number} [albedo]
 * @param {number} [tol]
 * @returns {{ok:boolean, brdf:number, expectedBrdf:number, pdfAtNormal:number, expectedPdf:number}}
 */
export function radiometricLambertianHolds(albedo = 1, tol = 1e-9) {
  const mat = new Lambertian4D(vec4(albedo, albedo, albedo, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  const wo = vec4(0, 0, 1, 0);
  const val = mat.evaluate(wi, wo, n);
  const expectedBrdf = LAMBERTIAN_BRDF_FACTOR * albedo;
  const pdfAtNormal = cosineWeightedPDF_S3(wo, n);
  const expectedPdf = LAMBERTIAN_BRDF_FACTOR; // cosθ = 1
  const ok =
    Math.abs(val.x - expectedBrdf) < tol &&
    Math.abs(val.y - expectedBrdf) < tol &&
    Math.abs(val.z - expectedBrdf) < tol &&
    Math.abs(pdfAtNormal - expectedPdf) < tol;
  return {
    ok,
    brdf: val.x,
    expectedBrdf,
    pdfAtNormal,
    expectedPdf,
  };
}

/**
 * White-furnace MC for Lambertian with seeded LCG (deterministic estimate path).
 * For matching cosine-weighted sampling, estimate equals albedo analytically;
 * this still exercises the production evaluate/pdf path.
 *
 * @param {{albedo?:number, samples?:number, seed?:number, tol?:number}} [opts]
 * @returns {{ok:boolean, estimate:number, albedo:number, samples:number, seed:number}}
 */
export function whiteFurnaceLambertianHolds(opts = {}) {
  const albedo = opts.albedo ?? 0.8;
  const samples = opts.samples ?? 4096;
  const seed = opts.seed ?? 0x4d5253;
  const tol = opts.tol ?? 1e-6;
  let s = seed >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const mat = new Lambertian4D(vec4(albedo, albedo, albedo, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const { direction, pdf } = cosineWeightedSampleS3(rng(), rng(), rng(), n);
    const f = mat.evaluate(wi, direction, n);
    const cosTheta = Math.abs(dot(direction, n));
    sum += (f.x * cosTheta) / (pdf + 1e-12);
  }
  const estimate = sum / samples;
  return {
    ok: Math.abs(estimate - albedo) < tol,
    estimate,
    albedo,
    samples,
    seed,
  };
}

/**
 * Supporting measurement for EI-REPLAY-DETERMINISM: same seed → same tiny-ref hash.
 *
 * @param {{width?:number,height?:number,seed?:number}} [opts]
 * @returns {{ok:boolean, hashA:string, hashB:string, width:number, height:number, seed:number}}
 */
export function cpuReferenceHashDeterministic(opts = {}) {
  const width = opts.width ?? 8;
  const height = opts.height ?? 8;
  const seed = opts.seed ?? 0x4d5253;
  const a = buildTinyReferenceFrame(width, height, seed);
  const b = buildTinyReferenceFrame(width, height, seed);
  const hashA = hashBytes(a);
  const hashB = hashBytes(b);
  return { ok: hashA === hashB, hashA, hashB, width, height, seed };
}

/**
 * EI-LENGTH-PARENT: Transform4D plane rotation preserves ‖v‖².
 *
 * @param {{x:number,y:number,z:number,w:number}} [v]
 * @param {string} [plane]
 * @param {number} [angle]
 * @param {number} [tol]
 * @returns {{ok:boolean, plane:string, angle:number, before:number, after:number}}
 */
export function orthogonalLengthPreserved(
  v = vec4(1.1, -0.7, 0.3, 2.2),
  plane = "xy",
  angle = 1.234,
  tol = 1e-9,
) {
  const R = Transform4D.rotate(plane, angle);
  const vRot = R.applyDir(v);
  const before = v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w;
  const after = vRot.x * vRot.x + vRot.y * vRot.y + vRot.z * vRot.z + vRot.w * vRot.w;
  return {
    ok: lengthPreserved4(v, vRot, tol),
    plane,
    angle,
    before,
    after,
  };
}

/**
 * EI-TOPOLOGY: skeleton stub — returns ok:null (not evaluated).
 * Callers must not treat this as a pass.
 *
 * @returns {{ok:null, status:"skeleton", reason:string}}
 */
export function topologyPreservationHolds() {
  return {
    ok: null,
    status: "skeleton",
    reason:
      "No BVH parent/child containment predicate is implemented yet. HyperBox.intersect exists; invariant unproven.",
  };
}

/**
 * Registry: invariant id → predicate runner producing { ok, ...details }.
 * Topology returns ok:null (unevaluated).
 */
export const PREDICATE_RUNNERS = Object.freeze({
  "PI-GEO-LENGTH": (measurement = {}) => {
    const v = measurement.v ?? { x: 3, y: 4 };
    const vRot = measurement.vRot ?? rotate2d(v.x, v.y, measurement.theta ?? Math.PI / 4);
    const ok = lengthPreserved(v, vRot, measurement.tol);
    return { ok, v, vRot };
  },
  "PI-CALC-ENERGY": (measurement = {}) => {
    const eBefore = measurement.eBefore ?? 1;
    const eAfter = measurement.eAfter ?? 1;
    const ok = energyConserved(eBefore, eAfter, measurement.tol);
    return { ok, eBefore, eAfter };
  },
  "PI-TRIG-RADIAL": (measurement = {}) => {
    const x = measurement.x ?? 3;
    const y = measurement.y ?? 4;
    const theta = measurement.theta ?? Math.PI / 3;
    const r = rotate2d(x, y, theta);
    const ok = radialDistanceInvariant(x, y, r.x, r.y, measurement.tol);
    return { ok, x, y, xp: r.x, yp: r.y, theta };
  },
  "EI-PROJ-FIDELITY": (measurement = {}) =>
    projectionFidelityHolds(
      measurement.point ?? vec4(1, 2, 3, 0.5),
      measurement.opts ?? {},
      measurement.tol,
    ),
  "EI-RADIOMETRIC": (measurement = {}) => {
    const point = radiometricLambertianHolds(measurement.albedo ?? 1, measurement.tol);
    const furnace = whiteFurnaceLambertianHolds({
      albedo: measurement.albedo ?? 0.8,
      samples: measurement.samples ?? 4096,
      seed: measurement.seed ?? 0x4d5253,
      tol: measurement.furnaceTol ?? 1e-6,
    });
    return {
      ok: point.ok && furnace.ok,
      point,
      furnace,
    };
  },
  "EI-LENGTH-PARENT": (measurement = {}) =>
    orthogonalLengthPreserved(
      measurement.v,
      measurement.plane,
      measurement.angle,
      measurement.tol,
    ),
  "EI-REPLAY-DETERMINISM": (measurement = {}) => {
    // Supporting measurement only — does not prove full timeline replay.
    const hash = cpuReferenceHashDeterministic(measurement);
    return {
      ok: null,
      status: "declared",
      supporting: hash,
      reason:
        "Full replay determinism remains declared. Supporting M-CPU-REF-HASH ran: " +
        (hash.ok ? "pass" : "fail"),
    };
  },
  "EI-TOPOLOGY": () => topologyPreservationHolds(),
});

/**
 * @param {string} invariantId
 * @param {object} [measurement]
 * @returns {{ok:boolean|null, [key:string]:unknown}}
 */
export function runPredicate(invariantId, measurement = {}) {
  const runner = PREDICATE_RUNNERS[invariantId];
  if (!runner) {
    return {
      ok: null,
      status: "skeleton",
      reason: `No predicate registered for ${invariantId}`,
    };
  }
  return runner(measurement);
}
