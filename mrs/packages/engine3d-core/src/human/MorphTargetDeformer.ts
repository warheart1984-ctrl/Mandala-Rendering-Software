import { hashCanonical } from "../scene/hash.js";
import type { HumanMeshRef, MorphChannel } from "./HumanRigTypes.js";
import { normalize3 } from "./mat4.js";

export interface MorphedMeshData {
  readonly vertices: Float32Array;
  readonly normals?: Float32Array;
  readonly appliedMorphs: Readonly<Record<string, number>>;
  readonly morphHash: string;
}

function normalizeWeights(weights: Readonly<Record<string, number>> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(weights).sort()) {
    const value = weights[key] ?? 0;
    if (Number.isFinite(value) && value !== 0) out[key] = value;
  }
  return out;
}

function channelMap(channels: readonly MorphChannel[]): Map<string, MorphChannel> {
  return new Map(channels.map((channel) => [channel.id, channel]));
}

export function applyMorphTargets(mesh: HumanMeshRef, morphWeights: Readonly<Record<string, number>> = {}): MorphedMeshData {
  const weights = normalizeWeights(morphWeights);
  const byId = channelMap(mesh.morphChannels);
  const vertices = new Float32Array(mesh.vertices);
  const normals = mesh.normals ? new Float32Array(mesh.normals) : undefined;
  const vertexCount = mesh.vertices.length / 3;

  for (const [morphId, weight] of Object.entries(weights)) {
    const channel = byId.get(morphId);
    if (!channel) continue;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const o = vertex * 3;
      vertices[o] = (vertices[o] ?? 0) + (channel.positionDeltas[o] ?? 0) * weight;
      vertices[o + 1] = (vertices[o + 1] ?? 0) + (channel.positionDeltas[o + 1] ?? 0) * weight;
      vertices[o + 2] = (vertices[o + 2] ?? 0) + (channel.positionDeltas[o + 2] ?? 0) * weight;
      if (normals && channel.normalDeltas) {
        normals[o] = (normals[o] ?? 0) + (channel.normalDeltas[o] ?? 0) * weight;
        normals[o + 1] = (normals[o + 1] ?? 0) + (channel.normalDeltas[o + 1] ?? 0) * weight;
        normals[o + 2] = (normals[o + 2] ?? 0) + (channel.normalDeltas[o + 2] ?? 0) * weight;
      }
    }
  }

  if (normals) {
    for (let i = 0; i + 2 < normals.length; i += 3) {
      const n = normalize3(normals[i]!, normals[i + 1]!, normals[i + 2]!);
      normals[i] = n[0];
      normals[i + 1] = n[1];
      normals[i + 2] = n[2];
    }
  }

  return {
    vertices,
    normals,
    appliedMorphs: weights,
    morphHash: hashCanonical(weights),
  };
}

export class MorphTargetDeformer {
  deformMeshWithMorphs(mesh: HumanMeshRef, morphWeights: Readonly<Record<string, number>> = {}): MorphedMeshData {
    return applyMorphTargets(mesh, morphWeights);
  }
}
