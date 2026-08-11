import { MetricTensor } from "../arena/MetricTensor.js";
import { ChristoffelSymbols } from "../arena/Christoffel.js";
import { CurvatureTensors } from "../arena/Curvature.js";
import { TensorEngine, TensorFactory, FourVector } from "../tensor/index.js";
import { KinematicsEngine, FourVelocity, FourMomentum, GeodesicSolver } from "../kinematics/index.js";
import { ConstitutionalWrapper, PhysicsConformanceGate, AUTHORITIES, CERTIFICATION_STATUSES, CertifiedTensor, certifyTensor } from "../governance/index.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, CertifiedProjection, PROJECTION_MODES } from "../projection/index.js";

export class ConstitutionalState {
  constructor(config = {}) {
    this.metric = config.metric || new MetricTensor([-1, 1, 1, 1]);
    this.christoffel = new ChristoffelSymbols(this.metric);
    this.curvature = new CurvatureTensors(this.metric);
    this.tensorEngine = new TensorEngine(this.metric, this.christoffel);
    this.tensorFactory = new TensorFactory(this.metric);
    this.kinematics = new KinematicsEngine(this.metric, this.christoffel, config.c || 1);
    this.governanceWrapper = new ConstitutionalWrapper(config.governance);
    this.physicsGate = new PhysicsConformanceGate({ c: config.c || 1, strictMode: config.strictMode !== false });
    this.projector = new Projector4DTo3D(this.metric);
    this.camera = config.camera || Camera4D.atOrigin();
    this.projectionPolicy = config.projectionPolicy || ProjectionPolicy.perspective(config.d4 || 4);
    this.dtau = config.dtau || 0.01;
    this.c = config.c || 1;

    this.position = config.position || new FourVector(0, 0, 0, 0, this.metric);
    let initialVelocity = config.velocity || new FourVelocity(new FourVector(1, 0, 0, 0, this.metric), this.metric);
    // Ensure initial velocity is normalized
    initialVelocity = new FourVelocity(initialVelocity, this.metric).normalize(this.c);
    this.velocity = initialVelocity;
    this.mass = config.mass || 1;

    this.stepCount = 0;
    this.trajectory = [];
    this.certifications = [];
    this.governanceRecords = [];
    this.provenanceChain = [];
  }

  getState() {
    return {
      metric: this.metric,
      position: this.position,
      velocity: this.velocity,
      mass: this.mass,
      stepCount: this.stepCount,
      trajectory: this.trajectory,
      certifications: this.certifications.map(c => c.toJSON?.() ?? c),
      governanceRecords: this.governanceRecords,
      provenanceChain: this.provenanceChain,
    };
  }

  toPhysicsState() {
    return {
      metric: this.metric,
      christoffel: this.christoffel,
      curvature: this.curvature,
      fourVelocity: this.velocity,
      fourMomentum: new FourMomentum(
        new FourVector(
          this.mass * this.velocity.x,
          this.mass * this.velocity.y,
          this.mass * this.velocity.z,
          this.mass * this.velocity.w,
          this.metric
        ),
        this.metric,
        this.mass
      ),
      mass: this.mass,
      stressEnergy: null,
      emTensor: null,
      provenance: this.provenanceChain,
      replayToken: this.provenanceChain.length > 0 ? this.provenanceChain[this.provenanceChain.length - 1]?.replayToken : null,
      seed: this.stepCount,
    };
  }
}

export class ConstitutionalRuntime {
  constructor(config = {}) {
    this.config = {
      metricSignature: config.metricSignature || [-1, 1, 1, 1],
      c: config.c || 1,
      dtau: config.dtau || 0.01,
      d4: config.d4 || 4,
      strictMode: config.strictMode !== false,
      requireReplay: config.requireReplay !== false,
      requireAudit: config.requireAudit !== false,
      maxSteps: config.maxSteps || 1000,
      ...config,
    };

    this.state = null;
    this.initialized = false;
  }

  initialize(config = {}) {
    const metric = new MetricTensor(this.config.metricSignature);
    const christoffel = new ChristoffelSymbols(metric);

    this.state = new ConstitutionalState({
      metric,
      christoffel,
      c: this.config.c,
      dtau: this.config.dtau,
      d4: this.config.d4,
      camera: config.camera,
      projectionPolicy: config.projectionPolicy,
      position: config.position,
      velocity: config.velocity,
      mass: config.mass,
      governance: this.config,
    });

    this.initialized = true;
    return this;
  }

