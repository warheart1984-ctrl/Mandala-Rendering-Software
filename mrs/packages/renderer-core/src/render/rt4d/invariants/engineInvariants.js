/**
 * 4DRS engine invariants — derived from foundational PI-* math invariants.
 *
 * These define runtime guarantees a conforming 4DRS host should be able to
 * demonstrate via measurements + predicates + evidence records.
 *
 * Drive-G-1: no invariant is marked "enforced" here — there is no CKL/runtime
 * gate that blocks renders on these IDs yet. See STACK.md.
 */

/** @typedef {"enforced"|"tested"|"declared"|"skeleton"} InvariantStatus */

/**
 * @typedef {object} EngineInvariant
 * @property {string} id
 * @property {"engine"} layer
 * @property {string} title
 * @property {string} statement
 * @property {string[]} derived_from
 * @property {InvariantStatus} status
 * @property {string[]} evidence
 * @property {string[]} [anchors]
 * @property {string} [notEnforcedBecause]
 */

/**
 * @type {readonly EngineInvariant[]}
 */
export const ENGINE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "EI-PROJ-FIDELITY",
    layer: /** @type {const} */ ("engine"),
    title: "Projection fidelity",
    statement:
      "4D→3D→2D projection matches the closed-form d₄/(d₄+w) and d₃/(d₃+z) formulas used by Projector4D.",
    derived_from: Object.freeze(["PI-GEO-LENGTH", "PI-TRIG-RADIAL"]),
    status: /** @type {InvariantStatus} */ ("tested"),
    evidence: Object.freeze([
      "src/render/rt4d/output/projector.js",
      "src/render/rt4d/invariants/predicates.js::projectionFidelityHolds",
      "src/render/rt4d/test/invariants.conformance.test.js",
    ]),
    anchors: Object.freeze(["Projector4D.project4Dto3D", "Projector4D.project3Dto2D"]),
    notEnforcedBecause:
      "No render-path gate compares live projector state to the closed form; unit predicate only.",
  }),
  Object.freeze({
    id: "EI-REPLAY-DETERMINISM",
    layer: /** @type {const} */ ("engine"),
    title: "Replay determinism",
    statement:
      "Identical seed + input ledger yields identical observable state hashes (AGENTS.md P4 / constitutional replay checks). Full multi-host bit-identical replay is not claimed here.",
    derived_from: Object.freeze(["PI-CALC-ENERGY"]),
    status: /** @type {InvariantStatus} */ ("declared"),
    evidence: Object.freeze([
      "docs/4drs/substrate/DETERMINISTIC_REPLAY.md",
      "engine/conformance/default.conformance-profile.json::replay.deterministic-params",
      "src/render/rt4d/pipeline/CPUConformanceGate.js",
    ]),
    anchors: Object.freeze([
      "CPUConformanceGate.hashBytes",
      "buildTinyReferenceFrame",
      "replay.deterministic-params",
    ]),
    notEnforcedBecause:
      "Constitutional replay checks exist for timeline params; RT4D path-tracer bit-identical multi-host replay is not gated. Tiny CPU reference hash equality is a supporting measurement only (see M-CPU-REF-HASH).",
  }),
  Object.freeze({
    id: "EI-RADIOMETRIC",
    layer: /** @type {const} */ ("engine"),
    title: "Radiometric consistency",
    statement:
      "Lambertian4D evaluates to BRDF = 3ρ/(4π) and cosine-weighted PDF = 3cosθ/(4π); white-furnace integral matches albedo within documented tolerance. Formulas are not redefined here — they are anchored to existing normalization tests.",
    derived_from: Object.freeze(["PI-CALC-ENERGY", "PI-TRIG-RADIAL"]),
    status: /** @type {InvariantStatus} */ ("tested"),
    evidence: Object.freeze([
      "src/render/rt4d/material/bsdf4d.js",
      "src/render/rt4d/math/s3.js",
      "src/render/rt4d/test/normalization.test.js",
      "src/render/rt4d/invariants/predicates.js::radiometricLambertianHolds",
    ]),
    anchors: Object.freeze([
      "Lambertian4D.evaluate",
      "cosineWeightedPDF_S3",
      "normalization.test.js",
    ]),
    notEnforcedBecause:
      "Normalization tests assert the constants; no PathTracer4D / CKL gate rejects frames that violate them at runtime.",
  }),
  Object.freeze({
    id: "EI-TOPOLOGY",
    layer: /** @type {const} */ ("engine"),
    title: "Topology preservation",
    statement:
      "BVH4D / HyperBox AABB4 slab intersection preserves containment: child bounds ⊆ parent bounds; ray miss on parent implies miss on descendants.",
    derived_from: Object.freeze(["PI-GEO-LENGTH"]),
    status: /** @type {InvariantStatus} */ ("skeleton"),
    evidence: Object.freeze([
      "src/render/rt4d/accel/BVH4D.js",
      "src/render/rt4d/accel/HyperBox.js",
      "docs/4drs/substrate/BVH4D_GPU.md",
    ]),
    anchors: Object.freeze(["HyperBox.intersect", "BVH4D.traverse"]),
    notEnforcedBecause:
      "AABB4 slab code exists; no unit test yet proves parent/child containment or miss-implication as an invariant predicate. Do not treat BVH presence as enforcement.",
  }),
  Object.freeze({
    id: "EI-LENGTH-PARENT",
    layer: /** @type {const} */ ("engine"),
    title: "Length / radial parent binding",
    statement:
      "Engine transforms that claim orthogonality must satisfy PI-GEO-LENGTH / PI-TRIG-RADIAL on direction vectors (SO(4) plane rotations).",
    derived_from: Object.freeze(["PI-GEO-LENGTH", "PI-TRIG-RADIAL"]),
    status: /** @type {InvariantStatus} */ ("tested"),
    evidence: Object.freeze([
      "src/render/rt4d/math/physicalInvariants.js",
      "src/render/rt4d/test/physicalInvariants.test.js",
      "src/render/rt4d/invariants/predicates.js::orthogonalLengthPreserved",
    ]),
    anchors: Object.freeze(["Transform4D.rotate", "lengthPreserved4"]),
    notEnforcedBecause:
      "Transform4D plane rotations are unit-tested for length preservation; render pipeline does not gate on PI-* at runtime.",
  }),
]);

/**
 * @param {string} id
 * @returns {EngineInvariant|undefined}
 */
export function getEngineInvariant(id) {
  return ENGINE_INVARIANTS.find((inv) => inv.id === id);
}

/**
 * All engine invariants that list `parentId` in derived_from.
 * @param {string} parentId
 * @returns {EngineInvariant[]}
 */
export function engineInvariantsDerivedFrom(parentId) {
  return ENGINE_INVARIANTS.filter((inv) => inv.derived_from.includes(parentId));
}
