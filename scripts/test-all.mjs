/**
 * Run all Node smoke tests. Exits non-zero on first failure.
 * Usage: npm test
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

const suites = [
  { name: "init-cssv", script: "scripts/init-cssv-ledger.mjs" },
  { name: "4d-renderer", script: "scripts/test-4d-renderer.mjs" },
  { name: "visual-regression", script: "scripts/test-visual-regression.mjs" },
  { name: "solid-play", script: "scripts/test-host-solid-play.mjs" },
  { name: "bvh4d-gpu", script: "scripts/test-bvh4d-gpu.mjs" },
  { name: "inspector4d", script: "scripts/test-inspector4d.mjs" },
  { name: "conformance", script: "scripts/test-conformance.mjs" },
  { name: "host-probes", script: "scripts/verify-host-probes.mjs" },
  { name: "movie-pipelines", script: "scripts/verify-movie-pipelines.mjs" },
  { name: "cql", script: "scripts/test-cql.mjs" },
  { name: "ckl-ascension", script: "scripts/test-ascension-ckl.mjs" },
];

let failed = 0;

for (const suite of suites) {
  process.stdout.write(`\n▶ ${suite.name}…\n`);
  const result = spawnSync(node, [path.join(root, suite.script)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`✗ ${suite.name} failed (exit ${result.status})`);
    failed++;
  } else {
    console.log(`✓ ${suite.name} passed`);
  }
}

if (failed) {
  console.error(`\n${failed} suite(s) failed.`);
  process.exit(1);
}

console.log("\n✅ All smoke tests passed.");
process.exit(0);
