import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV4, type EvidenceRecordV4 } from "./EvidenceBuilderV4.js";
import type { FederatedWorldV4 } from "./FederatedWorldV4.js";
import { hashCanonical } from "./hash.js";
import type { FederatedRenderPlanV5, MultiCameraV5, MultiTimelineV5 } from "./MultiTimelineV5.js";
import { hashCameraMotion } from "../world/CameraSystem.js";

export interface EvidenceRecordV5 extends EvidenceRecordV4 {
  readonly timelineBranchHash?: string;
  readonly multiCameraHash?: string;
  readonly cameraMotionHash?: string;
  readonly renderPlanHash?: string;
}

export function buildEvidenceRecordV5(args: {
  readonly world: Engine3DWorldDocument;
  readonly scene: unknown;
  readonly frameIndex: number;
  readonly seed: number;
  readonly deformedRigs?: readonly DeformedHumanRigFrame[];
  readonly federation?: FederatedWorldV4;
  readonly worldEvidence?: readonly EvidenceRecordV4[];
  readonly timeline?: MultiTimelineV5;
  readonly cameras?: MultiCameraV5;
  readonly renderPlan?: FederatedRenderPlanV5;
  readonly pngChecksum?: string;
}): EvidenceRecordV5 {
  const base = buildEvidenceRecordV4(args);
  return {
    ...base,
    ...(args.timeline ? { timelineBranchHash: hashCanonical(args.timeline.branches) } : {}),
    ...(args.cameras ? { multiCameraHash: hashCanonical(args.cameras.cameraIds) } : {}),
    ...(hashCameraMotion(args.world.cameras) ? { cameraMotionHash: hashCameraMotion(args.world.cameras) } : {}),
    ...(args.renderPlan ? { renderPlanHash: hashCanonical({
      id: args.renderPlan.id,
      schemaVersion: args.renderPlan.schemaVersion,
      federationId: args.renderPlan.federation.id,
      timeline: args.renderPlan.timeline,
      cameras: args.renderPlan.cameras,
    }) } : {}),
  };
}

export class EvidenceBuilderV5 {
  build(args: Parameters<typeof buildEvidenceRecordV5>[0]): EvidenceRecordV5 {
    return buildEvidenceRecordV5(args);
  }
}
