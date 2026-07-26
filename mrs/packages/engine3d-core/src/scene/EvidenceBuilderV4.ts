import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import type { Engine3DWorldDocument } from "../world/WorldObject.js";
import { buildEvidenceRecordV3, type EvidenceRecordV3 } from "./EvidenceBuilderV3.js";
import { hashCanonical } from "./hash.js";
import type { FederatedWorldV4 } from "./FederatedWorldV4.js";

export interface EvidenceRecordV4 extends EvidenceRecordV3 {
  readonly regionHash?: string;
  readonly simHash?: string;
  readonly federationHash?: string;
  readonly worldLinkHash?: string;
  readonly timelineHash?: string;
  readonly multiWorldMaterialHash?: string;
  readonly worldEvidenceHash?: string;
}

export function buildEvidenceRecordV4(args: {
  readonly world: Engine3DWorldDocument;
  readonly scene: unknown;
  readonly frameIndex: number;
  readonly seed: number;
  readonly deformedRigs?: readonly DeformedHumanRigFrame[];
  readonly federation?: FederatedWorldV4;
  readonly worldEvidence?: readonly EvidenceRecordV3[];
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
    readonly fluids?: unknown;
    readonly weather?: unknown;
  };
  readonly regionState?: unknown;
  readonly pngChecksum?: string;
}): EvidenceRecordV4 {
  const base = buildEvidenceRecordV3(args);
  const federation = args.federation;
  const regionState = args.regionState
    ?? args.deformedRigs?.map((rig) => ({
      rigId: rig.rigId,
      muscleHash: rig.muscleHash ?? null,
      softTissueHash: rig.softTissueHash ?? null,
    }));
  const simState = args.simState
    ? {
        physics: args.simState.physics ?? null,
        particles: args.simState.particles ?? null,
        fluids: args.simState.fluids ?? null,
        weather: args.simState.weather ?? null,
      }
    : undefined;
  return {
    ...base,
    ...(regionState ? { regionHash: hashCanonical(regionState) } : {}),
    ...(simState ? { simHash: hashCanonical(simState) } : {}),
    ...(federation ? { federationHash: hashCanonical({
      id: federation.id,
      worlds: federation.worlds.map((entry) => ({ id: entry.id, worldHash: hashCanonical(entry.world) })),
      capabilities: federation.capabilities,
    }) } : {}),
    ...(federation ? { worldLinkHash: hashCanonical(federation.links) } : {}),
    ...(federation ? { timelineHash: hashCanonical(federation.timeline) } : {}),
    ...(federation ? { multiWorldMaterialHash: hashCanonical(federation.worlds.map((entry) => ({
      worldId: entry.id,
      materials: entry.world.materials,
    }))) } : {}),
    ...(args.worldEvidence?.length ? { worldEvidenceHash: hashCanonical(args.worldEvidence) } : {}),
  };
}

export class EvidenceBuilderV4 {
  build(args: Parameters<typeof buildEvidenceRecordV4>[0]): EvidenceRecordV4 {
    return buildEvidenceRecordV4(args);
  }
}
