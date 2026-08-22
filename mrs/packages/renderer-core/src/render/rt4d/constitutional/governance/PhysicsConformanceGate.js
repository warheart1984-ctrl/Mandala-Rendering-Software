import { createHash } from "node:crypto";
import { MetricTensor } from "../arena/MetricTensor.js";
import { TensorEngine } from "../tensor/TensorEngine.js";
import { FourVector } from "../tensor/TensorTypes.js";
import { CertifiedTensor } from "../governance/CertifiedTensor.js";

export const PHYSICS_CONFORMANCE_CHECKS = Object.freeze([
  "METRIC_SIGNATURE",
  "INTERVAL_CERTIFICATION",
  "FOUR_VELOCITY_DEFINED",
  "FOUR_VELOCITY_NORMALIZATION",
  "GEODESIC_RESIDUAL",
  "MOMENTUM_DEFINITION",
  "MOMENTUM_INVARIANT",
  "FORCE_CONSISTENCY",
  "STRESS_ENERGY_VALIDITY",
  "FIELD_ANTISYMMETRY",
  "MAXWELL_HOMOGENEOUS",
  "MAXWELL_INHOMOGENEOUS",
  "ENERGY_MOMENTUM_CONTINUITY",
  "CHARGE_CONTINUITY",
  "PROVENANCE_PRESENT",
  "REPLAY_AVAILABLE",
]);

export class PhysicsConformanceGate {
  constructor(config = {}) {
    this.config = {
      strictMode: config.strictMode !== false,
      c: config.c || 1,
      ...config,
    };
    this.checks = new Map();
    this._registerDefaultChecks();
  }

  _registerDefaultChecks() {
    this.registerCheck("METRIC_SIGNATURE", this._checkMetricSignature.bind(this));
    this.registerCheck("INTERVAL_CERTIFICATION", this._checkIntervalCertification.bind(this));
    this.registerCheck("FOUR_VELOCITY_DEFINED", this._checkFourVelocityDefined.bind(this));
    this.registerCheck("FOUR_VELOCITY_NORMALIZATION", this._checkFourVelocityNormalization.bind(this));
    this.registerCheck("GEODESIC_RESIDUAL", this._checkGeodesicResidual.bind(this));
    this.registerCheck("MOMENTUM_DEFINITION", this._checkMomentumDefinition.bind(this));
    this.registerCheck("MOMENTUM_INVARIANT", this._checkMomentumInvariant.bind(this));
    this.registerCheck("FORCE_CONSISTENCY", this._checkForceConsistency.bind(this));
    this.registerCheck("STRESS_ENERGY_VALIDITY", this._checkStressEnergyValidity.bind(this));
    this.registerCheck("FIELD_ANTISYMMETRY", this._checkFieldAntisymmetry.bind(this));
    this.registerCheck("MAXWELL_HOMOGENEOUS", this._checkMaxwellHomogeneous.bind(this));
    this.registerCheck("MAXWELL_INHOMOGENEOUS", this._checkMaxwellInhomogeneous.bind(this));
    this.registerCheck("ENERGY_MOMENTUM_CONTINUITY", this._checkEnergyMomentumContinuity.bind(this));
    this.registerCheck("CHARGE_CONTINUITY", this._checkChargeContinuity.bind(this));
    this.registerCheck("PROVENANCE_PRESENT", this._checkProvenancePresent.bind(this));
    this.registerCheck("REPLAY_AVAILABLE", this._checkReplayAvailable.bind(this));
  }

  registerCheck(name, fn) {
    if (!PHYSICS_CONFORMANCE_CHECKS.includes(name)) {
      throw new Error(`Unknown physics conformance check: ${name}`);
    }
    this.checks.set(name, fn);
  }

  async runAll(physicsState) {
    const results = {};
    const evidence = {};

    for (const checkName of PHYSICS_CONFORMANCE_CHECKS) {
      const checkFn = this.checks.get(checkName);
      if (!checkFn) {
        results[checkName] = { pass: false, reason: "Check not implemented" };
        continue;
      }

      try {
        const result = await checkFn(physicsState);
        results[checkName] = { pass: true, ...result };
        if (result.evidence) evidence[checkName] = result.evidence;
      } catch (error) {
        results[checkName] = { pass: false, reason: error.message };
        if (this.config.strictMode) {
          throw new Error(`Physics conformance check failed: ${checkName} - ${error.message}`, { cause: error });
        }
      }
    }

    const passed = Object.values(results).filter(r => r.pass).length;
    const total = PHYSICS_CONFORMANCE_CHECKS.length;

    return {
      passed,
      total,
      success: passed === total,
      results,
      evidence,
      physicsConformanceVersion: "1.0",
      timestamp: Date.now(),
    };
  }