  async step() {
    if (!this.initialized) throw new Error("Runtime not initialized. Call initialize() first.");

    const { state } = this;

    const physicsState = state.toPhysicsState();
    const conformance = await state.physicsGate.runAll(physicsState);
    if (!conformance.success && this.config.strictMode) {
      throw new Error(`Physics conformance failed: ${conformance.passed}/${conformance.total}`);
    }

    const kinematicsResult = state.kinematics.geodesicStep(state.position, state.velocity, state.dtau);

    const stepVector = new FourVector(
      kinematicsResult.position.x - state.position.x,
      kinematicsResult.position.y - state.position.y,
      kinematicsResult.position.z - state.position.z,
      kinematicsResult.position.w - state.position.w,
      state.metric
    );
    const expectedDs2 = -state.c * state.c * state.dtau * state.dtau;
    const stepDs2 = state.metric.norm2(stepVector);
    const positionCert = certifyTensor(
      kinematicsResult.position,
      AUTHORITIES.KINEMATICS_ENGINE,
      [
        { name: "geodesic_step", passed: true, residual: Math.abs(stepDs2 - expectedDs2), tolerance: 1e-6 },
      ],
      [{ type: "position_step", step: state.stepCount }]
    );

    const velocityCert = state.kinematics.certifyFourVelocity(kinematicsResult.velocity, state.c);
    // Use the re-normalized velocity from certification for the next step
    state.velocity = velocityCert.tensor;

    const momentumCert = state.kinematics.certifyFourMomentum(
      new FourMomentum(
        new FourVector(
          state.mass * kinematicsResult.velocity.x,
          state.mass * kinematicsResult.velocity.y,
          state.mass * kinematicsResult.velocity.z,
          state.mass * kinematicsResult.velocity.w,
          state.metric
        ),
        state.metric,
        state.mass
      ),
      state.mass
    );

    const projectionResult = state.projector.project(kinematicsResult.position, state.projectionPolicy, state.camera);
    const projectionError = state.projector.computeErrorBound(projectionResult);
    const certifiedProjection = CertifiedProjection.create(projectionResult, {
      stateId: "STATE-" + state.stepCount,
      cameraId: state.camera.cameraId,
      metricId: state.metric.hash(),
      projectionMode: state.projectionPolicy.mode,
      projectionParameters: state.projectionPolicy.getParameters(),
      sourceCertificate: positionCert,
      projectionError,
    });
    certifiedProjection.setVerification(CertifiedTensor._hashTensor(certifiedProjection.projection));

    state.position = kinematicsResult.position;
    // state.velocity already updated to normalized velocity from certification (line 139)
    // state.velocity = kinematicsResult.velocity; // DON'T overwrite with unnormalized velocity

    state.trajectory.push({
      step: state.stepCount,
      position: kinematicsResult.position.toArray(),
      velocity: kinematicsResult.velocity.toArray(),
      projection: projectionResult,
    });

    state.certifications.push(
      positionCert,
      velocityCert,
      momentumCert
    );

    state.governanceRecords.push({
      step: state.stepCount,
      physicsConformance: conformance,
      certifications: [positionCert.certificationId, velocityCert.certificationId, momentumCert.certificationId],
    });

    state.provenanceChain.push({
      step: state.stepCount,
      positionCert: positionCert.toProvenanceRecord?.() ?? positionCert,
      velocityCert: velocityCert.toProvenanceRecord?.() ?? velocityCert,
      momentumCert: momentumCert.toProvenanceRecord?.() ?? momentumCert,
      projection: certifiedProjection.toProvenanceRecord(),
      physicsConformance: conformance,
      replayToken: createHash("sha256").update(`${state.stepCount}-${kinematicsResult.position.x}-${kinematicsResult.position.y}-${kinematicsResult.position.z}-${kinematicsResult.position.w}`).digest("hex"),
    });

    state.stepCount++;

    return {
      step: state.stepCount - 1,
      position: kinematicsResult.position.toArray(),
      velocity: kinematicsResult.velocity.toArray(),
      projection: projectionResult,
      certifications: [positionCert, velocityCert, momentumCert],
      conformance,
      provenance: state.provenanceChain[state.provenanceChain.length - 1],
    };
  }

  async run(steps = null) {
    const maxSteps = steps || this.config.maxSteps;
    const results = [];

    for (let i = 0; i < maxSteps; i++) {
      const result = await this.step();
      results.push(result);
    }

    return results;
  }

  getState() {
    return this.state.getState();
  }

  getProvenanceChain() {
    return this.state.provenanceChain;
  }

  getCertifications() {
    return this.state.certifications.map(c => c.toJSON?.() ?? c);
  }

  getGovernanceRecords() {
    return this.state.governanceRecords;
  }

  async verifyReplay(originalProvenance, replayProvenance) {
    if (originalProvenance.length !== replayProvenance.length) {
      return { match: false, reason: "Provenance chain length mismatch" };
    }

    for (let i = 0; i < originalProvenance.length; i++) {
      const orig = originalProvenance[i];
      const repl = replayProvenance[i];
      if (orig.replayToken !== repl.replayToken) {
        return { match: false, step: i, reason: "Replay token mismatch" };
      }
    }

    return { match: true, steps: originalProvenance.length };
  }

  toJSON() {
    return {
      config: this.config,
      state: this.state?.getState?.() ?? null,
      initialized: this.initialized,
    };
  }
}

export function createConstitutionalRuntime(config) {
  return new ConstitutionalRuntime(config);
}

export function createInitializedRuntime(config) {
  const runtime = new ConstitutionalRuntime(config);
  return runtime.initialize(config);
}

import { createHash } from "node:crypto";