import { deformHumanRig } from "../human/HumanRigDeformer.js";
import { MultiDeformationCompiler } from "../human/MultiDeformationCompiler.js";
import type { DeformedHumanRigFrame, HumanRig } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument, WorldObject } from "../world/WorldObject.js";
import { buildRt4dMaterialTable, type Rt4dMaterialEntry } from "../world/MaterialSystem.js";
import { buildRt4dTextureTable, type Rt4dTextureEntry } from "../world/TextureSystem.js";
import { buildRt4dLightTable, type Rt4dLightEntry } from "../world/LightingSystem.js";
import { buildRt4dCameraTable, type Rt4dCameraEntry } from "../world/CameraSystem.js";
import { environmentToRt4dEntry, type Rt4dEnvironmentEntry } from "../world/EnvironmentSystem.js";
import { instantiateStaticMesh, type InstancedStaticMeshPrimitive } from "../world/StaticMeshSystem.js";
import { buildEvidenceRecordV21 } from "./EvidenceBuilderV21.js";
import { buildEvidenceRecordV3, type EvidenceRecordV3 } from "./EvidenceBuilderV3.js";

export type Rt4dBridgePrimitive =
  | InstancedStaticMeshPrimitive
  | {
      readonly kind: "skinned-mesh";
      readonly id: string;
      readonly vertices: Float32Array;
      readonly normals?: Float32Array;
      readonly indices: Uint16Array | Uint32Array;
      readonly materialId: string;
      readonly transform: WorldObject["transform"];
      readonly evidence: {
        readonly boneHash: string;
        readonly meshDeformationHash: string;
        readonly morphHash?: string;
        readonly curveHash?: string;
        readonly multiSkinHash?: string;
        readonly muscleHash?: string;
        readonly softTissueHash?: string;
      };
    }
  | {
      readonly kind: string;
      readonly id: string;
      readonly materialId?: string;
      readonly transform: WorldObject["transform"];
    };

export interface Rt4dBridgeSceneV12 {
  readonly schemaVersion: "rt4d-bridge-scene/1.2";
  readonly frameIndex: number;
  readonly seed: number;
  readonly primitives: readonly Rt4dBridgePrimitive[];
  readonly materials: readonly Rt4dMaterialEntry[];
  readonly textures: readonly Rt4dTextureEntry[];
  readonly lightRig: readonly Rt4dLightEntry[];
  readonly cameraRig: readonly Rt4dCameraEntry[];
  readonly environment: Rt4dEnvironmentEntry;
  readonly lights: readonly WorldObject[];
  readonly camera: WorldObject | null;
}

export interface SceneBridgeV12Options {
  readonly rigs?: Readonly<Record<string, HumanRig>>;
  readonly poseByRigId?: Readonly<Record<string, string>>;
  readonly muscleActivationByRigId?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface SceneBridgeV12Result {
  readonly scene: Rt4dBridgeSceneV12;
  readonly evidence: EvidenceRecordV3;
  readonly deformedRigs: readonly DeformedHumanRigFrame[];
}

export function canActivateSceneBridgeV3(rig: HumanRig): boolean {
  if (rig.schemaVersion !== "human-rig/3.0") return false;
  if (rig.capabilities.muscleRig !== true) return false;
  if (rig.capabilities.skinSliding || rig.capabilities.microMotion || rig.capabilities.softTissueSimulation || rig.capabilities.sceneBridgeFederation) return false;
  if (!rig.muscleRig) return false;
  if (!rig.muscleRig.muscles.length || !rig.muscleRig.regions.length) return false;
  const boneIds = new Set(rig.skeleton.bones.map((bone) => bone.id));
  const regionIds = new Set<string>();
  const facialCurveIds = new Set((rig.facialRig?.curves ?? []).map((curve) => curve.id));
  for (const region of rig.muscleRig.regions) {
    if (regionIds.has(region.id)) return false;
    regionIds.add(region.id);
  }
  const maxVertexCount = Math.max(0, ...rig.meshes.all.map((mesh) => mesh.vertices.length / 3));
  for (const muscle of rig.muscleRig.muscles) {
    if (!boneIds.has(muscle.originBoneId) || !boneIds.has(muscle.insertionBoneId)) return false;
    if (!regionIds.has(muscle.influenceRegionId)) return false;
    if (!facialCurveIds.has(muscle.activationCurveId)) return false;
    if (muscle.direction?.some((value) => !Number.isFinite(value))) return false;
  }
  for (const region of rig.muscleRig.regions) {
    if (!Number.isFinite(region.stiffness) || !Number.isFinite(region.damping)) return false;
    if (region.vertexIndices.some((vertexIndex) => !Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= maxVertexCount)) return false;
  }
  return true;
}

export class SceneBridgeV12 {
  private currentWorld: Engine3DWorldDocument | null = null;

