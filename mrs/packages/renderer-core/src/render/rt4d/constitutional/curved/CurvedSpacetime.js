/**
 * CurvedSpacetime — position-dependent 4D metric + geodesic integration.
 *
 * Constitutional-arena extension: unlike the flat Minkowski ChristoffelSymbols
 * (constant metric => all Christoffel symbols zero), this module computes the
 * connection from a position-dependent metric field and integrates timelike and
 * null geodesics (orbits + perihelion precession, gravitational deflection and
 * photon capture) with full certification and provenance per step.
 * Deterministic: no RNG.
 *
 * Metric implemented: isotropic Schwarzschild (weak-field form)
 *   g_tt = -(1 - 2M/r),  g_xx = g_yy = g_zz = 1 + 2M/r,  off-diagonal = 0
 * with r = sqrt(x^2 + y^2 + z^2). Christoffel symbols are computed numerically
 * from the metric's first derivatives (central finite differences), so the
 * integrator works for any differentiable diagonal metric.
 */

import { FourVector } from "../tensor/TensorTypes.js";
import {
  CertifiedProjection,
  Projector4DTo3D,
  ProjectionPolicy,
} from "../projection/Projector4DTo3D.js";
import { certifyTensor, CertifiedTensor, AUTHORITIES } from "../governance/CertifiedTensor.js";
import { createHash } from "node:crypto";

const DIMS = 4;

export class CurvedSpacetimeMetric {
  constructor(config = {}) {
    this.M = config.M ?? 0.2;
    this.h = config.h ?? 1e-6;
    this.signature = [-1, 1, 1, 1];
    this.name = config.name ?? "isotropic-schwarzschild-weak-field";
  }

  componentAt(x, mu, nu) {
    if (mu !== nu) return 0;
    const r = this._r(x);
    if (mu === 0) return -(1 - (2 * this.M) / r);
    return 1 + (2 * this.M) / r;
  }

  matrixAt(x) {
    const g = new Array(16).fill(0);
    for (let mu = 0; mu < DIMS; mu++) g[mu * 4 + mu] = this.componentAt(x, mu, mu);
    return g;
  }

  inverseAt(x) {
    const gInv = new Array(16).fill(0);
    for (let mu = 0; mu < DIMS; mu++) gInv[mu * 4 + mu] = 1 / this.componentAt(x, mu, mu);
    return gInv;
  }

  partialDeriv(x, alpha, mu, nu) {
    const xp = x.slice();
    const xm = x.slice();
    xp[alpha] += this.h;
    xm[alpha] -= this.h;
    return (this.componentAt(xp, mu, nu) - this.componentAt(xm, mu, nu)) / (2 * this.h);
  }

  christoffelAt(x, mu, alpha, beta) {
    let sum = 0;
    for (let sigma = 0; sigma < DIMS; sigma++) {
      const gInv = this.inverseAt(x);
      const term1 = this.partialDeriv(x, alpha, sigma, beta);
      const term2 = this.partialDeriv(x, beta, sigma, alpha);
      const term3 = this.partialDeriv(x, sigma, alpha, beta);
      sum += gInv[mu * 4 + sigma] * (term1 + term2 - term3);
    }
    return 0.5 * sum;
  }

  christoffelNonZeroAt(x) {
    let count = 0;
    for (let mu = 0; mu < DIMS; mu++) {
      for (let alpha = 0; alpha < DIMS; alpha++) {
        for (let beta = 0; beta < DIMS; beta++) {
          if (Math.abs(this.christoffelAt(x, mu, alpha, beta)) > 1e-12) count++;
        }
      }
    }
    return count;
  }

  norm2At(x, u) {
    let n = 0;
    for (let mu = 0; mu < DIMS; mu++) {
      for (let nu = 0; nu < DIMS; nu++) {
        n += this.componentAt(x, mu, nu) * u[mu] * u[nu];
      }
    }
    return n;
  }

  isTimelikeAt(x, u) {
    return this.norm2At(x, u) < 0;
  }

  innerProductAt(x, u, v) {
    let n = 0;
    for (let mu = 0; mu < DIMS; mu++) {
      for (let nu = 0; nu < DIMS; nu++) {
        n += this.componentAt(x, mu, nu) * u[mu] * v[nu];
      }
    }
    return n;
  }

