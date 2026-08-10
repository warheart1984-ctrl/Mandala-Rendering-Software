import { FourVector } from "../tensor/TensorTypes.js";
import { MetricTensor } from "../arena/MetricTensor.js";
import { CertifiedTensor, certifyTensor, AUTHORITIES } from "../governance/CertifiedTensor.js";

export const PROJECTION_MODES = Object.freeze({
  PERSPECTIVE: "perspective",
  ORTHOGRAPHIC: "orthographic",
  SLICE: "slice",
  STEREOGRAPHIC: "stereographic",
});

export const COORDINATE_DOMAINS = Object.freeze({
  SPACETIME_4: "spacetime_4",
  SPATIAL_4: "spatial_4",
});

export class ProjectionPolicy {
  constructor(mode, parameters = {}) {
    this.mode = mode;
    this.parameters = { ...parameters };
    this.validate();
  }

  validate() {
    switch (this.mode) {
      case PROJECTION_MODES.PERSPECTIVE:
        if (this.parameters.d === undefined || this.parameters.d <= 0) {
          throw new Error("Perspective projection requires d > 0 (focal distance)");
        }
        break;
      case PROJECTION_MODES.SLICE:
        if (this.parameters.w0 === undefined) {
          throw new Error("Slice projection requires w0 (slice position)");
        }
        if (this.parameters.epsilon === undefined) this.parameters.epsilon = 1e-6;
        break;
      case PROJECTION_MODES.STEREOGRAPHIC:
        if (this.parameters.R === undefined || this.parameters.R <= 0) {
          throw new Error("Stereographic projection requires R > 0 (radius)");
        }
        break;
      case PROJECTION_MODES.ORTHOGRAPHIC:
        break;
      default:
        throw new Error(`Unknown projection mode: ${this.mode}`);
    }
  }

  getMode() {
    return this.mode;
  }

  getParameters() {
    return { ...this.parameters };
  }

  static perspective(d) {
    return new ProjectionPolicy(PROJECTION_MODES.PERSPECTIVE, { d });
  }

  static orthographic() {
    return new ProjectionPolicy(PROJECTION_MODES.ORTHOGRAPHIC, {});
  }

  static slice(w0, epsilon = 1e-6) {
    return new ProjectionPolicy(PROJECTION_MODES.SLICE, { w0, epsilon });
  }

  static stereographic(R) {
    return new ProjectionPolicy(PROJECTION_MODES.STEREOGRAPHIC, { R });
  }
}

