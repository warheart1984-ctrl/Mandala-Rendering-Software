#!/usr/bin/env node
/**
 * Bump release.json + aligned package.json versions.
 *
 * Usage:
 *   node scripts/release-version.mjs <major|minor|patch> [--sync-charter] [--dry-run]
 *
 * Does NOT git commit / tag / push. Operator tags separately after release:check.
 * Charter sync requires --sync-charter (protected path — explicit only).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bumpType = args.find((a) => !a.startsWith("--")) || "patch";
const syncCharter = args.includes("--sync-charter");
const dryRun = args.includes("--dry-run");
const valid = new Set(["major", "minor", "patch"]);

if (!valid.has(bumpType)) {
  console.error(
    "Usage: node scripts/release-version.mjs <major|minor|patch> [--sync-charter] [--dry-run]",
  );
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(readFileSync(resolve(root, p), "utf8"));
}

function writeJson(p, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  if (dryRun) {
    console.log(`[dry-run] would write ${p}`);
    return;
  }
  writeFileSync(resolve(root, p), text, "utf8");
}

const release = readJson("release.json");
const current = release.version;
const parts = current.split(".").map(Number);
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  console.error(`Invalid release.json version: ${current}`);
  process.exit(1);
}
if (bumpType === "major") {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (bumpType === "minor") {
  parts[1]++;
  parts[2] = 0;
} else {
  parts[2]++;
}
const next = parts.join(".");

release.version = next;
release.rendererCoreVersion = next;
release.engine3dCoreVersion = next;
release.dateReleased = new Date().toISOString().split("T")[0];
writeJson("release.json", release);

const rootPkg = readJson("package.json");
writeJson("package.json", { ...rootPkg, version: next });

const rcpkg = readJson("mrs/packages/renderer-core/package.json");
writeJson("mrs/packages/renderer-core/package.json", { ...rcpkg, version: next });

const e3pkg = readJson("mrs/packages/engine3d-core/package.json");
writeJson("mrs/packages/engine3d-core/package.json", { ...e3pkg, version: next });

if (syncCharter) {
  const charterPath = resolve(root, "engine/constitution/charter.js");
  const charter = readFileSync(charterPath, "utf8");
  const updated = charter.replace(/version:\s*"[^"]+"/, `version: "${next}"`);
  if (updated === charter) {
    console.error("Failed to locate version field in charter.js");
    process.exit(1);
  }
  if (dryRun) {
    console.log("[dry-run] would sync engine/constitution/charter.js");
  } else {
    writeFileSync(charterPath, updated, "utf8");
  }
} else {
  console.log(
    "Note: charter.js not modified (pass --sync-charter to align CHARTER.version).",
  );
}

console.log(`${dryRun ? "[dry-run] " : ""}bump ${current} → ${next} (${bumpType})`);
console.log("Next: npm run release:check");
console.log("Then (operator): git tag v" + next + " && git push --follow-tags");
