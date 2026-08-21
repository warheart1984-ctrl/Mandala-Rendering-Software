/**
 * Bridge: character armature → Simulation Chamber humanoid poses.
 * Chamber still traces capsules (fast on FX-8350); pose/sim hooks come from here.
 */
import { poseForBeat } from "../../scripts/humanoid-avatar.mjs";

export function chamberPoseFromBeat(action, time) {
  return poseForBeat(action, time);
}

export function characterMetadata(sceneCard) {
  return sceneCard.characterPipeline || null;
}
