/**
 * CPU reference kernel — source of truth for this prototype.
 *
 * Mathematical contract sits ABOVE backends (Axiom-X lesson).
 * Vulkan / OpenCL / CUDA / HIP / WebGPU must agree with this formula, not define it.
 *
 * Scalar field update is lattice Hamiltonian gradient flow (−∇H), not an ad-hoc
 * Laplacian. Default m²=λ=0, J=1, η=κ recovers the old Neumann Laplacian step.
 * Spatial ∇φ (defect walk) is a different operator from variational ∂H/∂σ.
 *
 * Status: **enforced** (determinism + invariant tests).
 */

import { PROTO_SHAPE, idx } from "./constitution.mjs";
import { hashNoise4 } from "../substrate/dual-lattice.mjs";
import {
  HAMILTONIAN_OPERATOR,
  hamiltonianForceInto,
} from "../substrate/hamiltonian.mjs";

export const CPU_REFERENCE_STATUS = "enforced";

/**
 * Finite-difference ∇φ. Same stencil the Vulkan kernel must implement.
 * Neumann: missing neighbor replaced by self (dx=1 on faces, dx=2 interior).
 */
export function computeGradientInto(phi, vector, shape = PROTO_SHAPE) {
  const { nx, ny, nz } = shape;
  const at = (x, y, z) => phi[idx(x, y, z, shape)];
  let p = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const Vxm = x > 0 ? at(x - 1, y, z) : at(x, y, z);
        const Vxp = x + 1 < nx ? at(x + 1, y, z) : at(x, y, z);
        const Vym = y > 0 ? at(x, y - 1, z) : at(x, y, z);
        const Vyp = y + 1 < ny ? at(x, y + 1, z) : at(x, y, z);
        const Vzm = z > 0 ? at(x, y, z - 1) : at(x, y, z);
        const Vzp = z + 1 < nz ? at(x, y, z + 1) : at(x, y, z);
        const dx = x > 0 && x + 1 < nx ? 2 : 1;
        const dy = y > 0 && y + 1 < ny ? 2 : 1;
        const dz = z > 0 && z + 1 < nz ? 2 : 1;
        vector[p++] = (Vxp - Vxm) / dx;
        vector[p++] = (Vyp - Vym) / dy;
        vector[p++] = (Vzp - Vzm) / dz;
      }
    }
  }
  return vector;
}

/**
 * Certified-path Hamiltonian params. Defaults keep Σφ conserved (coupling only).
 * φ⁴ on-site U is available via constitution.numerics.hamiltonian; enabling it
 * changes Σφ and AAIS mass invariant will reject unless the proposal stays in bound.
 */
export function certifiedHamiltonianParams(constitution) {
  const h = constitution?.numerics?.hamiltonian || {};
  return {
    m2: h.m2 ?? 0,
    lambda: h.lambda ?? 0,
    J: h.J ?? 1,
    eta: h.eta ?? constitution?.numerics?.kappa ?? 0.05,
    nComp: 1,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Discrete downhill step of the defect on −∇φ (one cell, causal).
 */
export function walkDefect(defect, vector, shape = PROTO_SHAPE) {
  const i = idx(defect.x, defect.y, defect.z, shape);
  const gx = vector[i * 3];
  const gy = vector[i * 3 + 1];
  const gz = vector[i * 3 + 2];
  const ax = Math.abs(gx);
  const ay = Math.abs(gy);
  const az = Math.abs(gz);
  let nx = defect.x;
  let ny = defect.y;
  let nz = defect.z;
  if (ax >= ay && ax >= az && ax > 1e-8) nx += gx > 0 ? -1 : 1;
  else if (ay >= az && ay > 1e-8) ny += gy > 0 ? -1 : 1;
  else if (az > 1e-8) nz += gz > 0 ? -1 : 1;
  return {
    type: defect.type,
    x: clamp(nx, 0, shape.nx - 1),
    y: clamp(ny, 0, shape.ny - 1),
    z: clamp(nz, 0, shape.nz - 1),
  };
}

/**
 * Propose next scalar/vector/defect from a certified slice.
 * Does not mutate the certified buffers; writes into `out`.
 */
export function cpuProposeNext(state, constitution, out) {
  const shape = state.shape;
  const n = shape.cellCount;
  const { etaAmplitude } = constitution.numerics;
  const hParams = certifiedHamiltonianParams(constitution);
  const t = state.t;
  const tNext = t + 1;

  const work = out.scalar;
  work.set(state.scalar);

  let etaSum = 0;
  for (let z = 0; z < shape.nz; z++) {
    for (let y = 0; y < shape.ny; y++) {
      for (let x = 0; x < shape.nx; x++) {
        const i = idx(x, y, z, shape);
        const e = hashNoise4(x, y, z, tNext, state.seed) * etaAmplitude;
        out._eta[i] = e;
        etaSum += e;
      }
    }
  }
  const etaMean = etaSum / n;
  for (let i = 0; i < n; i++) work[i] += out._eta[i] - etaMean;

  const gradH = out._gradH || out._lap;
  hamiltonianForceInto(work, gradH, shape, hParams);
  for (let i = 0; i < n; i++) work[i] -= hParams.eta * gradH[i];

  computeGradientInto(work, out.vector, shape);
  const nextDefect = walkDefect(state.defect, out.vector, shape);

  out.defect = nextDefect;
  out.t = tNext;
  out.operator = HAMILTONIAN_OPERATOR;
  out.hamiltonian = hParams;
  return out;
}

export function createProposalBuffers(shape = PROTO_SHAPE) {
  const n = shape.cellCount;
  const gradH = new Float32Array(n);
  return {
    scalar: new Float32Array(n),
    vector: new Float32Array(n * 3),
    _eta: new Float32Array(n),
    _lap: gradH,
    _gradH: gradH,
    operator: HAMILTONIAN_OPERATOR,
    defect: null,
    t: 0,
  };
}
