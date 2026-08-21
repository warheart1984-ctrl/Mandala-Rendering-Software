#!/usr/bin/env node
/**
 * validate-glb.mjs — Post-export GLB validation via sovereign-sculptor inspectGlb + validateGlb.
 *
 * Usage: node validate-glb.mjs <glb-path> [--profile human|fox|anthro]
 *
 * Outputs JSON with { ok, inspection, issues } to stdout.
 * Exit 0 on success, exit 1 on validation failure.
 */

import { readFileSync } from "node:fs";
import { inspectGlb, validateGlb } from "../dist/src/glb.js";

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help") {
  console.error("Usage: node validate-glb.mjs <glb-path> [--profile human|fox|anthro]");
  process.exit(args[0] === "--help" ? 0 : 1);
}

const glbPath = args[0];
const profileIdx = args.indexOf("--profile");
const profile = profileIdx !== -1 ? args[profileIdx + 1] : undefined;

try {
  const glbBytes = readFileSync(glbPath);
  const options = {};
  if (profile && ["human", "fox", "anthro"].includes(profile)) {
    options.profile = profile;
  }
  const result = validateGlb(glbBytes, options);
  const output = {
    ok: result.ok,
    issues: result.issues,
    inspection: result.inspection
      ? {
          ok: result.inspection.ok,
          species: result.inspection.species,
          status: result.inspection.status,
          primitiveCount: result.inspection.primitives.length,
          boneCount: result.inspection.boneIds.length,
          materialCount: result.inspection.materialIds.length,
          digests: result.inspection.digests,
        }
      : undefined,
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.log(
    JSON.stringify(
      { ok: false, issues: [{ code: "validate-glb-error", message: error.message }] },
      null,
      2
    )
  );
  process.exit(1);
}
