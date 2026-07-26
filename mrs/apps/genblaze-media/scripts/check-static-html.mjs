#!/usr/bin/env node
// Sanity-check the inline <script> of the Genblaze static UI.
//
// Guards the regression class fixed in PR #46: merge debris (conflict markers,
// a duplicated setStatus/handler) made the inline script fail to parse, so the
// submit listener was never registered and Generate fell back to a plain GET
// instead of POST /api/generate.
//
// Usage: node scripts/check-static-html.mjs [file.html ...]
//   defaults to app/static/index.html
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (!files.length) files.push(path.join(here, "..", "app", "static", "index.html"));

const REQUIRED_ONCE = [
  ["setStatus definition", /function\s+setStatus\s*\(/g],
  ["gen-form submit listener", /getElementById\("gen-form"\)\.addEventListener\(\s*"submit"/g],
  ["POST to /api/generate", /fetch\("\/api\/generate"/g],
];

let failed = false;

for (const file of files) {
  const html = readFileSync(file, "utf8");

  const markers = html.match(/^(<{7}|={7}|>{7})[^\n]*$/gm) || [];
  if (markers.length) {
    failed = true;
    console.error(`FAIL ${file}: git conflict markers present: ${markers.join(", ")}`);
  }

  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) {
    failed = true;
    console.error(`FAIL ${file}: no inline <script> block found`);
  }

  blocks.forEach((match, i) => {
    const src = match[1];
    const line = html.slice(0, match.index).split("\n").length;
    try {
      new vm.Script(src, { filename: `${file}#script[${i}]` });
      console.log(`ok   ${file} script[${i}] (line ${line}) parses`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${file} script[${i}] (line ${line}): ${err.message}`);
    }
  });

  const scriptSrc = blocks.map((m) => m[1]).join("\n");
  for (const [label, re] of REQUIRED_ONCE) {
    const n = (scriptSrc.match(re) || []).length;
    if (n === 1) continue;
    failed = true;
    console.error(`FAIL ${file}: expected exactly 1 ${label}, found ${n}`);
  }
}

process.exit(failed ? 1 : 0);
