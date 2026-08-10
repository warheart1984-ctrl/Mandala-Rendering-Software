export * from "./arena/index.js";
export * from "./tensor/index.js";
export * from "./kinematics/index.js";
export * from "./governance/index.js";
export * from "./projection/index.js";
export * from "./runtime/index.js";

export function createConstitutionalEngine(config = {}) {
  return {
    arena: {
      metric: new MetricTensor(config.metricSignature || [-1, 1, 1, 1]),
    },
    tensor: {
      engine: new TensorEngine(),
    },
    kinematics: {},
    governance: {
      wrapper: new ConstitutionalWrapper(config.governance),
      physicsGate: new PhysicsConformanceGate({ c: config.c || 1 }),
    },
    projection: {
      projector: new Projector4DTo3D(),
    },
    runtime: {},
  };
}

import { MetricTensor } from "./arena/MetricTensor.js";
import { TensorEngine } from "./tensor/TensorEngine.js";
import { ConstitutionalWrapper } from "./governance/ConstitutionalWrapper.js";
import { PhysicsConformanceGate } from "./governance/PhysicsConformanceGate.js";
import { Projector4DTo3D } from "./projection/Projector4DTo3D.js";