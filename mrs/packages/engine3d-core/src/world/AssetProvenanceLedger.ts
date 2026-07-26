import type { AssetProvenanceRecord, GovernedAssetKind } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export class AssetProvenanceLedger {
  private readonly records = new Map<string, AssetProvenanceRecord>();

  constructor(records: readonly AssetProvenanceRecord[] = []) {
    for (const record of records) this.upsert(record);
  }

  upsert(record: AssetProvenanceRecord): AssetProvenanceRecord {
    this.records.set(record.assetId, normalizeRecord(record));
    return this.records.get(record.assetId)!;
  }

  appendTransform(assetId: string, transform: AssetProvenanceRecord["transforms"][number]): AssetProvenanceRecord {
    const record = this.require(assetId);
    return this.upsert({ ...record, transforms: [...record.transforms, transform] });
  }

  appendUsage(assetId: string, usage: AssetProvenanceRecord["usage"][number]): AssetProvenanceRecord {
    const record = this.require(assetId);
    return this.upsert({ ...record, usage: [...record.usage, usage] });
  }

  entries(): readonly AssetProvenanceRecord[] {
    return Array.from(this.records.values()).sort((a, b) => a.assetId.localeCompare(b.assetId));
  }

  hash(): string | undefined {
    return hashAssetProvenance(this.entries());
  }

  private require(assetId: string): AssetProvenanceRecord {
    const record = this.records.get(assetId);
    if (!record) throw new Error(`Unknown asset provenance record ${assetId}`);
    return record;
  }
}

export function createImportProvenanceRecord(args: {
  readonly assetId: string;
  readonly kind: GovernedAssetKind;
  readonly uri?: string;
  readonly originalHash?: string;
  readonly transformType?: string;
  readonly timestamp?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}): AssetProvenanceRecord {
  return normalizeRecord({
    assetId: args.assetId,
    kind: args.kind,
    source: {
      type: "imported",
      ...(args.uri ? { uri: args.uri } : {}),
      ...(args.originalHash ? { originalHash: args.originalHash } : {}),
    },
    transforms: [{
      type: args.transformType ?? "import",
      timestamp: args.timestamp ?? "1970-01-01T00:00:00.000Z",
      details: args.details ?? {},
    }],
    usage: [],
  });
}

export function hashAssetProvenance(records: readonly AssetProvenanceRecord[] = []): string | undefined {
  return records.length ? hashCanonical(records.map(normalizeRecord).sort((a, b) => a.assetId.localeCompare(b.assetId))) : undefined;
}

function normalizeRecord(record: AssetProvenanceRecord): AssetProvenanceRecord {
  return {
    ...record,
    transforms: [...record.transforms].sort((a, b) => `${a.timestamp}:${a.type}`.localeCompare(`${b.timestamp}:${b.type}`)),
    usage: [...record.usage].sort((a, b) => `${a.worldId}:${a.sceneId ?? ""}`.localeCompare(`${b.worldId}:${b.sceneId ?? ""}`)),
  };
}
