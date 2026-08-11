import { createHash } from "node:crypto";
import { CertifiedTensor } from "../governance/CertifiedTensor.js";
import { Projector4DTo3D, Camera4D, ProjectionPolicy, PROJECTION_MODES, CertifiedProjection } from "./Projector4DTo3D.js";
import { AUTHORITIES } from "../governance/index.js";

export class CertifiedProjector {
  constructor(metric = null, governanceConfig = {}) {
    this.projector = new Projector4DTo3D(metric);
    this.metric = this.projector.metric;
    this.governanceConfig = governanceConfig;
  }

  projectCertified(state, policy, camera, options = {}) {
    const { intentId, worldId, timelineId, stateId, sourceCertificate } = options;

    const projectionResult = this.projector.project(state, policy, camera);
    const errorBound = this.projector.computeErrorBound(projectionResult);
    const projectedTensor = new CertifiedTensor(
      { components: [projectionResult.x, projectionResult.y, projectionResult.z, 0], rank: 1, metric: this.metric },
      {
        authority: AUTHORITIES.PROJECTION_ENGINE,
        validation: { passed: !projectionResult.degenerate && !projectionResult.rejected, checks: [] },
        certificationStatus: projectionResult.degenerate || projectionResult.rejected ? "draft" : "validated",
      }
    );

    const certifiedProjection = CertifiedProjection.create(projectionResult, {
      stateId: stateId || `STATE-${Date.now()}`,
      cameraId: camera?.cameraId,
      metricId: this.metric.hash(),
      projectionMode: policy.mode,
      projectionParameters: policy.getParameters(),
      sourceCertificate,
      intentId,
      worldId,
      timelineId,
      projectionError: errorBound,
    });

    certifiedProjection.setVerification(CertifiedTensor._hashTensor(projectedTensor.tensor));

    return {
      projection: projectionResult,
      certifiedTensor: projectedTensor,
      certifiedProjection,
      provenance: certifiedProjection.toProvenanceRecord(),
    };
  }

  projectBatchCertified(states, policy, camera, options = {}) {
    return states.map((state, i) =>
      this.projectCertified(state, policy, camera, {
        ...options,
        stateId: options.stateId ? `${options.stateId}-${i}` : undefined,
      })
    );
  }

  toJSON() {
    return {
      metricHash: this.metric.hash(),
      governanceConfig: this.governanceConfig,
    };
  }
}

export function createCertifiedProjector(metric, config) {
  return new CertifiedProjector(metric, config);
}