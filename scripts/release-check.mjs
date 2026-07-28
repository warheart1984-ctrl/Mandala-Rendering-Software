#!/usr/bin/env node
/**
 * release:check — fail if version sources disagree.
 * Read-only. Does not edit charter.js or commit.
 *
 * Sources of truth (see docs/governance/RELEASE_VERSIONING.md):
 *   - release.json                 product release version
 *   - package.json                 root npm version (must match release.json)
 *   - mrs/packages/renderer-core   rendererCoreVersion (or package version)
 *   - mrs/packages/engine3d-core   engine3dCoreVersion (or package version)
 *   - engine/constitution/charter.js CHARTER.version (must match unless --allow-charter-drift)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowCharterDrift = process.argv.includes("--allow-charter-drift");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function charterVersion() {
  const text = readFileSync(resolve(root, "engine/constitution/charter.js"), "utf8");
  const m = text.match(/version:\s*"([^"]+)"/);
  if (!m) throw new Error("Could not parse CHARTER.version from charter.js");
  return m[1];
}

const release = readJson("release.json");
const rootPkg = readJson("package.json");
const rendererPkg = readJson("mrs/packages/renderer-core/package.json");
const engine3dPkg = readJson("mrs/packages/engine3d-core/package.json");
const charterVer = charterVersion();

const expected = release.version;
const rows = [
  { id: "release.json", version: release.version },
  { id: "package.json", version: rootPkg.version },
  {
    id: "release.rendererCoreVersion",
    version: release.rendererCoreVersion ?? release.version,
  },
  { id: "renderer-core/package.json", version: rendererPkg.version },
  {
    id: "release.engine3dCoreVersion",
    version: release.engine3dCoreVersion ?? release.version,
  },
  { id: "engine3d-core/package.json", version: engine3dPkg.version },
  { id: "charter.js CHARTER.version", version: charterVer, charter: true },
];

const mismatches = [];
for (const row of rows) {
  if (row.charter && allowCharterDrift) continue;
  if (row.version !== expected) {
    mismatches.push({ ...row, expected });
  }
}

console.log("release:check");
console.log(`  expected (release.json): ${expected}`);
for (const row of rows) {
  const ok = row.version === expected || (row.charter && allowCharterDrift);
  const mark = ok ? "ok" : "MISMATCH";
  const note = row.charter && allowCharterDrift ? " (charter drift allowed)" : "";
  console.log(`  [${mark}] ${row.id} = ${row.version}${note}`);
}

if (mismatches.length) {
  console.error(`\nrelease:check FAILED — ${mismatches.length} mismatch(es).`);
  console.error("See docs/governance/RELEASE_VERSIONING.md");
  process.exit(1);
}

console.log("\nrelease:check PASSED");
process.exit(0);
