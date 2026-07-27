/**
 * World-attached face rig adapter.
 * Loads HumanFaceRigged.glb (or fixture) and applies FacePoseFrame via HumanRig deform.
 */

import {
  applyFacePose,
  loadFaceRig,
  type FacePoseFrame,
  type FaceRigConfig,
  type LoadedFaceRig,
} from "../face/index.js";
import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";

export class World3DFace {
  readonly loaded: LoadedFaceRig;
  lastDeformed: DeformedHumanRigFrame | null = null;

  constructor(config: FaceRigConfig) {
    this.loaded = loadFaceRig(config);
  }

  applyPose(pose: FacePoseFrame): DeformedHumanRigFrame {
    this.lastDeformed = applyFacePose(this.loaded, pose);
    return this.lastDeformed;
  }
}
