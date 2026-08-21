#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "mandala/engine/test/scenegraph.test.js",
  "mandala/engine/test/physics.test.js",
  "mandala/engine/test/materials.test.js",
  "mandala/engine/test/aais-abi.test.js",
  "mandala/engine/test/painter.test.js",
  "mandala/engine/test/mythar.test.js",
  "mandala/engine/test/editor.test.js",
  "mandala/engine/test/sdk.test.js",
  "mandala/engine/test/chamber-solver.test.js",
  "mandala/engine/test/gpu-queue.test.js",
  "mandala/engine/test/hamiltonian.test.js",
  "mandala/engine/test/e2e.test.js",
  "mandala/proto/test/four-proofs.test.js",
];
const r = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
