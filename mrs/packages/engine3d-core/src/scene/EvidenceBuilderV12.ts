import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildRt4dMaterialTable } from "../world/MaterialSystem.js";
import { buildRt4dTextureTable } from "../world/TextureSystem.js";
import { buildRt4dCameraTable, hashCameraMotion } from "../world/CameraSystem.js";
import { buildRt4dLightTable, hashLightingRig } from "../world/LightingSystem.js";
import { hashEnvironment } from "../world/EnvironmentSystem.js";
import { hashAssetManifests } from "../world/AssetRegistry.js";
import { hashAssetProvenance } from "../world/AssetProvenanceLedger.js";
import { hashWorldGenerator } from "../world/WorldGenerator.js";
import { hashStaticMeshTable } from "../world/StaticMeshSystem.js";
import { hashCanonical } from "./hash.js";

export interface EvidenceRecordV12 {
  readonly frameIndex: number;
  readonly seed: number;
  readonly worldHash: string;
  readonly materialHash: string;
  readonly textureHash?: string;
  readonly cameraHash: string;
  readonly cameraMotionHash?: string;
  readonly lightingHash: string;
  readonly lightingRigHash: string;
  readonly environmentHash?: string;
  readonly assetHash?: string;
  readonly assetProvenanceHash?: string;
  readonly staticMeshHash?: string;
  readonly worldGeneratorHash?: string;
  readonly rigHash?: string;
  readonly boneHash?: string;
  readonly meshDeformationHash?: string;
  readonly morphHash?: string;
  readonly physicsHash?: string;
  readonly particleHash?: string;
  readonly pngChecksum?: string;
}

export function buildEvidenceRecordV12(args: {
  readonly world: Engine3DWorldDocument;
  readonly scene: unknown;
  readonly frameIndex: number;
  readonly seed: number;
  readonly deformedRigs?: readonly DeformedHumanRigFrame[];
  readonly physics?: unknown;
  readonly particles?: unknown;
  readonly pngChecksum?: string;
}): EvidenceRecordV12 {
  const camera = args.world.cameras.find((item) => item.id === args.world.activeCameraId) ?? args.world.cameras[0] ?? null;
  const deformedRigs = args.deformedRigs ?? [];
  const record: EvidenceRecordV12 = {
    frameIndex: args.frameIndex | 0,
    seed: args.seed >>> 0,
    worldHash: hashCanonical(args.world),
    materialHash: hashCanonical(buildRt4dMaterialTable(args.world.materials)),
    textureHash: args.world.textures?.length ? hashCanonical(buildRt4dTextureTable(args.world.textures)) : undefined,
    cameraHash: hashCanonical(camera ? buildRt4dCameraTable([camera]) : null),
    cameraMotionHash: hashCameraMotion(args.world.cameras),
    lightingHash: hashCanonical(buildRt4dLightTable(args.world.lights)),
    lightingRigHash: hashLightingRig(args.world.lights),
    environmentHash: hashEnvironment(args.world.environment),
    assetHash: hashAssetManifests(args.world.assets),
    assetProvenanceHash: hashAssetProvenance(args.world.assetProvenance),
    staticMeshHash: hashStaticMeshTable(args.world.meshes),
    worldGeneratorHash: hashWorldGenerator(args.world.generator),
    rigHash: deformedRigs.length ? hashCanonical(deformedRigs.map((rig) => ({ rigId: rig.rigId, poseId: rig.poseId }))) : undefined,
    boneHash: deformedRigs.length ? hashCanonical(deformedRigs.map((rig) => rig.boneHash)) : undefined,
    meshDeformationHash: deformedRigs.length ? hashCanonical(deformedRigs.map((rig) => rig.meshDeformationHash)) : undefined,
    morphHash: deformedRigs.some((rig) => rig.morphHash)
      ? hashCanonical(deformedRigs.map((rig) => rig.morphHash ?? null))
      : undefined,
    physicsHash: args.physics == null ? undefined : hashCanonical(args.physics),
    particleHash: args.particles == null ? undefined : hashCanonical(args.particles),
    pngChecksum: args.pngChecksum,
  };
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as unknown as EvidenceRecordV12;
}

export class EvidenceBuilderV12 {
  build(
    world: Engine3DWorldDocument,
    scene: unknown,
    frameIndex: number,
    seed: number,
    deformedRigs: readonly DeformedHumanRigFrame[] = [],
    pngChecksum?: string,
  ): EvidenceRecordV12 {
    return buildEvidenceRecordV12({ world, scene, frameIndex, seed, deformedRigs, pngChecksum });
  }
}