  constructor(private readonly options: SceneBridgeV12Options = {}) {}

  build(world: Engine3DWorldDocument, frameIndex: number, seed: number, time = 0): SceneBridgeV12Result {
    this.currentWorld = world;
    const primitives: Rt4dBridgePrimitive[] = [];
    const deformedRigs: DeformedHumanRigFrame[] = [];
    for (const object of world.objects) this.mapObject(object, primitives, deformedRigs, time);
    const scene: Rt4dBridgeSceneV12 = {
      schemaVersion: "rt4d-bridge-scene/1.2",
      frameIndex: frameIndex | 0,
      seed: seed >>> 0,
      primitives,
      materials: buildRt4dMaterialTable(world.materials),
      textures: buildRt4dTextureTable(world.textures),
      lightRig: buildRt4dLightTable(world.lights),
      cameraRig: buildRt4dCameraTable(world.cameras),
      environment: environmentToRt4dEntry(world.environment),
      lights: world.lights,
      camera: world.cameras.find((camera) => camera.id === world.activeCameraId) ?? world.cameras[0] ?? null,
    };
    const hasV3Rig = deformedRigs.some((rig) => rig.muscleHash || rig.softTissueHash);
    const result = {
      scene,
      evidence: hasV3Rig
        ? buildEvidenceRecordV3({ world, scene, frameIndex, seed, deformedRigs })
        : buildEvidenceRecordV21({ world, scene, frameIndex, seed, deformedRigs }),
      deformedRigs,
    };
    this.currentWorld = null;
    return result;
  }

  private mapObject(object: WorldObject, out: Rt4dBridgePrimitive[], deformedRigs: DeformedHumanRigFrame[], time: number): void {
    if (object.kind === "group") {
      for (const child of object.children) this.mapObject(child, out, deformedRigs, time);
      return;
    }
    if (object.kind === "rig") {
      this.mapRig(object, out, deformedRigs, time);
      return;
    }
    if (object.kind === "mesh") {
      const meshId = object.geometry?.meshId ?? object.geometry?.instanceOf;
      const mesh = meshId ? this.currentWorld?.meshes?.find((item) => item.id === meshId) : undefined;
      if (mesh) {
        out.push(instantiateStaticMesh(mesh, object.transform, object.id, object.geometry?.instanceOf));
        return;
      }
    }
    if (object.kind === "primitive" || object.kind === "mesh") {
      out.push({
        kind: object.kind === "mesh" ? "poly" : object.geometry?.primitiveType ?? "primitive",
        id: object.id,
        materialId: object.material?.materialId,
        transform: object.transform,
      });
    }
  }

  private mapRig(object: WorldObject, out: Rt4dBridgePrimitive[], deformedRigs: DeformedHumanRigFrame[], time: number): void {
    const rigId = object.geometry?.rigId;
    if (!rigId) throw new Error(`Rig WorldObject ${object.id} missing geometry.rigId`);
    const rig = this.options.rigs?.[rigId];
    if (!rig) throw new Error(`Rig ${rigId} not provided to SceneBridgeV12`);
    const poseId = this.options.poseByRigId?.[rigId];
    const deformed = canActivateSceneBridgeV3(rig)
      ? new MultiDeformationCompiler(rig).compile(time, {
          poseId,
          muscleActivation: this.options.muscleActivationByRigId?.[rigId],
        })
      : deformHumanRig(rig, poseId, time);
    deformedRigs.push(deformed);
    for (const mesh of deformed.meshes) {
      out.push({
        kind: "skinned-mesh",
        id: `${object.id}:${mesh.id}`,
        vertices: mesh.vertices,
        normals: mesh.normals,
        indices: mesh.indices,
        materialId: mesh.materialId,
        transform: object.transform,
        evidence: {
          boneHash: deformed.boneHash,
          meshDeformationHash: deformed.meshDeformationHash,
          ...(deformed.morphHash ? { morphHash: deformed.morphHash } : {}),
          ...(deformed.curveHash ? { curveHash: deformed.curveHash } : {}),
          ...(deformed.multiSkinHash ? { multiSkinHash: deformed.multiSkinHash } : {}),
          ...(deformed.muscleHash ? { muscleHash: deformed.muscleHash } : {}),
          ...(deformed.softTissueHash ? { softTissueHash: deformed.softTissueHash } : {}),
        },
      });
    }
  }
}
