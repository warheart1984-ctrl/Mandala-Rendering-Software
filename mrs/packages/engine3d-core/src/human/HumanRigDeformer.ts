import { hashCanonical } from "../scene/hash.js";
import type {
  DeformedHumanRigFrame,
  DeformedMesh,
  HumanMeshRef,
  HumanRig,
  HumanSkeleton,
  Mat4Tuple,
  Pose,
} from "./HumanRigTypes.js";
import { FacialCurvePlayer } from "./FacialCurvePlayer.js";
import { IDENTITY_MAT4, multiplyMat4, normalize3, transformPoint, transformVector } from "./mat4.js";
import { applyMorphTargets } from "./MorphTargetDeformer.js";

function poseOverride(pose: Pose | undefined, boneId: string, fallback: Mat4Tuple): Mat4Tuple {
  return pose?.boneTransforms[boneId] ?? fallback;
}

function findPose(rig: HumanRig, poseId?: string): Pose | undefined {
  if (!poseId) return undefined;
  return rig.poses.poses.find((pose) => pose.id === poseId);
}

function stableMatrixRecord(record: Readonly<Record<string, Mat4Tuple>>): Record<string, readonly number[]> {
  const out: Record<string, readonly number[]> = {};
  for (const key of Object.keys(record).sort()) out[key] = Array.from(record[key]!);
  return out;
}

function multiSkinRouting(rig: HumanRig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mesh of rig.meshes.all) {
    if (mesh.skinId) out[mesh.id] = mesh.skinId;
  }
  return out;
}

export function computeGlobalBones(skeleton: HumanSkeleton, pose?: Pose): Record<string, Mat4Tuple> {
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  const global: Record<string, Mat4Tuple> = {};
  const visiting = new Set<string>();

  const compute = (boneId: string): Mat4Tuple => {
    if (global[boneId]) return global[boneId]!;
    const bone = byId.get(boneId);
    if (!bone) throw new Error(`Unknown bone ${boneId}`);
    if (visiting.has(boneId)) throw new Error(`Cycle detected in HumanRig skeleton at ${boneId}`);
    visiting.add(boneId);
    const local = poseOverride(pose, bone.id, bone.localTransform);
    const parent = bone.parentId ? compute(bone.parentId) : IDENTITY_MAT4;
    global[bone.id] = multiplyMat4(parent, local);
    visiting.delete(boneId);
    return global[bone.id]!;
  };

  for (const bone of skeleton.bones) compute(bone.id);
  return global;
}

