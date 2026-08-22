import { certifyTensor } from "./CertifiedTensor.js";
import { ConstitutionalWrapper } from "./ConstitutionalWrapper.js";
import { PhysicsConformanceGate } from "./PhysicsConformanceGate.js";

export {
  CertifiedTensor,
  CERTIFICATION_STATUSES,
  AUTHORITIES,
  certifyTensor,
  createCertificationId,
} from "./CertifiedTensor.js";

export {
  ConstitutionalWrapper,
  GovernanceRecord,
  GOVERNANCE_STAGES,
  createConstitutionalWrapper,
  wrapOperation,
} from "./ConstitutionalWrapper.js";

export {
  PhysicsConformanceGate,
  PHYSICS_CONFORMANCE_CHECKS,
  createPhysicsConformanceGate,
} from "./PhysicsConformanceGate.js";

export function createGovernanceLayer(config) {
  return {
    wrapper: new ConstitutionalWrapper(config),
    physicsGate: new PhysicsConformanceGate(config),
    certify: (tensor, authority, checks, evidence) => certifyTensor(tensor, authority, checks, evidence),
  };
}