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
    return this._perspectiveCoords(p.x, p.y, p.z, p.w, d);
  }

  _perspectiveCoords(x, y, z, w, d) {
    const denom = d - w;
    if (Math.abs(denom) < 1e-12) {
      return { x: 0, y: 0, z: 0, degenerate: true };
    }
    const s = d / denom;
    return { x: x * s, y: y * s, z: z * s, degenerate: false };
  }

  _orthographic(p) {
    return { x: p.x, y: p.y, z: p.z, degenerate: false };
  }

  _orthographicCoords(x, y, z) {
    return { x, y, z, degenerate: false };
  }

  _slice(p, w0, epsilon) {
    if (Math.abs(p.w - w0) > epsilon) {
      return { x: 0, y: 0, z: 0, rejected: true, reason: `w=${p.w} outside slice w0=${w0}±${epsilon}` };
    }
    return { x: p.x, y: p.y, z: p.z, degenerate: false, rejected: false };
  }

  _sliceCoords(x, y, z, w, w0, epsilon) {
    if (Math.abs(w - w0) > epsilon) {
      return { x: 0, y: 0, z: 0, rejected: true, reason: `w=${w} outside slice w0=${w0}±${epsilon}` };
    }
    return { x, y, z, degenerate: false, rejected: false };
  }

  _stereographic(p, R) {
    return this._stereographicCoords(p.x, p.y, p.z, p.w, R);
  }

  _stereographicCoords(x, y, z, w, R) {
    const denom = R - w;
    if (Math.abs(denom) < 1e-12) {
      return { x: 0, y: 0, z: 0, degenerate: true };
    }
    const s = R / denom;
    return { x: x * s, y: y * s, z: z * s, degenerate: false };
  }

  _forward(result) {
    const p4 = result.point4D || [];
    const [x, y, z, w] = p4;
    const params = result.parameters || {};
    switch (result.mode) {
      case PROJECTION_MODES.PERSPECTIVE:
        return this._perspectiveCoords(x, y, z, w, params.d);
      case PROJECTION_MODES.ORTHOGRAPHIC:
        return this._orthographicCoords(x, y, z);
      case PROJECTION_MODES.SLICE:
        return this._sliceCoords(x, y, z, w, params.w0, params.epsilon);
      case PROJECTION_MODES.STEREOGRAPHIC:
        return this._stereographicCoords(x, y, z, w, params.R);
      default:
        return null;
    }
  }

  /**
   * Error-bound evidence for a projection result: roundtrip residual
   * (forward map recomputed from the source 4D point must reproduce the
   * stored 3D result) plus a numeric condition estimate (how much the map
   * amplifies a delta perturbation of the 4D input).
   */
  computeErrorBound(result, delta = 1e-6, tolerance = 1e-9) {
    const p4 = result.point4D || [];
    if (p4.length < 4) {
      return { finite: false, roundtripResidual: Infinity, conditionEstimate: Infinity, withinTolerance: false };
    }

    const forward = this._forward(result);
    const finite =
      forward !== null &&
      Number.isFinite(result.x) &&
      Number.isFinite(result.y) &&
      Number.isFinite(result.z) &&
      !result.degenerate &&
      !result.rejected;

    let roundtripResidual = Infinity;
    if (finite) {
      roundtripResidual = Math.max(
        Math.abs(forward.x - result.x),
        Math.abs(forward.y - result.y),
        Math.abs(forward.z - result.z)
      );
    }

    let conditionEstimate = Infinity;
    if (finite) {
      const perturbed = p4.map((c) => c + delta);
      const forwardPerturbed = this._forward({ ...result, point4D: perturbed });
      const inputDelta = Math.hypot(
        perturbed[0] - p4[0],
        perturbed[1] - p4[1],
        perturbed[2] - p4[2],
        perturbed[3] - p4[3]
      );
      if (forwardPerturbed !== null && !forwardPerturbed.degenerate && inputDelta > 0) {
        conditionEstimate = Math.max(
          Math.abs(forwardPerturbed.x - forward.x),
          Math.abs(forwardPerturbed.y - forward.y),
          Math.abs(forwardPerturbed.z - forward.z)
        ) / inputDelta;
      }
    }

    return {
      finite,
      roundtripResidual,
      conditionEstimate,
      withinTolerance: finite && roundtripResidual <= tolerance,
    };
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
    this.projectionError = governance.projectionError || {
      finite: false,
      roundtripResidual: null,
      conditionEstimate: null,
      withinTolerance: false,
    };
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

  setProjectionError(errorBound) {
    this.projectionError = errorBound;
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
      errorBound: this.projectionError,
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
      projectionError: this.projectionError,
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