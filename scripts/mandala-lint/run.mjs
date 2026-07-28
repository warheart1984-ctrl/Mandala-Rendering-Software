#!/usr/bin/env node
/**
 * Deprecated thin wrapper — canonical linter is mandala-agent-pack/lint.
 * Kept so old docs/CI snippets still resolve.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(root, "mandala-agent-pack/lint/run-lint.js");
console.warn(
  "[deprecated] scripts/mandala-lint → use mandala-agent-pack/lint/run-lint.js",
);
const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
