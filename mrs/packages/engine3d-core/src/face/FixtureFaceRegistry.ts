/**
 * Fixture face / box-set registry — governed evidence before rasterization.
 *
 * Drive-G-1 honesty: a "constitutional signature" in this codebase means a
 * GovernedAssetManifest contentHash + AssetProvenanceRecord (intent/evidence
 * fields), **not** a PKI / cryptographic certificate. Do not invent fake crypto.
 *
 * Status: **partial**
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type {
  AssetProvenanceRecord,
  GovernedAssetManifest,
  Vec3Tuple,
} from "../world/WorldObject.js";
import { AssetRegistry, validateAssetManifests } from "../world/AssetRegistry.js";
import { createImportProvenanceRecord } from "../world/AssetProvenanceLedger.js";
import { loadFaceRig } from "./FaceRig.js";
import { defaultFaceRigConfig } from "./FaceRigConfig.js";
import {
  detectFaceAssetKind,
  normalizeHumanFaceName,
  resolveHumanFacePath,
} from "./resolveHumanFacePath.js";

export interface MeshAabb {
  readonly min: Vec3Tuple;
  readonly max: Vec3Tuple;
  readonly valid: boolean;
  readonly vertexCount: number;
}

export interface FixtureFaceEntry {
  readonly logicalName: string;
  readonly path: string;
  readonly faceAsset: "fixture" | "operator";
  readonly manifest: GovernedAssetManifest;
  readonly provenance: AssetProvenanceRecord;
  readonly aabb: MeshAabb;
  readonly lawfulForRaster: boolean;
  readonly issues: readonly string[];
}

export interface FixtureRegistryReport {
  readonly ok: boolean;
  readonly entries: readonly FixtureFaceEntry[];
  readonly issues: readonly string[];
  /** Honest definition recorded for auditors. */
  readonly constitutionalSignatureMeaning: string;
}

const SIGNATURE_MEANING =
  "contentHash (sha256 of GLB bytes) + GovernedAssetManifest.provenance + AssetProvenanceRecord — evidence fields, not PKI";

