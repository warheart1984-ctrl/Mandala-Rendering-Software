/**
 * Operator-vs-fixture face GLB path resolution.
 *
 * Logical filenames stay `HumanFaceNeutral.glb` / `HumanFaceRigged.glb` so
 * structure_record and tests remain valid; only the filesystem root changes.
 *
 * ## OPERATOR_ASSETS_ROOT semantics
 *
 * - Env: `process.env.OPERATOR_ASSETS_ROOT || "./operator-assets"`
 * - Absolute env value → used as-is (e.g. Docker volume `/operator-assets`)
 * - Relative / default → resolved against the **install/repo root**, not
 *   `process.cwd()`, so npm scripts under `mrs/packages/engine3d-core` still
 *   find `{repo}/operator-assets`.
 * - Install/repo root is the nearest ancestor of this module that contains
 *   `mrs/assets/human`, `assets/human` (Docker layout), or
 *   `constitution/CHARTER.md`. Falls back to `process.cwd()`.
 * - Resolution order for `resolveHumanFacePath(name)`:
 *   1. `${OPERATOR_ASSETS_ROOT}/human/${name}.glb`
 *   2. `mrs/assets/human/${name}.glb` (fixture candidates from module location)
 */

import { existsSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

export type FaceAssetKind = "fixture" | "operator";

export interface ResolvedHumanFacePath {
  /** Absolute filesystem path to the GLB (may not exist if neither source present). */
  path: string;
  /** structure_record `face_asset` when this path is used. */
  face_asset: FaceAssetKind;
  /** Logical basename without extension, e.g. `HumanFaceRigged`. */
  logicalName: string;
}

/** Strip optional `.glb`; keep `HumanFaceNeutral` / `HumanFaceRigged` style names. */
export function normalizeHumanFaceName(name: string): string {
  const base = name.replace(/\.glb$/i, "").trim();
  if (!base) throw new Error("face asset name is empty");
  return base;
}

function walkUpForMarker(
  start: string,
  isRoot: (dir: string) => boolean,
): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 16; i++) {
    if (isRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Stable base for relative `OPERATOR_ASSETS_ROOT` / `./operator-assets`.
 * Prefer repo/Docker install root over the caller's cwd.
 */
export function resolveOperatorAssetsBaseDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const found = walkUpForMarker(here, (dir) => {
    return (
      existsSync(join(dir, "mrs", "assets", "human")) ||
      existsSync(join(dir, "assets", "human")) ||
      existsSync(join(dir, "constitution", "CHARTER.md"))
    );
  });
  return found ?? process.cwd();
}

/**
 * Operator assets root directory (contains `human/` drop-in GLBs).
 */
export function getOperatorAssetsRoot(): string {
  const raw = process.env.OPERATOR_ASSETS_ROOT?.trim() || "./operator-assets";
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(resolveOperatorAssetsBaseDir(), raw);
}

function isPathUnderDir(filePath: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(filePath));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Fixture candidate paths for a logical face name (module-relative). */
export function listFixtureHumanGlbCandidates(logicalName: string): string[] {
  const file = `${logicalName}.glb`;
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    // dist/src/face → mrs/assets (5 up)
    join(here, "..", "..", "..", "..", "..", "assets", "human", file),
    // src/face → mrs/assets (4 up) OR dist/src/face → /app/assets in Docker
    join(here, "..", "..", "..", "..", "assets", "human", file),
    // package-local assets fallback
    join(here, "..", "..", "..", "assets", "human", file),
  ];
}

export function resolveFixtureHumanFacePath(logicalName: string): string {
  const candidates = listFixtureHumanGlbCandidates(logicalName);
  for (const path of candidates) {
    if (existsSync(path)) return resolve(path);
  }
  return resolve(candidates[0]!);
}

/**
 * Prefer operator drop-in GLB over in-repo fixture.
 * Names may include or omit `.glb`.
 */
export function resolveHumanFacePath(name: string): ResolvedHumanFacePath {
  const logicalName = normalizeHumanFaceName(name);
  const file = `${logicalName}.glb`;
  const operatorPath = resolve(join(getOperatorAssetsRoot(), "human", file));
  if (existsSync(operatorPath)) {
    return { path: operatorPath, face_asset: "operator", logicalName };
  }
  const fixturePath = resolveFixtureHumanFacePath(logicalName);
  return { path: fixturePath, face_asset: "fixture", logicalName };
}

/**
 * Classify a resolved mesh path for structure_record / LoadedFaceRig.assetKind.
 * Paths under the active operator root (or `operator-assets/human/`) → operator;
 * paths matching in-repo / Docker `assets/human/HumanFace*` → fixture;
 * otherwise treat as operator (explicit external path).
 */
export function detectFaceAssetKind(meshPath: string): FaceAssetKind {
  const absolute = resolve(meshPath);
  const opHuman = join(getOperatorAssetsRoot(), "human");
  if (isPathUnderDir(absolute, opHuman) || absolute === resolve(opHuman)) {
    return "operator";
  }
  if (/[/\\]operator-assets[/\\]human[/\\]/i.test(meshPath)) return "operator";
  if (/[/\\]assets[/\\]human[/\\]HumanFace/i.test(meshPath)) return "fixture";
  return "operator";
}

/** Default rigged face path (operator override if present, else fixture). */
export function defaultFaceRiggedGlbPath(): string {
  return resolveHumanFacePath("HumanFaceRigged").path;
}

/** Default neutral face path (operator override if present, else fixture). */
export function defaultFaceNeutralGlbPath(): string {
  return resolveHumanFacePath("HumanFaceNeutral").path;
}
