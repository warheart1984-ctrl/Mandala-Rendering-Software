#!/usr/bin/env node
/**
 * Governance test runner — structured output for CI.
 * Usage: node scripts/test-governance.mjs [--json]
 */
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const testDir = join(root, "..", "engine", "governance", "test");
const json = process.argv.includes("--json");

const files = readdirSync(testDir).filter((f) => f.endsWith(".test.js")).map((f) => join(testDir, f));

if (files.length === 0) {
  console.error("No governance test files found");
  process.exit(1);
}

const args = ["--test", ...files];
if (json) args.push("--test-reporter", "spec");

const child = spawn("node", args, { stdio: "inherit", cwd: join(root, "..") });
child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
