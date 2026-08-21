/**
 * Lattice Hamiltonian simulation loop (2D N×N for tests/artifacts).
 * Physics σ only — not H_gov. Stop on |Δσ| or |ΔH| below threshold.
 *
 * Status: **working** at 16×16 / 32×32. Order-parameter scan vs coupling: **partial**
 * (structural change analogue, not a proven critical exponent).
 */

import {
  DEFAULT_LATTICE_PARAMS,
  hamiltonianEnergy,
  hamiltonianForceInto,
  relaxStep,
  meanSigma,
  meanAbsSigma,
  maxAbsDelta,
  twoPointCorrX,
  countSignDomains,
} from "../../substrate/hamiltonian.mjs";

export const SIM_STATUS = "working";
export const SCAN_STATUS = "partial";

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function initRandomLattice({ nx = 16, ny = 16, seed = 7, scale = 0.8 } = {}) {
  const rng = mulberry32(seed);
  const n = nx * ny;
  const sigma = new Float32Array(n);
  for (let i = 0; i < n; i++) sigma[i] = (rng() * 2 - 1) * scale;
  return { shape: { nx, ny, nz: 1, cellCount: n }, sigma, seed };
}

export function initWellLattice({
  nx = 16,
  ny = 16,
  cx,
  cy,
  amplitude = 1.2,
  sigmaWell = 2.5,
} = {}) {
  const n = nx * ny;
  const sigma = new Float32Array(n);
  const x0 = cx ?? (nx / 2) | 0;
  const y0 = cy ?? (ny / 2) | 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const dx = x - x0;
      const dy = y - y0;
      sigma[x + nx * y] = amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigmaWell * sigmaWell));
    }
  }
  return { shape: { nx, ny, nz: 1, cellCount: n }, sigma };
}

/**
 * Relax until |Δσ|_∞ or |ΔH| below threshold, or maxSteps.
 */
export function simulateLattice({
  sigma,
  shape,
  params = DEFAULT_LATTICE_PARAMS,
  maxSteps = 80,
  dSigmaStop = 1e-5,
  dHStop = 1e-7,
} = {}) {
  const n = sigma.length;
  const current = new Float32Array(sigma);
  const next = new Float32Array(n);
  const force = new Float32Array(n);
  const series = [];
  hamiltonianForceInto(current, force, shape, params);
  let obs = {
    t: 0,
    H: hamiltonianEnergy(current, shape, params),
    mean: meanSigma(current),
    meanAbs: meanAbsSigma(current),
    corr1: twoPointCorrX(current, shape, 1),
    domains: countSignDomains(current, shape),
    maxForce: force.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    dSigma: 0,
    dH: 0,
  };
  series.push(obs);
  let stopped = "max-steps";
  for (let t = 1; t <= maxSteps; t++) {
    relaxStep(current, next, shape, params, force);
    const dSigma = maxAbsDelta(next, current);
    const H = hamiltonianEnergy(next, shape, params);
    const dH = H - obs.H;
    current.set(next);
    hamiltonianForceInto(current, force, shape, params);
    obs = {
      t,
      H,
      mean: meanSigma(current),
      meanAbs: meanAbsSigma(current),
      corr1: twoPointCorrX(current, shape, 1),
      domains: countSignDomains(current, shape),
      maxForce: force.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
      dSigma,
      dH,
    };
    series.push(obs);
    if (dSigma < dSigmaStop || Math.abs(dH) < dHStop) {
      stopped = dSigma < dSigmaStop ? "|Δσ|" : "|ΔH|";
      break;
    }
  }
  return {
    status: SIM_STATUS,
    operator: "lattice-hamiltonian",
    shape,
    params: { ...params },
    sigma: current,
    series,
    stopped,
    steps: series.length - 1,
  };
}

/**
 * Scan m² (or J, λ) across a few values. Structural change analogue — **partial**.
 * Do not claim a proven critical exponent. “Singularity replacement” = structural
 * phase change, not infinite density.
 */
export function scanCoupling({
  nx = 16,
  ny = 16,
  seed = 7,
  vary = "m2",
  values = [0.8, 0.2, 0, -0.4, -1.0],
  base = { m2: -0.6, lambda: 0.25, J: 0.35, eta: 0.08 },
  maxSteps = 40,
} = {}) {
  const points = [];
  for (const v of values) {
    const params = { ...DEFAULT_LATTICE_PARAMS, ...base, [vary]: v };
    const init = initRandomLattice({ nx, ny, seed, scale: 0.9 });
    const run = simulateLattice({
      sigma: init.sigma,
      shape: init.shape,
      params,
      maxSteps,
    });
    const last = run.series[run.series.length - 1];
    points.push({
      vary,
      value: v,
      H: last.H,
      mean: last.mean,
      meanAbs: last.meanAbs,
      corr1: last.corr1,
      domains: last.domains,
      steps: run.steps,
    });
  }
  return {
    status: SCAN_STATUS,
    note:
      "Phase-transition analogue only. No critical exponent claimed. Structural change, not infinite density.",
    vary,
    values,
    base,
    points,
  };
}