  geodesicAcceleration(x, u) {
    const a = new Array(DIMS).fill(0);
    for (let mu = 0; mu < DIMS; mu++) {
      let sum = 0;
      for (let alpha = 0; alpha < DIMS; alpha++) {
        for (let beta = 0; beta < DIMS; beta++) {
          sum += this.christoffelAt(x, mu, alpha, beta) * u[alpha] * u[beta];
        }
      }
      a[mu] = -sum;
    }
    return a;
  }

  renormalize(x, u, kind = "timelike", ut = null) {
    if (kind === "null") return this._renormalizeNull(x, u, ut);
    const n2 = this.norm2At(x, u);
    const s = Math.sqrt(Math.abs(n2));
    if (s < 1e-14) return u.slice();
    return u.map((c) => c / s);
  }

  /**
   * Project a null vector onto the null cone while preserving the covariant
   * time component u_t (the energy of the timelike Killing vector, conserved
   * exactly along null geodesics). u0 solves g_tt*u0^2 + gsp*|u_spatial|^2 = 0
   * given u_t = g_tt * u0 fixed at its initial value `ut`.
   */
  _renormalizeNull(x, u, ut) {
    const s2 = u[1] * u[1] + u[2] * u[2] + u[3] * u[3];
    if (s2 < 1e-20) return u.slice();
    const r = this._r(x);
    const gtt = -(1 - (2 * this.M) / r);
    const gsp = 1 + (2 * this.M) / r;
    const e = ut ?? gtt * u[0];
    const u0 = e / gtt;
    const spatialMag = Math.sqrt((-gtt * u0 * u0) / gsp);
    const scale = spatialMag / Math.sqrt(s2);
    return [u0, u[1] * scale, u[2] * scale, u[3] * scale];
  }

  _r(x) {
    return Math.sqrt(x[1] * x[1] + x[2] * x[2] + x[3] * x[3]);
  }

