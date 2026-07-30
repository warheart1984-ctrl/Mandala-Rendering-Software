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
import { cpuPathTracerHashDeterministic } from "../pipeline/PathTracerSeedHash.js";
import { BVH4D } from "../accel/BVH4D.js";
import { Hypersphere } from "../geometry/hypersurface.js";

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

export { cpuPathTracerHashDeterministic };

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
 * True iff `child` HyperBox is contained in `parent` HyperBox on all four axes
 * (within tolerance). Supports M-BVH-CONTAINMENT.
 *
 * @param {{min:{x:number,y:number,z:number,w:number},max:{x:number,y:number,z:number,w:number}}} child
 * @param {{min:{x:number,y:number,z:number,w:number},max:{x:number,y:number,z:number,w:number}}} parent
 * @param {number} [tol]
 * @returns {boolean}
 */
export function hyperBoxContained(child, parent, tol = PHYSICAL_INVARIANT_TOL) {
  return (
    child.min.x >= parent.min.x - tol &&
    child.min.y >= parent.min.y - tol &&
    child.min.z >= parent.min.z - tol &&
    child.min.w >= parent.min.w - tol &&
    child.max.x <= parent.max.x + tol &&
    child.max.y <= parent.max.y + tol &&
    child.max.z <= parent.max.z + tol &&
    child.max.w <= parent.max.w + tol
  );
}

/**
 * Deterministic default BVH used when a caller does not supply one, so the
 * default conformance adapter can evaluate EI-TOPOLOGY without external scene
 * state. Chosen to force a multi-level tree (> 2 × leafThreshold primitives).
 *
 * @returns {BVH4D}
 */
export function buildDefaultTopologyBVH() {
  const centers = [
    [-3, -2, -1, 0.5],
    [2, 3, -2, -1],
    [0, 0, 0, 0],
    [4, -1, 2, 1.5],
    [-2, 4, 3, -2],
    [1, -3, -4, 2],
    [-4, 1, 4, -3],
    [3, 2, 1, 3],
    [-1, -4, 2, -1.5],
    [2, -2, -3, 0],
    [-3, 3, -1, 2.5],
    [1, 1, 4, -4],
  ];
  const radii = [0.5, 0.8, 1.2, 0.6, 0.9, 0.7, 1.1, 0.4, 0.75, 0.65, 0.95, 0.55];
  const primitives = centers.map(
    (c, i) => new Hypersphere(vec4(c[0], c[1], c[2], c[3]), radii[i]),
  );
  return new BVH4D(primitives, { leafThreshold: 2 });
}

/**
 * Recursively assert that every descendant node box of `nodeIdx` is missed by
 * the ray (used only after the caller has confirmed `nodeIdx` itself is missed).
 *
 * @param {BVH4D} bvh
 * @param {number} nodeIdx
 * @param {object} ray
 * @returns {boolean}
 */
function descendantsAllMiss(bvh, nodeIdx, ray) {
  const node = bvh.nodes[nodeIdx];
  for (const childIdx of [node.left, node.right]) {
    if (childIdx < 0) continue;
    if (bvh.nodes[childIdx].box.intersect(ray)) return false;
    if (!descendantsAllMiss(bvh, childIdx, ray)) return false;
  }
  return true;
}

/**
 * For one ray, verify the miss-implication: any node whose box the ray misses
 * has no descendant whose box the ray hits.
 *
 * @param {BVH4D} bvh
 * @param {object} ray
 * @returns {boolean}
 */
function missImplicationForRay(bvh, ray) {
  const visit = (idx) => {
    const node = bvh.nodes[idx];
    if (!node.box.intersect(ray)) {
      return descendantsAllMiss(bvh, idx, ray);
    }
    let ok = true;
    for (const childIdx of [node.left, node.right]) {
      if (childIdx >= 0) ok = ok && visit(childIdx);
    }
    return ok;
  };
  return visit(0);
}

/**
 * Supporting measurement: cast deterministic (seeded) rays and confirm the
 * ray-miss implication across the whole tree.
 *
 * @param {BVH4D} bvh
 * @param {{rays?:number, seed?:number}} [opts]
 * @returns {{ok:boolean, rays:number, missChecks:number, violations:number, seed:number}}
 */
