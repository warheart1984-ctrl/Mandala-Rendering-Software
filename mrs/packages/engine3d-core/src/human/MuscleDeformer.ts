import { hashCanonical } from "../scene/hash.js";
import type { MuscleRig } from "./HumanRigTypes.js";

export interface MuscleDeformationResult {
  readonly vertices: Float32Array;
  readonly muscleHash?: string;
  readonly softTissueHash?: string;
}

function normalizeDirection(direction: readonly [number, number, number] | undefined): [number, number, number] {
  const d = direction ?? [1, 0, 0];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

export class MuscleDeformer {
  constructor(private readonly muscleRig: MuscleRig) {}

  apply(baseVertices: Float32Array, activationState: Readonly<Record<string, number>> = {}): MuscleDeformationResult {
    const vertices = new Float32Array(baseVertices);
    const regionById = new Map(this.muscleRig.regions.map((region) => [region.id, region]));
    const applied: Record<string, number> = {};
    const touchedRegions = new Set<string>();

    for (const muscle of this.muscleRig.muscles) {
      const activation = activationState[muscle.id] ?? activationState[muscle.activationCurveId] ?? 0;
      if (!Number.isFinite(activation) || activation === 0) continue;
      const region = regionById.get(muscle.influenceRegionId);
      if (!region) continue;
      const direction = normalizeDirection(muscle.direction);
      const displacement = activation * region.stiffness * (1 - Math.min(0.99, Math.max(0, region.damping))) * 0.001;
      for (const vertexIndex of region.vertexIndices) {
        const o = vertexIndex * 3;
        if (o + 2 >= vertices.length) continue;
        vertices[o] = (vertices[o] ?? 0) + direction[0] * displacement;
        vertices[o + 1] = (vertices[o + 1] ?? 0) + direction[1] * displacement;
        vertices[o + 2] = (vertices[o + 2] ?? 0) + direction[2] * displacement;
      }
      applied[muscle.id] = activation;
      touchedRegions.add(region.id);
    }

    return {
      vertices,
      muscleHash: Object.keys(applied).length ? hashCanonical(applied) : undefined,
      softTissueHash: touchedRegions.size ? hashCanonical(Array.from(touchedRegions).sort()) : undefined,
    };
  }
}