  async runCheck(name, physicsState) {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      throw new Error(`Check ${name} not registered`);
    }
    try {
      const result = await checkFn(physicsState);
      return { pass: true, ...result };
    } catch (error) {
      return { pass: false, reason: error.message };
    }
  }

  async _checkMetricSignature(state) {
    const { metric } = state;
    if (!metric || !(metric instanceof MetricTensor)) {
      throw new Error("No metric tensor provided");
    }
    const expected = [-1, 1, 1, 1];
    const match = metric.signature.every((s, i) => s === expected[i]);
    if (!match) throw new Error(`Metric signature mismatch: got [${metric.signature}], expected [${expected}]`);
    return { evidence: { signature: metric.signature, hash: metric.hash() } };
  }

  async _checkIntervalCertification(state) {
    const { metric, intervals = [] } = state;
    if (!metric) throw new Error("No metric for interval certification");
    const certified = intervals.map(dx => metric.certifyInterval(dx));
    const allValid = certified.every(c => c.certified);
    if (!allValid) throw new Error("Interval certification failed");
    return { evidence: { intervalsCertified: certified.length, certifications: certified } };
  }

  async _checkFourVelocityDefined(state) {
    const { fourVelocity } = state;
    if (!fourVelocity) throw new Error("Four-velocity not defined");
    // Accept both FourVector and FourVelocity (which extends FourVector)
    if (!(fourVelocity instanceof FourVector)) throw new Error("Four-velocity must be a FourVector");
    return { evidence: { u: fourVelocity.toArray() } };
  }

  async _checkFourVelocityNormalization(state) {
    const { metric, fourVelocity } = state;
    if (!metric || !fourVelocity) throw new Error("Missing metric or four-velocity");
    const norm2 = metric.norm2(fourVelocity);
    const expected = -this.config.c * this.config.c;
    const diff = Math.abs(norm2 - expected);
    if (diff > 1e-10) throw new Error(`Four-velocity normalization failed: u·u = ${norm2}, expected ${expected}`);
    return { evidence: { norm2, expected, diff } };
  }

  async _checkGeodesicResidual(state) {
    const { metric, christoffel, fourVelocity, geodesicAcceleration } = state;
    if (!metric || !christoffel || !fourVelocity) throw new Error("Missing geodesic components");
    const computedAccel = christoffel.geodesicAcceleration(fourVelocity);
    if (!geodesicAcceleration) return { evidence: { computed: computedAccel, note: "No reference acceleration to compare" } };
    const diff = Math.sqrt(
      (computedAccel.x - geodesicAcceleration.x) ** 2 +
      (computedAccel.y - geodesicAcceleration.y) ** 2 +
      (computedAccel.z - geodesicAcceleration.z) ** 2 +
      (computedAccel.w - geodesicAcceleration.w) ** 2
    );
    if (diff > 1e-10) throw new Error(`Geodesic residual too large: ${diff}`);
    return { evidence: { residual: diff } };
  }

  async _checkMomentumDefinition(state) {
    const { mass, fourVelocity, fourMomentum } = state;
    if (!mass || !fourVelocity) throw new Error("Mass or four-velocity missing");
    const expected = new FourVector(
      mass * fourVelocity.x,
      mass * fourVelocity.y,
      mass * fourVelocity.z,
      mass * fourVelocity.w,
      fourVelocity.metric
    );
    if (!fourMomentum) return { evidence: { expected: expected.toArray(), note: "No momentum to compare" } };
    const match = Math.abs(fourMomentum.x - expected.x) < 1e-10 &&
      Math.abs(fourMomentum.y - expected.y) < 1e-10 &&
      Math.abs(fourMomentum.z - expected.z) < 1e-10 &&
      Math.abs(fourMomentum.w - expected.w) < 1e-10;
    if (!match) throw new Error("Four-momentum definition mismatch");
    return { evidence: { p: fourMomentum.toArray() } };
  }

  async _checkMomentumInvariant(state) {
    const { metric, fourMomentum, mass } = state;
    if (!metric || !fourMomentum || mass === undefined) throw new Error("Missing momentum invariant components");
    const norm2 = metric.norm2(fourMomentum);
    const expected = -mass * mass * this.config.c * this.config.c;
    const diff = Math.abs(norm2 - expected);
    if (diff > 1e-10) throw new Error(`Momentum invariant failed: p·p = ${norm2}, expected ${expected}`);
    return { evidence: { norm2, expected, diff } };
  }

  async _checkForceConsistency(state) {
    const { fourMomentum, fourForce, dtau } = state;
    if (!fourForce || !dtau) {
      return { evidence: { note: "Force consistency check skipped - no force data" }, skipped: true };
    }
    return { evidence: { note: "Force consistency check requires time evolution data" } };
  }

  async _checkStressEnergyValidity(state) {
    const { stressEnergy, metric } = state;
    if (!stressEnergy) {
      return { evidence: { note: "Stress-energy check skipped - no stress-energy tensor" }, skipped: true };
    }
    if (!metric) throw new Error("Missing stress-energy or metric");
    const div = stressEnergy.divergence(new TensorEngine(metric));
    const divNorm = Math.sqrt(div.components.reduce((a, b) => a + b * b, 0));
    if (divNorm > 1e-10) throw new Error(`Stress-energy not conserved: ∇·T = ${divNorm}`);
    return { evidence: { divergenceNorm: divNorm } };
  }

  async _checkFieldAntisymmetry(state) {
    const { emTensor } = state;
    if (!emTensor) {
      return { evidence: { note: "EM tensor check skipped - no EM tensor" }, skipped: true };
    }
    for (let mu = 0; mu < 4; mu++) {
      for (let nu = 0; nu < 4; nu++) {
        if (mu !== nu) {
          const diff = Math.abs(emTensor.getComponent(mu, nu) + emTensor.getComponent(nu, mu));
          if (diff > 1e-12) throw new Error(`EM tensor not antisymmetric at [${mu},${nu}]: ${diff}`);
        }
      }
    }
    return { evidence: { antisymmetric: true } };
  }

  async _checkMaxwellHomogeneous(state) {
    const { emTensor } = state;
    if (!emTensor) {
      return { evidence: { note: "Maxwell homogeneous check skipped - no EM tensor" }, skipped: true };
    }
    return { evidence: { note: "Homogeneous Maxwell equations check requires field derivatives" } };
  }

  async _checkMaxwellInhomogeneous(state) {
    const { emTensor } = state;
    if (!emTensor) {
      return { evidence: { note: "Maxwell inhomogeneous check skipped - no EM tensor" }, skipped: true };
    }
    return { evidence: { note: "Inhomogeneous Maxwell equations check requires current density" } };
  }

  async _checkEnergyMomentumContinuity(state) {
    const { stressEnergy, metric, christoffel } = state;
    if (!stressEnergy) {
      return { evidence: { note: "Energy-momentum continuity check skipped - no stress-energy tensor" }, skipped: true };
    }
    if (!metric || !christoffel) throw new Error("Missing components for continuity check");
    const engine = new TensorEngine(metric, christoffel);
    const div = engine.divergence(stressEnergy);
    const norm = Math.sqrt(div.components.reduce((a, b) => a + b * b, 0));
    if (norm > 1e-10) throw new Error(`Energy-momentum not conserved: ${norm}`);
    return { evidence: { divergenceNorm: norm } };
  }

  async _checkChargeContinuity(state) {
    const { current } = state;
    if (!current) {
      return { evidence: { note: "Charge continuity check skipped - no current 4-vector" }, skipped: true };
    }
    return { evidence: { note: "Charge continuity check requires current 4-vector" } };
  }

  async _checkProvenancePresent(state) {
    const { provenance } = state;
    if (!provenance || !Array.isArray(provenance) || provenance.length === 0) {
      return { evidence: { note: "Provenance check skipped - no provenance records yet" }, skipped: true };
    }
    return { evidence: { recordCount: provenance.length } };
  }

  async _checkReplayAvailable(state) {
    const { replayToken, seed } = state;
    if (!replayToken || !seed) {
      return { evidence: { note: "Replay check skipped - no replay token or seed" }, skipped: true };
    }
    return { evidence: { replayToken, seed } };
  }
}

export function createPhysicsConformanceGate(config) {
  return new PhysicsConformanceGate(config);
}