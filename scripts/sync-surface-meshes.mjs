#!/usr/bin/env node
/**
 * Sync surface meshes from canonical source to Unity/Unreal hosts.
 * Canonical source: engine/surfaces/meshes/ (produced by export-surface-meshes.mjs)
 *
 * Usage:
 *   node scripts/sync-surface-meshes.mjs                  # sync both
 *   node scripts/sync-surface-meshes.mjs --target unity    # unity only
 *   node scripts/sync-surface-meshes.mjs --target unreal   # unreal only
 *   node scripts/sync-surface-meshes.mjs --dry-run         # preview
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "engine/surfaces/meshes");

const targets = {
  unity: path.join(root, "unity/GovernedUnityProject/Assets/StreamingAssets/surfaces"),
  unreal: path.join(root, "unreal/GovernedEnginePlugin/Content/Surfaces"),
};

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verifyOnly = args.includes("--verify");
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : null;
const activeTargets = targetArg ? [targetArg] : ["unity", "unreal"];

function contentHash(str) {
  return createHash("sha256").update(str).digest("hex");
}

if (!existsSync(sourceDir)) {
  console.error(`✗ Source directory not found: ${sourceDir}`);
  console.error("  Run 'npm run export:surfaces' first to generate meshes.");
  process.exit(1);
}

const files = readdirSync(sourceDir).filter(
  (f) => f.endsWith(".mesh.json") || f === "index.json",
);

if (files.length === 0) {
  console.error("✗ No surface mesh files found in source directory.");
  process.exit(1);
}

let totalSynced = 0;
let totalUnchanged = 0;
let totalErrors = 0;

console.log(
  `Surface mesh ${verifyOnly ? "verify" : "sync"} — source: ${sourceDir}`,
);
console.log(
  `Targets: ${activeTargets.join(", ")}${dryRun ? " (DRY RUN)" : ""}${verifyOnly ? " (VERIFY)" : ""}`,
);
console.log(`Files: ${files.length}\n`);

const report = {
  ok: true,
  mode: verifyOnly ? "verify" : "sync",
  canonicalDir: sourceDir.replace(/\\/g, "/"),
  hosts: {},
};

for (const target of activeTargets) {
  const targetDir = targets[target];
  if (!targetDir) {
    console.error(`✗ Unknown target: ${target}`);
    totalErrors++;
    report.ok = false;
    continue;
  }

  if (!verifyOnly && !dryRun) {
    mkdirSync(targetDir, { recursive: true });
  }

  let synced = 0;
  let unchanged = 0;
  let errors = 0;
  const fileResults = {};

  for (const file of files) {
    const srcPath = path.join(sourceDir, file);
    const dstPath = path.join(targetDir, file);

    try {
      const srcContent = readFileSync(srcPath, "utf-8");
      const srcHash = contentHash(srcContent);

      if (existsSync(dstPath)) {
        const dstContent = readFileSync(dstPath, "utf-8");
        const dstHash = contentHash(dstContent);

        if (srcHash === dstHash) {
          unchanged++;
          fileResults[file] = { ok: true, sha256: srcHash };
          continue;
        }
        if (verifyOnly) {
          errors++;
          report.ok = false;
          fileResults[file] = {
            ok: false,
            reason: "sha_mismatch",
            sha256: dstHash,
            canonicalSha256: srcHash,
          };
          continue;
        }
      } else if (verifyOnly) {
        errors++;
        report.ok = false;
        fileResults[file] = { ok: false, reason: "missing" };
        continue;
      }

      // File is new or different
      if (!dryRun && !verifyOnly) {
        writeFileSync(dstPath, srcContent);
      }
      synced++;
      fileResults[file] = { ok: true, sha256: srcHash, synced: !verifyOnly };
    } catch (err) {
      console.error(`  ✗ ${target}/${file}: ${err.message}`);
      errors++;
      report.ok = false;
    }
  }

  report.hosts[target] = {
    path: targetDir.replace(/\\/g, "/"),
    matched: errors === 0,
    files: fileResults,
  };

  const status = errors > 0 ? "⚠" : "✓";
  console.log(
    `${status} ${target}: ${synced} synced, ${unchanged} unchanged${errors > 0 ? `, ${errors} errors` : ""}`,
  );

  totalSynced += synced;
  totalUnchanged += unchanged;
  totalErrors += errors;
}

console.log(`\nTotal: ${totalSynced} synced, ${totalUnchanged} unchanged, ${totalErrors} errors`);
if (dryRun) console.log("(dry run — no files were modified)");
if (verifyOnly) {
  console.log(JSON.stringify({ ok: report.ok, hosts: Object.keys(report.hosts) }));
}

process.exitCode = totalErrors > 0 || (verifyOnly && !report.ok) ? 1 : 0;
