/**
 * Observable measurement descriptors for the 4DRS invariant stack.
 *
 * A measurement names *what* a runtime (or test harness) observes.
 * Predicates consume measurement values; they do not invent numbers.
 */

/**
 * @typedef {object} MeasurementDescriptor
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} supports
 * @property {"tested"|"declared"|"skeleton"} status
 * @property {string[]} [producers]
 */

/**
 * @type {readonly MeasurementDescriptor[]}
 */
export const MEASUREMENTS = Object.freeze([
  Object.freeze({
    id: "M-SQ-NORM-PAIR",
    title: "Squared-norm pair",
    description: "Pair of squared Euclidean norms ‖v‖² and ‖v'‖² (or 2D x²+y²).",
    supports: Object.freeze(["PI-GEO-LENGTH", "PI-TRIG-RADIAL", "EI-LENGTH-PARENT"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["physicalInvariants.lengthPreserved", "radialDistanceInvariant"]),
  }),
  Object.freeze({
    id: "M-ENERGY-PAIR",
    title: "Energy pair",
    description: "Scalar energies E(t1), E(t2) under claimed dE/dt = 0.",
    supports: Object.freeze(["PI-CALC-ENERGY"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["physicalInvariants.energyConserved"]),
  }),
  Object.freeze({
    id: "M-PROJ-CLOSED-FORM",
    title: "Projection closed-form sample",
    description:
      "Point (x,y,z,w) plus Projector4D {d4,d3,scale,width,height} and observed screen/3D projection.",
    supports: Object.freeze(["EI-PROJ-FIDELITY"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["Projector4D.project4Dto2D"]),
  }),
  Object.freeze({
    id: "M-BRDF-LAMBERT-POINT",
    title: "Lambertian BRDF sample point",
    description:
      "Albedo ρ and evaluated BRDF channel at a hemisphere sample (expected 3ρ/(4π)).",
    supports: Object.freeze(["EI-RADIOMETRIC"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["Lambertian4D.evaluate", "normalization.test.js"]),
  }),
  Object.freeze({
    id: "M-PDF-COSINE-POINT",
    title: "Cosine-weighted PDF sample point",
    description: "Direction and normal with cosineWeightedPDF_S3 (expected 3cosθ/(4π)).",
    supports: Object.freeze(["EI-RADIOMETRIC"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["cosineWeightedPDF_S3", "normalization.test.js"]),
  }),
  Object.freeze({
    id: "M-WHITE-FURNACE",
    title: "White-furnace MC estimate",
    description:
      "Monte Carlo estimate of ∫ f cosθ / pdf dΩ for Lambertian vs albedo (seeded draws).",
    supports: Object.freeze(["EI-RADIOMETRIC"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["normalization.test.js white furnace"]),
  }),
  Object.freeze({
    id: "M-CPU-REF-HASH",
    title: "CPU tiny-reference frame hash",
    description:
      "FNV-1a hash of buildTinyReferenceFrame(width,height,seed). Supporting evidence for seed-determinism of the tiny gate only — not full RT4D replay.",
    supports: Object.freeze(["EI-REPLAY-DETERMINISM"]),
    status: /** @type {const} */ ("tested"),
    producers: Object.freeze(["CPUConformanceGate.buildTinyReferenceFrame", "hashBytes"]),
  }),
  Object.freeze({
    id: "M-BVH-CONTAINMENT",
    title: "BVH parent/child AABB containment",
    description: "Per-node check that child HyperBox ⊆ parent HyperBox on all four axes.",
    supports: Object.freeze(["EI-TOPOLOGY"]),
    status: /** @type {const} */ ("skeleton"),
    producers: Object.freeze(["BVH4D.nodes"]),
  }),
]);

/**
 * @param {string} id
 * @returns {MeasurementDescriptor|undefined}
 */
export function getMeasurement(id) {
  return MEASUREMENTS.find((m) => m.id === id);
}

/**
 * @param {string} invariantId
 * @returns {MeasurementDescriptor[]}
 */
export function measurementsForInvariant(invariantId) {
  return MEASUREMENTS.filter((m) => m.supports.includes(invariantId));
}
