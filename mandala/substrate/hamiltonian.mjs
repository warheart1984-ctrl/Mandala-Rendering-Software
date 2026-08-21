/**
 * Lattice Hamiltonian — Mandala substrate (pixels) + Chamber-proposed physics.
 *
 * Claim A only (computational analogue). Not “this is our universe.”
 * Organ Map unchanged: lives under Mandala substrate; Chamber proposes; AAIS gates.
 *
 * H(σ) = Σ_i U(σ_i) + Σ_⟨i,j⟩ J_ij W(σ_i, σ_j)
 * U(σ_i) = (m²/2) ‖σ_i‖² + λ ‖σ_i‖⁴
 * W(σ_i, σ_j) = (1/2) ‖σ_i − σ_j‖²
 * ∂W/∂σ_i = (σ_i − σ_j)
 *
 * Scalar (n=1):
 *   ∂U/∂σ_i = m² σ_i + 4λ σ_i³
 *   dσ_i/dt = −m² σ_i − 4λ σ_i³ − Σ_{j∈N(i)} J_ij (σ_i − σ_j)
 * Discrete: σ_i(t+1) = σ_i(t) − η ∂H/∂σ_i
 *
 * Coupling with Neumann (missing neighbor = self) equals −J ∇²σ.
 * Certified proto default (m²=0, λ=0, J=1, η=κ) therefore matches the old
 * Laplacian update. On-site U (m², λ) is NOT mass-conserving: Σσ can change.
 * AAIS still rejects unlawful commits. Do not treat H-flow as a mass solver.
 *
 * Status: **working** for scalar 2D / 3D. Vector σ (n>1): **partial**.
 * 32³ viz: **declared** (proto already evolves certified 32³; 2D scans are the artifacts).
 */

export const HAMILTONIAN_STATUS = "working";
export const HAMILTONIAN_OPERATOR = "lattice-hamiltonian";
export const HAMILTONIAN_CLAIM = "A";

export const DEFAULT_LATTICE_PARAMS = Object.freeze({
  m2: 0,
  lambda: 0,
  J: 1,
  eta: 0.05,
  nComp: 1,
});

export function cellCountOf(shape) {
  if (typeof shape.cellCount === "number") return shape.cellCount;
  return shape.nx * shape.ny * (shape.nz || 1);
}

export function latticeIdx(x, y, z, shape) {
  return x + shape.nx * (y + shape.ny * (z || 0));
}

export function createLattice({ nx = 16, ny = 16, nz = 1, fill = 0 } = {}) {
  const shape = { nx, ny, nz, cellCount: nx * ny * nz };
  const sigma = new Float32Array(shape.cellCount);
  if (fill) sigma.fill(fill);
  return { shape, sigma, nComp: 1 };
}

/**
 * On-site U and ∂U/∂σ for scalar (or per-component of a vector).
 */
export function siteU(s, { m2 = 0, lambda = 0 } = {}) {
  const s2 = s * s;
  return 0.5 * m2 * s2 + lambda * s2 * s2;
}

export function siteDU(s, { m2 = 0, lambda = 0 } = {}) {
  return m2 * s + 4 * lambda * s * s * s;
}

/**
 * Unique-edge energy Σ_⟨i,j⟩ J W, W = (1/2)(σ_i−σ_j)². Neumann: no wrap.
 */
export function couplingEnergy(sigma, shape, J = 1) {
  const { nx, ny, nz = 1 } = shape;
  let h = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = latticeIdx(x, y, z, shape);
        const s = sigma[i];
        if (x + 1 < nx) {
          const d = s - sigma[latticeIdx(x + 1, y, z, shape)];
          h += 0.5 * J * d * d;
        }
        if (y + 1 < ny) {
          const d = s - sigma[latticeIdx(x, y + 1, z, shape)];
          h += 0.5 * J * d * d;
        }
        if (z + 1 < nz) {
          const d = s - sigma[latticeIdx(x, y, z + 1, shape)];
          h += 0.5 * J * d * d;
        }
      }
    }
  }
  return h;
}

export function hamiltonianEnergy(sigma, shape, params = DEFAULT_LATTICE_PARAMS) {
  const { m2 = 0, lambda = 0, J = 1 } = params;
  let u = 0;
  for (let i = 0; i < sigma.length; i++) u += siteU(sigma[i], { m2, lambda });
  return u + couplingEnergy(sigma, shape, J);
}

/**
 * Analytic ∂H/∂σ_i into `out` (same length as sigma).
 * ∂H/∂σ_i = ∂U/∂σ_i + Σ_{j∈N(i)} J (σ_i − σ_j)
 */
