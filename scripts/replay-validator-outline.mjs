#!/usr/bin/env node
/**
 * Deterministic replay validator OUTLINE — skeleton / declared.
 * Does not run a full engine T(); wires conceptually to CSSV + provenance.
 *
 * Usage: node scripts/replay-validator-outline.mjs [--ledger cssv/]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const ledgerDir = process.argv.includes("--ledger")
  ? process.argv[process.argv.indexOf("--ledger") + 1]
  : join(root, "cssv");

console.log("[replay-validator-outline] status=skeleton/declared");
console.log("[replay-validator-outline] ledgerDir=", ledgerDir);

const artifacts = join(ledgerDir, "artifacts.json");
if (existsSync(artifacts)) {
  try {
    const j = JSON.parse(readFileSync(artifacts, "utf8"));
    console.log("[replay-validator-outline] artifacts keys:", Object.keys(j));
  } catch (e) {
    console.warn("[replay-validator-outline] artifacts unreadable:", e.message);
  }
} else {
  console.log("[replay-validator-outline] no artifacts.json yet (ok for outline)");
}

console.log(`
Outline steps (not automated here):
  1. Parse frames.ndjson / transitions.ndjson as {u_n}
  2. Reset S0 from world JSON + seed
  3. For n in 0..N-1: S = T(S, u_n) with fixed dt
  4. Hash selected fields; compare to recorded provenance
  5. Exit non-zero on drift > epsilon

Wire points:
  - engine/runtime/ReplayService.*
  - engine/runtime/ProvenanceRecorder.*
  - unity LiveLink lastFrame/lastSeed
`);

process.exit(0);
