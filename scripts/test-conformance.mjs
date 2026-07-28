/**
 * Conformance smoke test — validates the browser runtime against the
 * canonical conformance profile entirely from Node (no browser needed).
 *
 * Usage:  node --experimental-vm-modules scripts/test-conformance.mjs
 *         (or just:  node scripts/test-conformance.mjs  on Node ≥ 22)
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function importFromRoot(relativePath) {
  return import(pathToFileURL(resolve(root, relativePath)).href);
}

// ── stub fetch so CKL.loadDefault works in Node ───────────────────
async function stubFetch(url) {
  const href = (typeof url === "string" ? url : String(url)).trim();
  let filePath;
  try {
    // Normalize: URL() constructor handles platform-specific quirks
    filePath = fileURLToPath(new URL(href));
  } catch {
    // Fallback: treat as relative path
    filePath = resolve(root, href.replace(/^file:\/*/i, ""));
  }
  const text = await readFile(filePath, "utf-8");
  return { ok: true, json: async () => JSON.parse(text) };
}

// ── imports ───────────────────────────────────────────────────────
const { evaluateConformance, formatReport } = await importFromRoot(
  "engine/conformance/ConformanceChecker.js",
);
const { createBrowserAdapter } = await importFromRoot(
  "engine/conformance/BrowserRuntimeAdapter.js",
);

const profileText = await readFile(
  resolve(root, "engine/conformance/default.conformance-profile.json"),
  "utf-8",
);
const profile = JSON.parse(profileText);

// ── run ───────────────────────────────────────────────────────────
console.log("Loading browser runtime adapter…");
const adapter = await createBrowserAdapter(stubFetch);

console.log("Evaluating conformance profile…\n");
const report = await evaluateConformance("browser", profile, adapter);

console.log(formatReport(report));

// ── exit code ─────────────────────────────────────────────────────
if (!report.compliant) {
  console.error(`\n❌ ${report.failed} check(s) failed.`);
  process.exit(1);
}

console.log("\n✅ Browser runtime is fully compliant.");
process.exit(0);