export function bvhMissImplicationHolds(bvh, opts = {}) {
  const rays = opts.rays ?? 256;
  const seed = opts.seed ?? 0x70706f; // "top"
  let s = seed >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let violations = 0;
  let missChecks = 0;
  for (let i = 0; i < rays; i++) {
    const origin = vec4(
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
      (rng() - 0.5) * 20,
    );
    let dir = vec4(rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5);
    const dl =
      Math.hypot(dir.x, dir.y, dir.z, dir.w) || 1;
    dir = vec4(dir.x / dl, dir.y / dl, dir.z / dl, dir.w / dl);
    const ray = { origin, direction: dir, tMin: 0, tMax: Infinity };
    // Only rays that miss at least one node exercise the implication.
    if (bvh.nodes.some((n) => !n.box.intersect(ray))) missChecks++;
    if (!missImplicationForRay(bvh, ray)) violations++;
  }
  return { ok: violations === 0, rays, missChecks, violations, seed };
}

/**
 * EI-TOPOLOGY: BVH4D child bounds ⊆ parent bounds on all four axes, and
 * (supporting) ray-miss on a parent implies miss on all descendants.
 *
 * Supply a built `BVH4D` (or leave undefined to evaluate a deterministic
 * default tree). Returns ok:null only when no evaluable tree is available.
 *
 * @param {BVH4D} [bvh]
 * @param {{tol?:number, checkMissImplication?:boolean, rays?:number, seed?:number}} [opts]
 * @returns {{ok:boolean|null, status:string, nodeCount?:number, checkedPairs?:number, violations?:Array, missImplication?:object, reason?:string}}
 */
export function topologyPreservationHolds(bvh, opts = {}) {
  const tree = bvh ?? buildDefaultTopologyBVH();
  if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) {
    return {
      ok: null,
      status: "skeleton",
      reason: "No BVH nodes available; supply a built BVH4D to evaluate containment.",
    };
  }
  const tol = opts.tol ?? PHYSICAL_INVARIANT_TOL;
  const nodes = tree.nodes;
  let checkedPairs = 0;
  const violations = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    for (const childIdx of [node.left, node.right]) {
      if (childIdx < 0) continue;
      const child = nodes[childIdx];
      checkedPairs++;
      if (!hyperBoxContained(child.box, node.box, tol)) {
        violations.push({ parent: i, child: childIdx });
      }
    }
  }
  const containmentOk = violations.length === 0;
  const missImplication =
    opts.checkMissImplication === false
      ? null
      : bvhMissImplicationHolds(tree, opts);
  return {
    ok: containmentOk && (missImplication ? missImplication.ok : true),
    status: "tested",
    nodeCount: nodes.length,
    checkedPairs,
    violations,
    missImplication,
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
    // Supporting measurements only — do not prove full timeline / multi-host replay.
    const tinyRef = cpuReferenceHashDeterministic(measurement);
    const pathHash =
      measurement.skipPathTracerHash === true
        ? null
        : cpuPathTracerHashDeterministic({
            width: measurement.pathWidth ?? measurement.width ?? 4,
            height: measurement.pathHeight ?? measurement.height ?? 4,
            samples: measurement.pathSamples ?? 1,
            maxDepth: measurement.pathMaxDepth ?? 2,
            seed: measurement.seed ?? 0x4d5253,
          });
    const supportingOk =
      tinyRef.ok && (pathHash ? pathHash.ok : true);
    return {
      ok: null,
      status: "declared",
      supporting: { tinyRef, pathHash, ok: supportingOk },
      reason:
        "Full replay determinism remains declared. Supporting M-CPU-REF-HASH: " +
        (tinyRef.ok ? "pass" : "fail") +
        "; M-CPU-PATH-HASH: " +
        (pathHash ? (pathHash.ok ? "pass" : "fail") : "skipped"),
    };
  },
"EI-TOPOLOGY": (measurement = {}) =>
      topologyPreservationHolds(measurement.bvh, measurement),
    "EI-ORGANIC-VARIANCE": (measurement = {}) => {
      const measured = measurement.measuredVariance ?? measurement.organicVarianceMeasured;
      const min = measurement.minOrganicVariance ?? 0.002;
      const lrAveraged = measurement.lrAveraged === true || measurement.symmetryAveraged === true;
      const issues = [];
      if (lrAveraged) issues.push("lr-vertices-averaged");
      if (typeof min !== "number" || !Number.isFinite(min)) issues.push("missing-minOrganicVariance");
      if (typeof measured !== "number" || !Number.isFinite(measured)) issues.push("missing-organicVariance-measurement");
      else if (measured < min) issues.push(`organicVariance=${measured} < min=${min}`);
      return { ok: issues.length === 0, issues, measured, min };
    },
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
