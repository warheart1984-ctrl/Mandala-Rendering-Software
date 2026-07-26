import type { TextureAsset, TextureColorSpace, TextureFormat, TextureRef, TextureRole } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export interface TextureValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface TextureValidationResult {
  readonly ok: boolean;
  readonly issues: readonly TextureValidationIssue[];
}

export interface Rt4dTextureEntry {
  readonly id: string;
  readonly role?: TextureRole;
  readonly uri?: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly colorSpace: TextureColorSpace;
  readonly checksum: string;
  readonly sampler: Required<NonNullable<TextureAsset["sampler"]>>;
}

const DEFAULT_SAMPLER: Required<NonNullable<TextureAsset["sampler"]>> = Object.freeze({
  wrapS: "repeat",
  wrapT: "repeat",
  minFilter: "linear",
  magFilter: "linear",
});

function issue(code: string, message: string, path?: string): TextureValidationIssue {
  return { code, message, path };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isChecksum(value: string): boolean {
  return /^[a-zA-Z0-9:_-]{8,}$/.test(value);
}

export function validateTextureAssets(textures: readonly TextureAsset[]): TextureValidationResult {
  const issues: TextureValidationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, texture] of textures.entries()) {
    const path = `textures.${index}`;
    if (!texture.id) issues.push(issue("missing-texture-id", "TextureAsset requires stable id.", `${path}.id`));
    if (ids.has(texture.id)) issues.push(issue("duplicate-texture-id", `Duplicate texture id ${texture.id}.`, `${path}.id`));
    ids.add(texture.id);
    if (!isPositiveInteger(texture.width)) issues.push(issue("invalid-texture-width", "Texture width must be a positive integer.", `${path}.width`));
    if (!isPositiveInteger(texture.height)) issues.push(issue("invalid-texture-height", "Texture height must be a positive integer.", `${path}.height`));
    if (!texture.checksum || !isChecksum(texture.checksum)) issues.push(issue("invalid-texture-checksum", "Texture checksum must be stable and at least 8 safe characters.", `${path}.checksum`));
  }
  return { ok: issues.length === 0, issues };
}

export function validateTextureRefs(textureRefs: readonly TextureRef[], textures: readonly TextureAsset[]): TextureValidationResult {
  const issues: TextureValidationIssue[] = [];
  const assetIds = new Set(textures.map((texture) => texture.id));
  const refs = new Set<string>();
  for (const [index, ref] of textureRefs.entries()) {
    const path = `textureRefs.${index}`;
    if (!ref.id) issues.push(issue("missing-texture-ref-id", "TextureRef requires id.", `${path}.id`));
    if (!assetIds.has(ref.id)) issues.push(issue("unknown-texture-ref", `TextureRef ${ref.id} has no matching TextureAsset.`, `${path}.id`));
    const key = `${ref.role}:${ref.id}`;
    if (refs.has(key)) issues.push(issue("duplicate-texture-ref", `Duplicate texture ref ${key}.`, path));
    refs.add(key);
  }
  return { ok: issues.length === 0, issues };
}

export function textureToRt4dEntry(texture: TextureAsset): Rt4dTextureEntry {
  return {
    id: texture.id,
    ...(texture.role ? { role: texture.role } : {}),
    ...(texture.uri ? { uri: texture.uri } : {}),
    width: texture.width,
    height: texture.height,
    format: texture.format,
    colorSpace: texture.colorSpace,
    checksum: texture.checksum,
    sampler: {
      ...DEFAULT_SAMPLER,
      ...texture.sampler,
    },
  };
}

export function buildRt4dTextureTable(textures: readonly TextureAsset[] = []): readonly Rt4dTextureEntry[] {
  return textures.map(textureToRt4dEntry).sort((a, b) => a.id.localeCompare(b.id));
}

export function hashTextureTable(textures: readonly TextureAsset[] = []): string {
  return hashCanonical(buildRt4dTextureTable(textures));
}
