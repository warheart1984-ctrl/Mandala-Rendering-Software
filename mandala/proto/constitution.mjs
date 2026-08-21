/**
 * Tiny-universe constitution for the Mandala proto.
 *
 * Status: **partial** — one invariant is runtime-enforced by AAIS gate tests.
 * Authors may instantiate a *different* constitution (e.g. “gravity points toward memory”).
 * That is a new world-law, not “invalid physics.”
 *
 * RHFD Claim A (computationally useful analogue): in-scope.
 * RHFD Claim B (describes physical vacuum): NOT claimed.
 */

export const PROTO_SHAPE = Object.freeze({
  nx: 32,
  ny: 32,
  nz: 32,
  nt: 64,
  cellCount: 32 * 32 * 32,
});

export const CONSTITUTION_ID = "mandala.proto.universe.v0";

/** The single runtime-enforced invariant of this proto. */
export const INVARIANT_ID = "proto.scalar-mass-conservation";

export const DEFAULT_CONSTITUTION = Object.freeze({
  id: CONSTITUTION_ID,
  version: "0.1.0",
  status: "partial",
  product: "governed-synthetic-world-runtime",
  notAGameEngine: true,
  rhfd: {
    claimA: "computational analogue: η, ∇V, defects, lattice — useful for certified evolution",
    claimB: false,
    mapping: {
      eta: "deterministic stochastic perturbation on the scalar (zero-mean, substrate hashNoise4)",
      gradV: "vector field = finite-difference ∇φ; transport / defect walk uses −∇φ",
      defects: "one type: local_rupture (same kind as mandala/substrate addDefect)",
      lattice: "32³ cartesian domain (voxel analogue of dual lattice; hex Möbius remains 2D substrate)",
    },
  },
  creativeLaws: {
    note: "Creative laws are author-declared. This proto uses downhill −∇φ transport.",
    transport: "defect walks toward decreasing φ (potential well analogue)",
    gravityMetaphor: "not Newtonian; lawful if the invariant holds",
  },
  invariant: Object.freeze({
    id: INVARIANT_ID,
    statement:
      "No subsystem may commit a state transition that violates constitutional invariants. This universe conserves scalar mass: |Σφ' − Σφ| ≤ numerical_error_bound.",
    notEquilibrium:
      "Explosions, fracture, turbulence, growth are allowed if they are lawful under this invariant.",
    numericalErrorBound: 1e-2,
  }),
  numerics: Object.freeze({
    kappa: 0.05,
    etaAmplitude: 0.02,
    wellAmplitude: 1.5,
    wellSigma: 2.5,
    dt: 1,
  }),
  material: Object.freeze({
    id: "proto-dielectric",
    albedo: Object.freeze([0.82, 0.71, 0.55]),
    status: "skeleton",
  }),
  backends: Object.freeze({
    cpuReference: "enforced",
    vulkan: "preferred high-performance path; not the definition of truth",
    opencl: "declared",
    cuda: "declared",
    hip: "declared",
    webgpu: "declared",
  }),
});

/**
 * Example of a *different* constitution the author could instantiate.
 * Not executed by the proto runner. Declared to show “redefine gravity” ≠ invalid.
 */
export const MEMORY_GRAVITY_CONSTITUTION_DECLARED = Object.freeze({
  id: "mandala.proto.universe.memory-gravity.declared",
  status: "declared",
  creativeLaws: {
    gravity: "points toward memory — would be a different constitution, not a physics error",
  },
  note: "Do not implement in this prototype. Instantiating it is how you change the world-law.",
});

export function cellCount(c = DEFAULT_CONSTITUTION) {
  void c;
  return PROTO_SHAPE.cellCount;
}

export function idx(x, y, z, shape = PROTO_SHAPE) {
  return x + shape.nx * (y + shape.ny * z);
}

export function xyz(i, shape = PROTO_SHAPE) {
  const x = i % shape.nx;
  const t = (i / shape.nx) | 0;
  const y = t % shape.ny;
  const z = (t / shape.ny) | 0;
  return [x, y, z];
}
