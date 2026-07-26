import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV12, type EvidenceRecordV12 } from "./EvidenceBuilderV12.js";
import { hashCanonical } from "./hash.js";

export interface EvidenceRecordV20 extends EvidenceRecordV12 {
  readonly morphHash?: string;
}

export function buildEvidenceRecordV20(args: {
  readonly world: Engine3DWorldDocument;
  readonly scene: unknown;
  readonly frameIndex: number;
  readonly seed: number;
  readonly deformedRigs?: readonly DeformedHumanRigFrame[];
  readonly deformationState?: {
    readonly bones?: unknown;
    readonly vertices?: unknown;
    readonly morphWeights?: Readonly<Record<string, number>>;
  };
  readonly physics?: unknown;
  readonly particles?: unknown;
  readonly pngChecksum?: string;
}): EvidenceRecordV20 {
  const base = buildEvidenceRecordV12(args);
  const morphHash = args.deformationState?.morphWeights
    ? hashCanonical(args.deformationState.morphWeights)
    : base.morphHash;
  return {
    ...base,
    boneHash: args.deformationState?.bones ? hashCanonical(args.deformationState.bones) : base.boneHash,
    meshDeformationHash: args.deformationState?.vertices ? hashCanonical(args.deformationState.vertices) : base.meshDeformationHash,
    ...(morphHash ? { morphHash } : {}),
  };
}

export class EvidenceBuilderV20 {
  build(
    world: Engine3DWorldDocument,
    scene: unknown,
    frameIndex: number,
    seed: number,
    deformationState?: {
      readonly bones?: unknown;
      readonly vertices?: unknown;
      readonly morphWeights?: Readonly<Record<string, number>>;
    },
    pngChecksum?: string,
  ): EvidenceRecordV20 {
    return buildEvidenceRecordV20({ world, scene, frameIndex, seed, deformationState, pngChecksum });
  }
}