export function computeMeshAabb(vertices: Float32Array): MeshAabb {
  if (!vertices || vertices.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      valid: false,
      vertexCount: 0,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const n = Math.floor(vertices.length / 3);
  for (let i = 0; i < n; i++) {
    const x = vertices[i * 3]!;
    const y = vertices[i * 3 + 1]!;
    const z = vertices[i * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const ok =
    n > 0 &&
    Number.isFinite(minX) &&
    Number.isFinite(maxX) &&
    minX <= maxX &&
    minY <= maxY &&
    minZ <= maxZ;
  return {
    min: [minX === Infinity ? 0 : minX, minY === Infinity ? 0 : minY, minZ === Infinity ? 0 : minZ],
    max: [maxX === -Infinity ? 0 : maxX, maxY === -Infinity ? 0 : maxY, maxZ === -Infinity ? 0 : maxZ],
    valid: ok,
    vertexCount: n,
  };
}

/** Reject inverted / NaN AABBs (integrity gate). */
export function validateAabb(aabb: MeshAabb): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!aabb.valid) issues.push("aabb-invalid");
  if (aabb.vertexCount <= 0) issues.push("aabb-empty");
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(aabb.min[i]!) || !Number.isFinite(aabb.max[i]!)) {
      issues.push(`aabb-nonfinite-axis-${i}`);
    } else if (aabb.min[i]! > aabb.max[i]!) {
      issues.push(`aabb-inverted-axis-${i}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function hashFileSha256(filePath: string): string {
  const bytes = readFileSync(filePath);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Build a governed fixture/operator face entry with evidence + AABB.
 */
export function registerFixtureFace(
  logicalNameOrPath: string,
  options?: { strict?: boolean; registry?: AssetRegistry },
): FixtureFaceEntry {
  const issues: string[] = [];
  let path: string;
  let logicalName: string;
  let faceAsset: "fixture" | "operator";

  if (logicalNameOrPath.toLowerCase().endsWith(".glb") || logicalNameOrPath.includes("/") || logicalNameOrPath.includes("\\")) {
    path = resolve(logicalNameOrPath);
    logicalName = normalizeHumanFaceName(basename(path));
    faceAsset = detectFaceAssetKind(path);
  } else {
    const resolved = resolveHumanFacePath(logicalNameOrPath);
    path = resolved.path;
    logicalName = resolved.logicalName;
    faceAsset = resolved.face_asset;
  }

  if (!existsSync(path)) {
    issues.push("missing-glb");
    const stubHash = "sha256:missing";
    const manifest: GovernedAssetManifest = {
      id: `face:${logicalName}`,
      kind: "rig",
      version: "1.0.0",
      contentHash: stubHash,
      uri: path,
      provenance: {
        source: faceAsset,
        integrityHash: stubHash,
        catalogVersion: "fixture-face-registry/1.0",
      },
      tags: ["face", faceAsset, "blocked"],
    };
    const provenance = createImportProvenanceRecord({
      assetId: manifest.id,
      kind: "rig",
      uri: path,
      originalHash: stubHash,
    });
    return {
      logicalName,
      path,
      faceAsset,
      manifest,
      provenance,
      aabb: { min: [0, 0, 0], max: [0, 0, 0], valid: false, vertexCount: 0 },
      lawfulForRaster: false,
      issues,
    };
  }

  const contentHash = hashFileSha256(path);
  let aabb: MeshAabb = { min: [0, 0, 0], max: [0, 0, 0], valid: false, vertexCount: 0 };

  try {
    const loaded = loadFaceRig({
      ...defaultFaceRigConfig(path),
      strict: options?.strict !== false,
    });
    const positions = new Float32Array(
      loaded.rig.meshes.all.reduce((n, m) => n + m.vertices.length, 0),
    );
    let offset = 0;
    for (const mesh of loaded.rig.meshes.all) {
      positions.set(mesh.vertices, offset);
      offset += mesh.vertices.length;
    }
    aabb = computeMeshAabb(positions);
  } catch (err) {
    issues.push(`rig-load-failed:${err instanceof Error ? err.message : String(err)}`);
  }

  const aabbCheck = validateAabb(aabb);
  if (!aabbCheck.ok) issues.push(...aabbCheck.issues);

  const st = statSync(path);
  const manifest: GovernedAssetManifest = {
    id: `face:${logicalName}`,
    kind: "rig",
    version: "1.0.0",
    contentHash,
    uri: path,
    provenance: {
      source: faceAsset,
      createdAt: st.mtime.toISOString(),
      modifiedAt: st.mtime.toISOString(),
      integrityHash: contentHash,
      catalogVersion: "fixture-face-registry/1.0",
      algorithmId: "sha256",
    },
    tags: ["face", faceAsset, aabbCheck.ok ? "aabb-ok" : "aabb-bad"],
  };

  const validation = validateAssetManifests([manifest]);
  if (!validation.ok) {
    issues.push(...validation.issues.map((i) => i.code));
  }

  const provenance = createImportProvenanceRecord({
    assetId: manifest.id,
    kind: "rig",
    uri: path,
    originalHash: contentHash,
  });

  if (options?.registry && validation.ok) {
    options.registry.register(manifest);
  }

  const lawfulForRaster = issues.length === 0 && validation.ok && aabbCheck.ok;

  return {
    logicalName,
    path,
    faceAsset,
    manifest,
    provenance,
    aabb,
    lawfulForRaster,
    issues,
  };
}

/**
 * Audit default HumanFace* fixtures used by Engine3D soft-raster demos.
 */
export function auditDefaultFaceFixtures(
  names: readonly string[] = ["HumanFaceRigged", "HumanFaceNeutral"],
): FixtureRegistryReport {
  const registry = new AssetRegistry();
  const entries = names.map((n) => registerFixtureFace(n, { registry, strict: true }));
  const issues = entries.flatMap((e) => e.issues.map((i) => `${e.logicalName}:${i}`));
  return {
    ok: entries.every((e) => e.lawfulForRaster),
    entries,
    issues,
    constitutionalSignatureMeaning: SIGNATURE_MEANING,
  };
}

export { SIGNATURE_MEANING as CONSTITUTIONAL_SIGNATURE_MEANING };