export class Camera4D {
  constructor(position, basis, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    this.position = position;
    this.basis = basis;
    this.domain = domain;
    this.cameraId = `CAM4D-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  static atOrigin(domain = COORDINATE_DOMAINS.SPACETIME_4) {
    const position = new FourVector(0, 0, 0, 0, null, domain);
    const basis = [
      new FourVector(1, 0, 0, 0, null, domain),
      new FourVector(0, 1, 0, 0, null, domain),
      new FourVector(0, 0, 1, 0, null, domain),
      new FourVector(0, 0, 0, 1, null, domain),
    ];
    return new Camera4D(position, basis, domain);
  }

  static fromPositionBasis(position, basis, domain = COORDINATE_DOMAINS.SPACETIME_4) {
    return new Camera4D(position, basis, domain);
  }

  toJSON() {
    return {
      cameraId: this.cameraId,
      position: this.position.toArray(),
      basis: this.basis.map(b => b.toArray()),
      domain: this.domain,
    };
  }
}

export class Projector4DTo3D {
  constructor(metric = null) {
    this.metric = metric || new MetricTensor([-1, 1, 1, 1]);
  }

  project(point, policy, camera = null) {
    const p = point instanceof FourVector ? point : new FourVector(point.x, point.y, point.z, point.w, this.metric);

    let p3;
    switch (policy.mode) {
      case PROJECTION_MODES.PERSPECTIVE:
        p3 = this._perspective(p, policy.parameters.d);
        break;
      case PROJECTION_MODES.ORTHOGRAPHIC:
        p3 = this._orthographic(p);
        break;
      case PROJECTION_MODES.SLICE:
        p3 = this._slice(p, policy.parameters.w0, policy.parameters.epsilon);
        break;
      case PROJECTION_MODES.STEREOGRAPHIC:
        p3 = this._stereographic(p, policy.parameters.R);
        break;
      default:
        throw new Error(`Unknown projection mode: ${policy.mode}`);
    }

    return {
      x: p3.x,
      y: p3.y,
      z: p3.z,
      mode: policy.mode,
      parameters: policy.getParameters(),
      cameraId: camera?.cameraId,
      point4D: p.toArray(),
      rejected: p3.rejected ?? false,
      degenerate: p3.degenerate ?? false,
      reason: p3.reason,
    };
  }

  _perspective(p, d) {
    const denom = d - p.w;
    if (Math.abs(denom) < 1e-12) {
      return { x: 0, y: 0, z: 0, degenerate: true };
    }
    const s = d / denom;
    return { x: p.x * s, y: p.y * s, z: p.z * s, degenerate: false };
  }

  _orthographic(p) {
    return { x: p.x, y: p.y, z: p.z, degenerate: false };
  }

  _slice(p, w0, epsilon) {
    if (Math.abs(p.w - w0) > epsilon) {
      return { x: 0, y: 0, z: 0, rejected: true, reason: `w=${p.w} outside slice w0=${w0}±${epsilon}` };
    }
    return { x: p.x, y: p.y, z: p.z, degenerate: false, rejected: false };
  }

  _stereographic(p, R) {
    const denom = R - p.w;
    if (Math.abs(denom) < 1e-12) {
      return { x: 0, y: 0, z: 0, degenerate: true };
    }
    const s = R / denom;
    return { x: p.x * s, y: p.y * s, z: p.z * s, degenerate: false };
  }

  projectBatch(points, policy, camera = null) {
    return points.map(p => this.project(p, policy, camera));
  }
}

export class CertifiedProjection {
  constructor(projectionResult, governance = {}) {
    this.projection = projectionResult;
    this.stateId = governance.stateId || `STATE-${Date.now()}`;
    this.cameraId = governance.cameraId || null;
    this.metricId = governance.metricId || null;
    this.projectionMode = governance.projectionMode || projectionResult.mode;
    this.projectionParameters = governance.projectionParameters || projectionResult.parameters;
    this.sourceCertificate = governance.sourceCertificate || null;
    this.projectionVerification = governance.projectionVerification || { hash: null };
    this.intentId = governance.intentId || null;
    this.worldId = governance.worldId || null;
    this.timelineId = governance.timelineId || null;
    this.timestamp = governance.timestamp || Date.now();
    this.projectionId = `PROJ-${this.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  }

  static create(projectionResult, options = {}) {
    return new CertifiedProjection(projectionResult, options);
  }

  setVerification(hash) {
    this.projectionVerification.hash = hash;
    return this;
  }

  setSourceCertificate(cert) {
    this.sourceCertificate = cert;
    return this;
  }

  toProvenanceRecord() {
    return {
      projectionId: this.projectionId,
      stateId: this.stateId,
      cameraId: this.cameraId,
      metricId: this.metricId,
      projectionMode: this.projectionMode,
      projectionParameters: this.projectionParameters,
      sourceCertificationId: this.sourceCertificate?.certificationId || null,
      verificationHash: this.projectionVerification.hash,
      intentId: this.intentId,
      worldId: this.worldId,
      timelineId: this.timelineId,
      timestamp: this.timestamp,
    };
  }

  toJSON() {
    return {
      projectionId: this.projectionId,
      projection: this.projection,
      stateId: this.stateId,
      cameraId: this.cameraId,
      metricId: this.metricId,
      projectionMode: this.projectionMode,
      projectionParameters: this.projectionParameters,
      sourceCertificate: this.sourceCertificate?.toJSON?.() ?? this.sourceCertificate,
      projectionVerification: this.projectionVerification,
      intentId: this.intentId,
      worldId: this.worldId,
      timelineId: this.timelineId,
      timestamp: this.timestamp,
    };
  }
}

export function createProjectionPolicy(mode, params) {
  return ProjectionPolicy[mode](params);
}

export function createCamera4D(position, basis, domain) {
  return Camera4D.fromPositionBasis(position, basis, domain);
}

export function createProjector4DTo3D(metric) {
  return new Projector4DTo3D(metric);
}

export function createCertifiedProjection(result, options) {
  return CertifiedProjection.create(result, options);
}