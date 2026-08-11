import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { FourVector } from "../constitutional/tensor/index.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, CertifiedProjection } from "../constitutional/projection/index.js";
import { certifyTensor, AUTHORITIES } from "../constitutional/governance/index.js";
import { mulberry32 } from "./SkyField.js";

export const CANONICAL_WAVES = [
  { omega: 0.90, dir: [0.12, 0.99], amplitude: 0.090 },
  { omega: 1.70, dir: [0.82, 0.57], amplitude: 0.055 },
  { omega: 2.30, dir: [-0.45, 0.89], amplitude: 0.035 },
  { omega: 3.10, dir: [0.98, -0.20], amplitude: 0.020 },
];

export function buildWaveVectors(waveSpecs = CANONICAL_WAVES) {
  return waveSpecs.map(spec => {
    const dirMag = Math.hypot(spec.dir[0], spec.dir[1]) || 1;
    const dx = spec.dir[0] / dirMag;
    const dz = spec.dir[1] / dirMag;
    const kx = spec.omega * dx;
    const kz = spec.omega * dz;
    return {
      k: [spec.omega, kx, 0, kz],
      A: spec.amplitude,
      omega: spec.omega,
      dir: [dx, dz],
      phase0: 0,
    };
  });
}

export function certifyWaveVectors(waves, metric = MetricTensor.minkowski()) {
  return waves.map(w => {
    const kVec = new FourVector(...w.k, metric);
    const residual = Math.abs(metric.intervalVec4(kVec));
    const cert = certifyTensor(kVec, AUTHORITIES.FIELD_ENGINE, [
      { name: "null_wave_vector", residual, tolerance: 1e-9, passed: residual < 1e-9 },
    ]);
    // Add top-level residual for test compatibility (max of check residuals)
    cert.validation.residual = Math.max(...cert.validation.checks.map(c => c.residual));
    return cert;
  });
}

export function oceanHeight(x, z, tau, waves) {
  let h = 0;
  for (const w of waves) {
    const kx = w.k[1];
    const kz = w.k[3];
    h += w.A * Math.sin(kx * x + kz * z - w.omega * tau + w.phase0);
  }
  return h;
}

export function buildOceanHeightfield({ xMin = -40, xMax = 40, zMin = -120, zMax = -6, cols = 96, rows = 40, waves, tau }) {
  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const z = zMin + (r / (rows - 1)) * (zMax - zMin);
    for (let c = 0; c < cols; c++) {
      const x = xMin + (c / (cols - 1)) * (xMax - xMin);
      data[r * cols + c] = oceanHeight(x, z, tau, waves);
    }
  }
  return { data, cols, rows, xMin, xMax, zMin, zMax };
}

export function projectOceanAnchors(anchors, projector, policy, camera, opts = {}) {
  const metric = MetricTensor.minkowski();
  // Ocean anchors: 4D point with (ct=0, s1=height, s2=world-z, s3=0.25)
  // slot1 = world-y (elevation), slot2 = world-z, slot3 = perspective depth w (small, like sun)
  const W_ANCHOR = 0.25;
  return anchors.map(anchor => {
    const tau = opts.tau ?? 0;
    const waves = opts.waves ?? [];
    const h = oceanHeight(anchor[0], anchor[1], tau, waves);
    // anchor = [x, z], world position is (x, h, z)
    // 4D: (ct=0, s1=h, s2=z, s3=W_ANCHOR)
    const p4 = new FourVector(0, h, anchor[1], W_ANCHOR, metric);
    const cert = projector.projectCertified(p4, policy, camera, opts);
    return { anchor, p4: p4.toArray(), projection: cert.projection, errorBound: cert.certifiedProjection.projectionError, cert };
  });
}