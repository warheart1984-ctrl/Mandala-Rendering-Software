import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { FourVector } from "../constitutional/tensor/index.js";
import { FourVelocity } from "../constitutional/kinematics/index.js";
import { Camera4D, ProjectionPolicy } from "../constitutional/projection/index.js";
import { createInitializedRuntime } from "../constitutional/runtime/index.js";

export class CertifiedSun {
  /**
   * @param {object} config
   * @param {number[]} [config.metricSignature] = [-1, 1, 1, 1]
   * @param {number} [config.c] = 1
   * @param {number} [config.dtau] = 0.03
   * @param {number} [config.frames] = 300
   * @param {number} [config.d4] = 4
   * @param {number[]} [config.initialPosition] = [0, -0.40, 0, 0]
   * @param {number[]} [config.initialVelocity] = [1.71636, 1.35, 0.35, 0.03]
   * @param {object} [config.governance] = { strictMode: false, requireReplay: false, requireAudit: false }
   */
  constructor(config = {}) {
    this.config = {
      metricSignature: [-1, 1, 1, 1],
      c: 1,
      dtau: 0.03,
      frames: 300,
      d4: 4,
      initialPosition: [0, -0.40, 0, 0],
      initialVelocity: [1.71636, 1.35, 0.35, 0.03],
      governance: { strictMode: false, requireReplay: false, requireAudit: false },
      ...config,
    };
    this.runtime = null;
    this.stepRecords = [];
  }

  /** Advance the worldline `frames` steps; store step records. Deterministic. */
  async advance() {
    const metric = MetricTensor.minkowski();
    const [ct, s1, s2, s3] = this.config.initialPosition;
    const [v_ct, v_s1, v_s2, v_s3] = this.config.initialVelocity;

    this.runtime = createInitializedRuntime({
      metricSignature: this.config.metricSignature,
      c: this.config.c,
      dtau: this.config.dtau,
      d4: this.config.d4,
      camera: Camera4D.atOrigin(),
      projectionPolicy: ProjectionPolicy.perspective(this.config.d4),
      position: new FourVector(ct, s1, s2, s3, metric),
      velocity: new FourVelocity(new FourVector(v_ct, v_s1, v_s2, v_s3, metric), metric).normalize(this.config.c),
      mass: 1.0,
      governance: this.config.governance,
    });

    this.stepRecords = [];
    for (let i = 0; i < this.config.frames; i++) {
      const step = await this.runtime.step();
      this.stepRecords.push(this._makeStepRecord(i, step));
    }
    return this.stepRecords;
  }

  /** Certified sun state at step N. Pure once advanced. */
  stepRecord(N) {
    return this.stepRecords[N];
  }

  /** The underlying ConstitutionalRuntime (for verifyReplay / provenance chain). */
  getRuntime() {
    return this.runtime;
  }

  getProvenanceChain() {
    return this.runtime?.getProvenanceChain() ?? [];
  }

  _makeStepRecord(N, step) {
    return {
      step: N,
      position4: step.position,
      velocity4: step.velocity,
      p3: { x: step.projection.x, y: step.projection.y, z: step.projection.z },
      projection: step.projection,
      provenance: step.provenance,
    };
  }
}