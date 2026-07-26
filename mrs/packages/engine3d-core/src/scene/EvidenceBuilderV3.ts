import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV21, type EvidenceRecordV21 } from "./EvidenceBuilderV21.js";
import { hashCanonical } from "./hash.js";

export interface EvidenceRecordV3 extends EvidenceRecordV21 {
  readonly muscleHash?: string;
  readonly softTissueHash?: string;
  readonly volumeHash?: string;
  readonly temporalHash?: string;
}

export function buildEvidenceRecordV3(args: {
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
    readonly muscleActivation?: Readonly<Record<string, number>>;
    readonly softTissueRegions?: unknown;
  };
  readonly simState?: {
    readonly physics?: unknown;
    readonly particles?: unknown;
    readonly volumes?: unknown;
    readonly temporal?: unknown;
  };
  readonly pngChecksum?: string;
}): EvidenceRecordV3 {
  const base = buildEvidenceRecordV21({
    world: args.world,
    scene: args.scene,
    frameIndex: args.frameIndex,
    seed: args.seed,
    deformedRigs: args.deformedRigs,
    deformationState: args.deformationState,
    physics: args.simState?.physics,
    particles: args.simState?.particles,
    pngChecksum: args.pngChecksum,
  });
  const muscleHash = args.deformationState?.muscleActivation
    ? hashCanonical(args.deformationState.muscleActivation)
    : args.deformedRigs?.some((rig) => rig.muscleHash)
      ? hashCanonical(args.deformedRigs.map((rig) => rig.muscleHash ?? null))
      : undefined;
  const softTissueHash = args.deformationState?.softTissueRegions
    ? hashCanonical(args.deformationState.softTissueRegions)
    : args.deformedRigs?.some((rig) => rig.softTissueHash)
      ? hashCanonical(args.deformedRigs.map((rig) => rig.softTissueHash ?? null))
      : undefined;
  return {
    ...base,
    ...(muscleHash ? { muscleHash } : {}),
    ...(softTissueHash ? { softTissueHash } : {}),
    ...(args.simState?.volumes ? { volumeHash: hashCanonical(args.simState.volumes) } : {}),
    ...(args.simState?.temporal ? { temporalHash: hashCanonical(args.simState.temporal) } : {}),
  };
}

export class EvidenceBuilderV3 {
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
      readonly muscleActivation?: Readonly<Record<string, number>>;
      readonly softTissueRegions?: unknown;
    },
    simState?: {
      readonly physics?: unknown;
      readonly particles?: unknown;
      readonly volumes?: unknown;
      readonly temporal?: unknown;
    },
    pngChecksum?: string,
  ): EvidenceRecordV3 {
    return buildEvidenceRecordV3({ world, scene, frameIndex, seed, deformationState, simState, pngChecksum });
  }
}
