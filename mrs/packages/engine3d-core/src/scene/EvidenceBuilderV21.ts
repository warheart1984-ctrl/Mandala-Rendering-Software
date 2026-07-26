import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV20, type EvidenceRecordV20 } from "./EvidenceBuilderV20.js";
import { hashCanonical } from "./hash.js";

export interface EvidenceRecordV21 extends EvidenceRecordV20 {
  readonly curveHash?: string;
  readonly multiSkinHash?: string;
}

export function buildEvidenceRecordV21(args: {
  readonly world: Engine3DWorldDocument;
  readonly scene: unknown;
  readonly frameIndex: number;
  readonly seed: number;
  readonly deformedRigs?: readonly DeformedHumanRigFrame[];
  readonly deformationState?: {
    readonly bones?: unknown;
    readonly vertices?: unknown;
    readonly morphWeights?: Readonly<Record<string, number>>;
    readonly facialCurves?: unknown;
    readonly multiSkinRouting?: unknown;
  };
  readonly physics?: unknown;
  readonly particles?: unknown;
  readonly pngChecksum?: string;
}): EvidenceRecordV21 {
  const base = buildEvidenceRecordV20(args);
  const curveHash = args.deformationState?.facialCurves
    ? hashCanonical(args.deformationState.facialCurves)
    : args.deformedRigs?.some((rig) => rig.curveHash)
      ? hashCanonical(args.deformedRigs.map((rig) => rig.curveHash ?? null))
      : undefined;
  const multiSkinHash = args.deformationState?.multiSkinRouting
    ? hashCanonical(args.deformationState.multiSkinRouting)
    : args.deformedRigs?.some((rig) => rig.multiSkinHash)
      ? hashCanonical(args.deformedRigs.map((rig) => rig.multiSkinHash ?? null))
      : undefined;
  return {
    ...base,
    ...(curveHash ? { curveHash } : {}),
    ...(multiSkinHash ? { multiSkinHash } : {}),
  };
}

export class EvidenceBuilderV21 {
  build(
    world: Engine3DWorldDocument,
    scene: unknown,
    frameIndex: number,
    seed: number,
    deformationState?: {
      readonly bones?: unknown;
      readonly vertices?: unknown;
      readonly morphWeights?: Readonly<Record<string, number>>;
      readonly facialCurves?: unknown;
      readonly multiSkinRouting?: unknown;
    },
    pngChecksum?: string,
  ): EvidenceRecordV21 {
    return buildEvidenceRecordV21({ world, scene, frameIndex, seed, deformationState, pngChecksum });
  }
}