  hash() {
    let h = 0x811c9dc5;
    for (const s of this.signature) {
      const bytes = new Float64Array([s]);
      const view = new Uint8Array(bytes.buffer);
      for (const b of view) {
        h ^= b;
        h = Math.imul(h, 0x01000193);
      }
    }
    h ^= this.M * 1e9;
    h = Math.imul(h, 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}

export class CurvedGeodesicRunner {
  constructor(config = {}) {
    this.metric = config.metric ?? new CurvedSpacetimeMetric({ M: config.M ?? 0.2 });
    this.projector = new Projector4DTo3D();
    this.policy = config.policy ?? ProjectionPolicy.orthographic();
    this.camera = config.camera ?? null;
    this.dtau = config.dtau ?? 0.01;
    this.curveType = config.curveType ?? "timelike";
    this.captureR = config.captureR ?? (config.M ?? 0.2) * 2 + 0.08;
    this.energyTol = config.energyTol ?? 1e-6;
    this.angularTol = config.angularTol ?? (this.curveType === "null" ? 1e-5 : 1e-6);
    this.trajectory = [];
    this.certifications = [];
    this.provenanceChain = [];
    this.curvature = null;
    this.captured = false;
  }

  run(x0, u0, steps) {
    let x = x0.slice();
    let u = this.metric.renormalize(x, x0 && u0 ? u0.slice() : [1, 0, 0, 0], this.curveType);
    const ut0 = this.metric.componentAt(x, 0, 0) * u[0];

    const E0 = this.metric.componentAt(x, 0, 0) * u[0];
    const L0 = x[1] * this.metric.componentAt(x, 2, 2) * u[2] - x[2] * this.metric.componentAt(x, 1, 1) * u[1];

    this.curvature = {
      christoffelNonZero: this.metric.christoffelNonZeroAt(x),
      metricHash: this.metric.hash(),
    };

    for (let step = 0; step < steps; step++) {
      if (this.metric._r(x) < this.captureR) {
        this.captured = true;
        break;
      }
      const k1 = this.metric.geodesicAcceleration(x, u);
      const k2x = x.map((c, i) => c + 0.5 * this.dtau * u[i]);
      const k2u = u.map((c, i) => c + 0.5 * this.dtau * k1[i]);
      const k2 = this.metric.geodesicAcceleration(k2x, k2u);
      const k3x = x.map((c, i) => c + 0.5 * this.dtau * k2u[i]);
      const k3u = u.map((c, i) => c + 0.5 * this.dtau * k2[i]);
      const k3 = this.metric.geodesicAcceleration(k3x, k3u);
      const k4x = x.map((c, i) => c + this.dtau * k3u[i]);
      const k4u = u.map((c, i) => c + this.dtau * k3[i]);
      const k4 = this.metric.geodesicAcceleration(k4x, k4u);

      const xNext = x.map((c, i) => c + (this.dtau / 6) * (u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]));
      const uRaw = u.map((c, i) => c + (this.dtau / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      const uNext = this.metric.renormalize(xNext, uRaw, this.curveType, ut0);

      const norm2 = this.metric.norm2At(xNext, uNext);
      const E = this.metric.componentAt(xNext, 0, 0) * uNext[0];
      const L =
        xNext[1] * this.metric.componentAt(xNext, 2, 2) * uNext[2] -
        xNext[2] * this.metric.componentAt(xNext, 1, 1) * uNext[1];
      const energyDrift = Math.abs(E - E0) / Math.max(1e-12, Math.abs(E0));
      const angularDrift = Math.abs(L - L0) / Math.max(1e-12, Math.abs(L0));

      const position4D = new FourVector(xNext[0], xNext[1], xNext[2], xNext[3], null);
      const projectionResult = this.projector.project(position4D, this.policy, this.camera);

      const curveChecks =
        this.curveType === "null"
          ? [{ name: "NULL_CONDITION", passed: Math.abs(norm2) < 1e-6, norm2 }]
          : [{ name: "TIMELIKE", passed: norm2 < 0, norm2 }];

      const checks = [
        { name: "FOUR_VELOCITY_NORMALIZATION", passed: Math.abs(Math.abs(norm2) - (this.curveType === "null" ? 0 : 1)) < 1e-6, norm2 },
        ...curveChecks,
        { name: "ENERGY_CONSERVATION", passed: energyDrift < this.energyTol, energyDrift },
        { name: "ANGULAR_MOMENTUM_CONSERVATION", passed: angularDrift < this.angularTol, angularDrift },
      ];
      const checksPass = checks.every((c) => c.passed);

      const positionCert = certifyTensor(
        position4D,
        AUTHORITIES.KINEMATICS_ENGINE,
        checks,
        [{ type: "geodesic_step", step, checksPass }]
      );

      const certifiedProjection = CertifiedProjection.create(projectionResult, {
        stateId: `CURVED-STATE-${step}`,
        cameraId: this.camera?.cameraId ?? null,
        metricId: this.metric.hash(),
        projectionMode: this.policy.mode,
        projectionParameters: this.policy.getParameters(),
        sourceCertificate: positionCert,
      });
      certifiedProjection.setVerification(CertifiedTensor._hashTensor(certifiedProjection.projection));

      const replayToken = createHash("sha256")
        .update(`${step}|${xNext[0]}|${xNext[1]}|${xNext[2]}|${xNext[3]}`)
        .digest("hex");

      this.trajectory.push({
        step,
        position: xNext,
        velocity: uNext,
        projection: projectionResult,
        checks,
        checksPass,
        certificationId: positionCert.certificationId,
        replayToken,
      });
      this.certifications.push(positionCert);
      this.provenanceChain.push({
        step,
        certificationId: positionCert.certificationId,
        replayToken,
        projection: certifiedProjection.toProvenanceRecord(),
      });

      x = xNext;
      u = uNext;
    }

    return {
      trajectory: this.trajectory,
      certifications: this.certifications,
      provenanceChain: this.provenanceChain,
      curvature: this.curvature,
      captured: this.captured,
      allChecksPass: this.trajectory.every((t) => t.checksPass),
    };
  }
}

export function createWeakFieldMetric(M = 0.2) {
  return new CurvedSpacetimeMetric({ M });
}
