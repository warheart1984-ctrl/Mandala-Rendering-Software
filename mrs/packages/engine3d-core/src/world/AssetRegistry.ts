import type { GovernedAssetManifest } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export interface AssetValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface AssetValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AssetValidationIssue[];
}

function issue(code: string, message: string, path?: string): AssetValidationIssue {
  return { code, message, path };
}

function validHash(hash: string): boolean {
  return /^(sha256:)?[a-zA-Z0-9_-]{8,}$/.test(hash);
}

export function validateAssetManifests(assets: readonly GovernedAssetManifest[] = []): AssetValidationResult {
  const issues: AssetValidationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    const path = `assets.${index}`;
    if (!asset.id) issues.push(issue("missing-asset-id", "Asset manifest requires id.", `${path}.id`));
    if (ids.has(asset.id)) issues.push(issue("duplicate-asset-id", `Duplicate asset id ${asset.id}.`, `${path}.id`));
    ids.add(asset.id);
    if (!asset.version) issues.push(issue("missing-asset-version", "Asset manifest requires version.", `${path}.version`));
    if (!asset.contentHash || !validHash(asset.contentHash)) issues.push(issue("invalid-asset-content-hash", "Asset contentHash must be stable and hash-like.", `${path}.contentHash`));
    if (asset.provenance?.createdAt && Number.isNaN(Date.parse(asset.provenance.createdAt))) {
      issues.push(issue("invalid-asset-createdAt", "Asset provenance.createdAt must be parseable.", `${path}.provenance.createdAt`));
    }
    if (asset.provenance?.modifiedAt && Number.isNaN(Date.parse(asset.provenance.modifiedAt))) {
      issues.push(issue("invalid-asset-modifiedAt", "Asset provenance.modifiedAt must be parseable.", `${path}.provenance.modifiedAt`));
    }
  }
  return { ok: issues.length === 0, issues };
}

export class AssetRegistry {
  private readonly table = new Map<string, GovernedAssetManifest>();

  constructor(assets: readonly GovernedAssetManifest[] = []) {
    for (const asset of assets) this.register(asset);
  }

  register(asset: GovernedAssetManifest): GovernedAssetManifest {
    const result = validateAssetManifests([asset]);
    if (!result.ok) throw new Error(`Invalid asset manifest: ${result.issues.map((item) => item.code).join(", ")}`);
    this.table.set(asset.id, asset);
    return asset;
  }

  registerMany(assets: readonly GovernedAssetManifest[]): readonly GovernedAssetManifest[] {
    for (const asset of assets) this.register(asset);
    return assets;
  }

  get(id: string): GovernedAssetManifest | undefined {
    return this.table.get(id);
  }

  entries(): readonly GovernedAssetManifest[] {
    return Array.from(this.table.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  hash(): string {
    return hashCanonical(this.entries());
  }
}

export function hashAssetManifests(assets: readonly GovernedAssetManifest[] = []): string | undefined {
  return assets.length ? hashCanonical([...assets].sort((a, b) => a.id.localeCompare(b.id))) : undefined;
}
