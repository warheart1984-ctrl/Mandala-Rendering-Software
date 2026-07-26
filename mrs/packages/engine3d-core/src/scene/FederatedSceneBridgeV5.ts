import type { HumanRig } from "../human/HumanRigTypes.js";
import { buildEvidenceRecordV5, type EvidenceRecordV5 } from "./EvidenceBuilderV5.js";
import { FederatedSceneBridgeV4, type FederatedSceneBridgeV4Result } from "./FederatedSceneBridgeV4.js";
import type { FederatedRenderPlanV5 } from "./MultiTimelineV5.js";
import { validateFederatedRenderPlanV5 } from "./MultiTimelineV5.js";

export interface FederatedSceneBridgeV5Options {
  readonly rigsByWorldId?: Readonly<Record<string, Readonly<Record<string, HumanRig>>>>;
  readonly poseByWorldAndRigId?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly muscleActivationByWorldAndRigId?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
}

export interface FederatedSceneBridgeV5Render {
  readonly branchId: string;
  readonly cameraId: string;
  readonly frameIndex: number;
  readonly seed: number;
  readonly result: FederatedSceneBridgeV4Result;
}

export interface FederatedRt4dBridgeSceneV5 {
  readonly schemaVersion: "rt4d-bridge-scene/5.0";
  readonly renderPlanId: string;
  readonly federationId: string;
  readonly frameIndex: number;
  readonly seed: number;
  readonly renders: readonly FederatedSceneBridgeV5Render[];
}

export interface FederatedSceneBridgeV5Result {
  readonly scene: FederatedRt4dBridgeSceneV5;
  readonly evidence: EvidenceRecordV5;
}

export class FederatedSceneBridgeV5 {
  constructor(private readonly options: FederatedSceneBridgeV5Options = {}) {}

  build(plan: FederatedRenderPlanV5, frameIndex: number, seed: number, time = 0): FederatedSceneBridgeV5Result {
    const issues = validateFederatedRenderPlanV5(plan);
    if (issues.length) throw new Error(`Invalid FederatedRenderPlan v5: ${issues.join(", ")}`);

    const renders: FederatedSceneBridgeV5Render[] = [];
    for (const branch of plan.timeline.branches) {
      if (frameIndex < branch.frameStart || frameIndex > branch.frameEnd) continue;
      const branchSeed = (seed + (branch.seedOffset ?? 0)) >>> 0;
      for (const cameraId of plan.cameras.cameraIds) {
        const result = new FederatedSceneBridgeV4(this.options).build(plan.federation, frameIndex, branchSeed, time);
        renders.push({ branchId: branch.id, cameraId, frameIndex, seed: branchSeed, result });
      }
    }

    const scene: FederatedRt4dBridgeSceneV5 = {
      schemaVersion: "rt4d-bridge-scene/5.0",
      renderPlanId: plan.id,
      federationId: plan.federation.id,
      frameIndex,
      seed: seed >>> 0,
      renders,
    };

    const syntheticWorld = {
      schemaVersion: "engine3d-world/1.0" as const,
      id: plan.id,
      objects: plan.federation.worlds.flatMap((entry) => entry.world.objects),
      materials: plan.federation.worlds.flatMap((entry) => entry.world.materials),
      lights: plan.federation.worlds.flatMap((entry) => entry.world.lights),
      cameras: plan.federation.worlds.flatMap((entry) => entry.world.cameras),
      activeCameraId: plan.cameras.cameraIds[0] ?? "",
    };

    return {
      scene,
      evidence: buildEvidenceRecordV5({
        world: syntheticWorld,
        scene,
        frameIndex,
        seed,
        federation: plan.federation,
        worldEvidence: renders.map((render) => render.result.evidence),
        timeline: plan.timeline,
        cameras: plan.cameras,
        renderPlan: plan,
      }),
    };
  }
}
