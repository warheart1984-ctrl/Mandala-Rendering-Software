import {
  Projector4DTo3D,
  Camera4D,
  ProjectionPolicy,
  PROJECTION_MODES,
} from "./Projector4DTo3D.js";
import { CertifiedProjector } from "./CertifiedProjection.js";

export {
  Projector4DTo3D,
  Camera4D,
  ProjectionPolicy,
  PROJECTION_MODES,
  COORDINATE_DOMAINS,
  CertifiedProjection,
  createProjectionPolicy,
  createCamera4D,
  createProjector4DTo3D,
  createCertifiedProjection,
} from "./Projector4DTo3D.js";

export {
  CertifiedProjector,
  createCertifiedProjector,
} from "./CertifiedProjection.js";

export function createProjectionLayer(metric) {
  return {
    projector: new Projector4DTo3D(metric),
    certifiedProjector: new CertifiedProjector(metric),
    policy: ProjectionPolicy,
    camera: Camera4D,
    modes: PROJECTION_MODES,
  };
}