#!/usr/bin/env node
/**
 * Verify all package.json files declare "type": "module".
 * Usage: node scripts/check-package-types.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IGNORE = new Set(["node_modules", ".git", "dist", "build", "output", "vendor"]);

function findPackageJsons(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...findPackageJsons(full));
    } else if (entry === "package.json") {
      results.push(full);
    }
  }
  return results;
}

const files = findPackageJsons(ROOT);
let missing = 0;

for (const file of files) {
  try {
    const pkg = JSON.parse(readFileSync(file, "utf-8"));
    if (pkg.private) continue;
    if (pkg.type !== "module") {
      console.log(`  MISSING "type: module" — ${path.relative(ROOT, file)}`);
      missing++;
    }
  } catch {
    console.error(`  PARSE ERROR — ${path.relative(ROOT, file)}`);
    missing++;
  }
}

if (missing === 0) {
  console.log(`All ${files.length} package.json files have "type": "module"`);
} else {
  console.log(`${missing}/${files.length} packages missing "type": "module"`);
  process.exitCode = 1;
}
