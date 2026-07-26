import type { DeformedHumanRigFrame, HumanRig } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV4, type EvidenceRecordV4 } from "./EvidenceBuilderV4.js";
import type { FederatedWorldV4 } from "./FederatedWorldV4.js";
import { validateFederatedWorldV4 } from "./FederatedWorldV4.js";
import { SceneBridgeV12, type Rt4dBridgePrimitive, type Rt4dBridgeSceneV12 } from "./SceneBridgeV12.js";

export type FederatedRt4dBridgePrimitiveV4 = Rt4dBridgePrimitive & {
  readonly federation: {
    readonly federationId: string;
    readonly worldId: string;
    readonly sourcePrimitiveId: string;
    readonly worldTransform?: unknown;
  };
};

export interface FederatedRt4dBridgeSceneV4 {
  readonly schemaVersion: "rt4d-bridge-scene/4.0";
  readonly federationId: string;
  readonly frameIndex: number;
  readonly seed: number;
  readonly primitives: readonly FederatedRt4dBridgePrimitiveV4[];
  readonly worldScenes: readonly (Rt4dBridgeSceneV12 & { readonly worldId: string })[];
}

export interface FederatedSceneBridgeV4Options {
  readonly rigsByWorldId?: Readonly<Record<string, Readonly<Record<string, HumanRig>>>>;
  readonly poseByWorldAndRigId?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly muscleActivationByWorldAndRigId?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
}

export interface FederatedSceneBridgeV4Result {
  readonly scene: FederatedRt4dBridgeSceneV4;
  readonly evidence: EvidenceRecordV4;
  readonly deformedRigs: readonly DeformedHumanRigFrame[];
}

function syntheticFederationWorld(federation: FederatedWorldV4): Engine3DWorldDocument {
  return {
    schemaVersion: "engine3d-world/1.0",
    id: federation.id,
    objects: federation.worlds.flatMap((entry) => entry.world.objects),
    materials: federation.worlds.flatMap((entry) => entry.world.materials),
    lights: federation.worlds.flatMap((entry) => entry.world.lights),
    cameras: federation.worlds.flatMap((entry) => entry.world.cameras),
    activeCameraId: federation.worlds[0]?.world.activeCameraId ?? "",
  };
}

export class FederatedSceneBridgeV4 {
  constructor(private readonly options: FederatedSceneBridgeV4Options = {}) {}

  build(federation: FederatedWorldV4, frameIndex: number, seed: number, time = 0): FederatedSceneBridgeV4Result {
    const issues = validateFederatedWorldV4(federation);
    if (issues.length) throw new Error(`Invalid FederatedWorld v4: ${issues.join(", ")}`);

    const worldScenes: (Rt4dBridgeSceneV12 & { readonly worldId: string })[] = [];
    const primitives: FederatedRt4dBridgePrimitiveV4[] = [];
    const deformedRigs: DeformedHumanRigFrame[] = [];
    const worldEvidence: EvidenceRecordV4[] = [];

    for (const entry of federation.worlds) {
      const bridge = new SceneBridgeV12({
        rigs: this.options.rigsByWorldId?.[entry.id],
        poseByRigId: this.options.poseByWorldAndRigId?.[entry.id],
        muscleActivationByRigId: this.options.muscleActivationByWorldAndRigId?.[entry.id],
      });
      const result = bridge.build(entry.world, frameIndex, seed, time);
      worldScenes.push({ ...result.scene, worldId: entry.id });
      deformedRigs.push(...result.deformedRigs);
      worldEvidence.push(result.evidence);
      for (const primitive of result.scene.primitives) {
        primitives.push({
          ...primitive,
          id: `${entry.id}:${primitive.id}`,
          federation: {
            federationId: federation.id,
            worldId: entry.id,
            sourcePrimitiveId: primitive.id,
            ...(entry.transform ? { worldTransform: entry.transform } : {}),
          },
        });
      }
    }

    const scene: FederatedRt4dBridgeSceneV4 = {
      schemaVersion: "rt4d-bridge-scene/4.0",
      federationId: federation.id,
      frameIndex: frameIndex | 0,
      seed: seed >>> 0,
      primitives,
      worldScenes,
    };

    return {
      scene,
      evidence: buildEvidenceRecordV4({
        world: syntheticFederationWorld(federation),
        scene,
        frameIndex,
        seed,
        deformedRigs,
        federation,
        worldEvidence,
      }),
      deformedRigs,
    };
  }
}
