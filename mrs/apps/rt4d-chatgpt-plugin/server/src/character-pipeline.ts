import { createHash } from "node:crypto";
import {
  createAnthroRig,
  createFoxQuadrupedRig,
  createHumanRig,
  characterRigHash,
  type CharacterRigSchema,
  type Species,
} from "./sculptor-rig.js";
import {
  commitSceneRecord,
  getSceneOrThrow,
  type CharacterPipeline,
  type CharacterRigBinding,
  type Rt4dSceneRecord,
} from "./scene-store.js";
import { buildEnergyWireMesh4d, projectWireMeshTo3d } from "./wire-mesh-4d.js";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function boneWorldPositions(rig: CharacterRigSchema): CharacterRigBinding["bones"] {
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  const cache = new Map<string, readonly [number, number, number]>();

  function worldOf(id: string): readonly [number, number, number] {
    const hit = cache.get(id);
    if (hit) return hit;
    const bone = byId.get(id);
    if (!bone) return [0, 0, 0];
    const local: [number, number, number] = [
      bone.bindTransform[12] ?? 0,
      bone.bindTransform[13] ?? 0,
      bone.bindTransform[14] ?? 0,
    ];
    if (bone.parentId === null) {
      cache.set(id, local);
      return local;
    }
    const parent = worldOf(bone.parentId);
    const world: [number, number, number] = [
      parent[0] + local[0],
      parent[1] + local[1],
      parent[2] + local[2],
    ];
    cache.set(id, world);
    return world;
  }

  return rig.bones.map((bone) => ({
    id: bone.id,
    parentId: bone.parentId,
    position3d: worldOf(bone.id),
  }));
}

export function selectRig(species: Species): CharacterRigSchema {
  if (species === "human") return createHumanRig();
  if (species === "fox") return createFoxQuadrupedRig();
  return createAnthroRig();
}

export function ensureEnergyMesh(
  scene: Rt4dSceneRecord,
  intendedSpecies: Species = scene.characterPipeline?.intendedSpecies ?? "anthro",
  topology?: "tesseract" | "moebius"
): CharacterPipeline {
  const existing = scene.characterPipeline;
  const meshSeedHex = existing?.meshSeedHex ?? scene.provenance.hashes.sceneSha256;
  const effectiveTopology = topology ?? existing?.topology ?? "tesseract";
  const mesh = buildEnergyWireMesh4d({
    sceneSeedHex: meshSeedHex,
    rigBinding: existing?.rigBinding,
    topology: effectiveTopology,
  });
  const now = new Date().toISOString();
  const pipeline: CharacterPipeline = {
    intendedSpecies,
    meshSeedHex,
    topology: effectiveTopology,
    wireMesh: mesh,
    rigBinding: existing?.rigBinding,
    stages: {
      ...existing?.stages,
      energy: { meshSha256: mesh.meshSha256, statusTag: "partial", at: now },
    },
  };
  scene.characterPipeline = pipeline;
  return pipeline;
}

export function attachEnergyMeshToScene(
  sceneId: string,
  intendedSpecies: Species,
  topology?: "tesseract" | "moebius"
): Rt4dSceneRecord {
  const scene = getSceneOrThrow(sceneId);
  ensureEnergyMesh(scene, intendedSpecies, topology);
  scene.continuityState = {
    ...scene.continuityState,
    characterState: {
      ...scene.continuityState.characterState,
      intendedSpecies,
      pipeline: "energy_wire_mesh",
    },
  };
  return commitSceneRecord(scene);
}

export function bindCharacterRigToScene(
  sceneId: string,
  species: Species
): Rt4dSceneRecord {
  const scene = getSceneOrThrow(sceneId);
  const rig = selectRig(species);
  const rigSha256 = characterRigHash(rig);
  const now = new Date().toISOString();
  const binding: CharacterRigBinding = {
    schemaVersion: "character-rig/1.0",
    status: "core-enforced-fixture-not-production-rig",
    species,
    rigId: rig.id,
    rigSha256,
    boneCount: rig.bones.length,
    blendshapeCount: rig.blendshapes.length,
    capabilities: { ...rig.capabilities },
    bones: boneWorldPositions(rig),
    boundAt: now,
  };

  scene.characterPipeline = {
    intendedSpecies: species,
    meshSeedHex:
      scene.characterPipeline?.meshSeedHex ?? scene.provenance.hashes.sceneSha256,
    rigBinding: binding,
    stages: scene.characterPipeline?.stages ?? {},
  };
  ensureEnergyMesh(scene, species);

  scene.continuityState = {
    ...scene.continuityState,
    characterState: {
      ...scene.continuityState.characterState,
      intendedSpecies: species,
      rigId: binding.rigId,
      rigSha256: binding.rigSha256,
      rigStatus: binding.status,
      pipeline: "rig_bound",
    },
    continuityVersion: scene.continuityState.continuityVersion + 1,
  };

  return commitSceneRecord(scene);
}

export function clayStagePayload(scene: Rt4dSceneRecord) {
  const pipeline = scene.characterPipeline;
  const mesh = pipeline?.wireMesh;
  const binding = pipeline?.rigBinding;
  if (!mesh || !binding) {
    throw new Error("ClayRigRequiresBind");
  }
  const vertices3d = projectWireMeshTo3d(mesh, scene.projection.distance4d);
  const clay = {
    schemaVersion: "rt4d-clay-rig/v0.1",
    statusTag: "partial" as const,
    note: "Fixture clay + armature overlay. Not a production sculpt or photoreal clay render.",
    meshSha256: mesh.meshSha256,
    vertices3d,
    bones: binding.bones,
    species: binding.species,
    rigId: binding.rigId,
    rigSha256: binding.rigSha256,
  };
  const claySha256 = sha256Hex(JSON.stringify({ vertices3d, meshSha256: mesh.meshSha256 }));
  const armatureSha256 = sha256Hex(JSON.stringify(binding.bones));
  return { clay, claySha256, armatureSha256, meshSha256: mesh.meshSha256 };
}

export function recordClayStage(sceneId: string): Rt4dSceneRecord {
  const scene = getSceneOrThrow(sceneId);
  const { claySha256, armatureSha256 } = clayStagePayload(scene);
  const now = new Date().toISOString();
  if (!scene.characterPipeline) {
    throw new Error("ClayRigRequiresBind");
  }
  scene.characterPipeline = {
    ...scene.characterPipeline,
    stages: {
      ...scene.characterPipeline.stages,
      clay_rig: { claySha256, armatureSha256, statusTag: "partial", at: now },
    },
  };
  return commitSceneRecord(scene);
}

export function recordBeautyStage(
  sceneId: string,
  previewSha256?: string
): Rt4dSceneRecord {
  const scene = getSceneOrThrow(sceneId);
  if (!scene.characterPipeline?.rigBinding) {
    throw new Error("BeautyRequiresBind");
  }
  const now = new Date().toISOString();
  scene.characterPipeline = {
    ...scene.characterPipeline,
    stages: {
      ...scene.characterPipeline.stages,
      beauty: {
        previewSha256,
        statusTag: "partial",
        beautyFidelity: "partial_with_gaps",
        at: now,
      },
    },
  };
  return commitSceneRecord(scene);
}