export function hamiltonianForceInto(sigma, out, shape, params = DEFAULT_LATTICE_PARAMS) {
  const { nx, ny, nz = 1 } = shape;
  const { m2 = 0, lambda = 0, J = 1 } = params;
  const n = cellCountOf(shape);
  if (!out || out.length < n) {
    throw new Error("hamiltonianForceInto requires out length >= cellCount");
  }
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = latticeIdx(x, y, z, shape);
        const s = sigma[i];
        let coup = 0;
        if (x > 0) coup += J * (s - sigma[latticeIdx(x - 1, y, z, shape)]);
        if (x + 1 < nx) coup += J * (s - sigma[latticeIdx(x + 1, y, z, shape)]);
        if (y > 0) coup += J * (s - sigma[latticeIdx(x, y - 1, z, shape)]);
        if (y + 1 < ny) coup += J * (s - sigma[latticeIdx(x, y + 1, z, shape)]);
        if (z > 0) coup += J * (s - sigma[latticeIdx(x, y, z - 1, shape)]);
        if (z + 1 < nz) coup += J * (s - sigma[latticeIdx(x, y, z + 1, shape)]);
        out[i] = siteDU(s, { m2, lambda }) + coup;
      }
    }
  }
  return out;
}

/**
 * One discrete gradient-flow step: σ ← σ − η ∂H/∂σ. Writes `next`.
 * Does not conserve Σσ unless m²=λ=0 (coupling-only).
 */
export function relaxStep(sigma, next, shape, params = DEFAULT_LATTICE_PARAMS, forceScratch) {
  const n = sigma.length;
  const eta = params.eta ?? DEFAULT_LATTICE_PARAMS.eta;
  const force = forceScratch && forceScratch.length >= n ? forceScratch : new Float32Array(n);
  hamiltonianForceInto(sigma, force, shape, params);
  for (let i = 0; i < n; i++) next[i] = sigma[i] - eta * force[i];
  return { next, force, eta };
}

export function meanSigma(sigma) {
  let s = 0;
  for (let i = 0; i < sigma.length; i++) s += sigma[i];
  return s / sigma.length;
}

export function meanAbsSigma(sigma) {
  let s = 0;
  for (let i = 0; i < sigma.length; i++) s += Math.abs(sigma[i]);
  return s / sigma.length;
}

export function maxAbsForce(force) {
  let m = 0;
  for (let i = 0; i < force.length; i++) {
    const a = Math.abs(force[i]);
    if (a > m) m = a;
  }
  return m;
}

export function maxAbsDelta(a, b) {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

/**
 * Cheap two-point correlator C(r) = ⟨σ_i σ_{i+r ê_x}⟩ − ⟨σ⟩² along +x.
 */
export function twoPointCorrX(sigma, shape, r = 1) {
  const { nx, ny, nz = 1 } = shape;
  const mean = meanSigma(sigma);
  let acc = 0;
  let n = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x + r < nx; x++) {
        acc += sigma[latticeIdx(x, y, z, shape)] * sigma[latticeIdx(x + r, y, z, shape)];
        n++;
      }
    }
  }
  return n ? acc / n - mean * mean : 0;
}

/**
 * Connected components of sign(σ) (4-neighbor 2D / 6-neighbor 3D). Optional diagnostic.
 */
export function countSignDomains(sigma, shape, eps = 1e-6) {
  const { nx, ny, nz = 1 } = shape;
  const n = cellCountOf(shape);
  const seen = new Uint8Array(n);
  let domains = 0;
  const stack = [];
  const neigh = (x, y, z, out) => {
    out.length = 0;
    if (x > 0) out.push(latticeIdx(x - 1, y, z, shape));
    if (x + 1 < nx) out.push(latticeIdx(x + 1, y, z, shape));
    if (y > 0) out.push(latticeIdx(x, y - 1, z, shape));
    if (y + 1 < ny) out.push(latticeIdx(x, y + 1, z, shape));
    if (z > 0) out.push(latticeIdx(x, y, z - 1, shape));
    if (z + 1 < nz) out.push(latticeIdx(x, y, z + 1, shape));
    return out;
  };
  const buf = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const s = Math.abs(sigma[i]) < eps ? 0 : Math.sign(sigma[i]);
    if (s === 0) {
      seen[i] = 1;
      continue;
    }
    domains++;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      const x = cur % nx;
      const t = (cur / nx) | 0;
      const y = t % ny;
      const z = (t / ny) | 0;
      neigh(x, y, z, buf);
      for (const j of buf) {
        if (seen[j]) continue;
        const sj = Math.abs(sigma[j]) < eps ? 0 : Math.sign(sigma[j]);
        if (sj !== s) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return domains;
}

export function describeLatticeHamiltonian() {
  return {
    organ: "Mandala",
    proposer: "SimulationChamber",
    gate: "AAIS",
    operator: HAMILTONIAN_OPERATOR,
    status: HAMILTONIAN_STATUS,
    claim: HAMILTONIAN_CLAIM,
    formula: "H=Σ U + Σ_⟨ij⟩ J W; U=(m²/2)σ²+λσ⁴; W=(1/2)(σ_i-σ_j)²",
    flow: "dσ/dt = −∂H/∂σ; σ ← σ − η ∂H/∂σ",
    mass: "coupling conserves Σσ (Neumann); φ⁴ U does not. Invariants still reject.",
    vectorSigma: "partial",
    viz3d32: "declared — proto certified 32³ uses this operator; scan artifacts are 2D",
  };
}