function generateNormals(vertices: Float32Array, indices: Uint16Array | Uint32Array): Float32Array {
  const normals = new Float32Array(vertices.length);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i]! * 3, ib = indices[i + 1]! * 3, ic = indices[i + 2]! * 3;
    const ax = vertices[ia]!, ay = vertices[ia + 1]!, az = vertices[ia + 2]!;
    const bx = vertices[ib]!, by = vertices[ib + 1]!, bz = vertices[ib + 2]!;
    const cx = vertices[ic]!, cy = vertices[ic + 1]!, cz = vertices[ic + 2]!;
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const o of [ia, ib, ic]) {
      normals[o] = (normals[o] ?? 0) + nx;
      normals[o + 1] = (normals[o + 1] ?? 0) + ny;
      normals[o + 2] = (normals[o + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const n = normalize3(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }
  return normals;
}

export function deformHumanMesh(
  mesh: HumanMeshRef,
  skeleton: HumanSkeleton,
  globalBones: Readonly<Record<string, Mat4Tuple>>,
  morphWeights: Readonly<Record<string, number>> = {},
): DeformedMesh {
  const morphed = applyMorphTargets(mesh, morphWeights);
  const sourceVertices = morphed.vertices;
  const sourceNormals = morphed.normals;
  const vertexCount = sourceVertices.length / 3;
  const vertices = new Float32Array(sourceVertices.length);
  const normals = sourceNormals ? new Float32Array(sourceNormals.length) : undefined;

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const po = vertex * 3;
    const so = vertex * 4;
    const x = sourceVertices[po]!, y = sourceVertices[po + 1]!, z = sourceVertices[po + 2]!;
    const nx = sourceNormals?.[po] ?? 0, ny = sourceNormals?.[po + 1] ?? 0, nz = sourceNormals?.[po + 2] ?? 1;
    let fx = 0, fy = 0, fz = 0;
    let fnx = 0, fny = 0, fnz = 0;
    let totalWeight = 0;

    for (let slot = 0; slot < 4; slot++) {
      const weight = mesh.skinWeights[so + slot] ?? 0;
      if (weight === 0) continue;
      const boneIndex = mesh.skinIndices[so + slot] ?? 0;
      const bone = skeleton.bones[boneIndex];
      if (!bone) continue;
      const global = globalBones[bone.id];
      if (!global) continue;
      const skinMatrix = multiplyMat4(global, bone.inverseBind);
      const p = transformPoint(skinMatrix, x, y, z);
      fx += p[0] * weight;
      fy += p[1] * weight;
      fz += p[2] * weight;
      const n = transformVector(skinMatrix, nx, ny, nz);
      fnx += n[0] * weight;
      fny += n[1] * weight;
      fnz += n[2] * weight;
      totalWeight += weight;
    }

    if (totalWeight <= 0) {
      fx = x;
      fy = y;
      fz = z;
      fnx = nx;
      fny = ny;
      fnz = nz;
    }

    vertices[po] = fx;
    vertices[po + 1] = fy;
    vertices[po + 2] = fz;
    if (normals) {
      const n = normalize3(fnx, fny, fnz);
      normals[po] = n[0];
      normals[po + 1] = n[1];
      normals[po + 2] = n[2];
    }
  }

  return {
    id: mesh.id,
    role: mesh.role,
    vertices,
    normals: normals ?? generateNormals(vertices, mesh.indices),
    indices: mesh.indices,
    materialId: mesh.materialId,
    appliedMorphs: morphed.appliedMorphs,
  };
}

export function deformHumanRig(rig: HumanRig, poseId?: string, time = 0): DeformedHumanRigFrame {
  const pose = findPose(rig, poseId);
  const globalBones = computeGlobalBones(rig.skeleton, pose);
  const curveWeights = rig.facialRig ? new FacialCurvePlayer(rig.facialRig).evaluate(time) : {};
  const morphWeights = {
    ...curveWeights,
    ...(pose?.expressionParams ?? {}),
    ...(pose?.morphWeights ?? {}),
  };
  const meshes = rig.meshes.all.map((mesh) => deformHumanMesh(mesh, rig.skeleton, globalBones, morphWeights));
  const morphHash = Object.keys(morphWeights).length ? hashCanonical(morphWeights) : undefined;
  const routing = multiSkinRouting(rig);
  return {
    rigId: rig.id,
    poseId,
    globalBones,
    meshes,
    boneHash: hashCanonical(stableMatrixRecord(globalBones)),
    morphHash,
    curveHash: rig.facialRig ? hashCanonical(rig.facialRig) : undefined,
    multiSkinHash: Object.keys(routing).length ? hashCanonical(routing) : undefined,
    meshDeformationHash: hashCanonical(meshes.map((mesh) => ({
      id: mesh.id,
      materialId: mesh.materialId,
      appliedMorphs: mesh.appliedMorphs ?? {},
      vertices: Array.from(mesh.vertices),
      normals: mesh.normals ? Array.from(mesh.normals) : [],
      indices: Array.from(mesh.indices),
    }))),
  };
}

export class HumanRigDeformer {
  constructor(private readonly rig: HumanRig) {}

  computeGlobalBones(poseId?: string): Record<string, Mat4Tuple> {
    return computeGlobalBones(this.rig.skeleton, findPose(this.rig, poseId));
  }

  deformAllMeshes(poseId?: string, time = 0): DeformedHumanRigFrame {
    return deformHumanRig(this.rig, poseId, time);
  }

  deformMesh(mesh: HumanMeshRef, globalBones: Readonly<Record<string, Mat4Tuple>>): DeformedMesh {
    return deformHumanMesh(mesh, this.rig.skeleton, globalBones);
  }
}
