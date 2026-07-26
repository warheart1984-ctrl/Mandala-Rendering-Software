#!/usr/bin/env node
/**
 * validate-scene-spec.mjs — Node SoT for SceneSpecification capability checks.
 *
 * Reads JSON from --spec <path> (or stdin). Prints one JSON line:
 *   { "ok": true, "value": <parsed> } | { "ok": false, "errors": [...] }
 *
 * Used by Genblaze image_to_scene so Python does not invent a parallel validator.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

import { validateSceneCapabilities } from "../src/scene-spec/index.js";

function parseArgs(argv) {
  const out = { spec: null, target: "rt4d", stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec" && argv[i + 1]) {
      out.spec = argv[++i];
    } else if (a === "--target" && argv[i + 1]) {
      out.target = argv[++i];
    } else if (a === "--stdin") {
      out.stdin = true;
    }
  }
  return out;
}

function readPayload(opts) {
  if (opts.spec) {
    return readFileSync(opts.spec, "utf8");
  }
  if (opts.stdin || !process.stdin.isTTY) {
    return readFileSync(0, "utf8");
  }
  throw new Error("provide --spec <path.json> or pipe JSON on stdin");
}

const opts = parseArgs(process.argv.slice(2));
let raw;
try {
  raw = readPayload(opts);
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      errors: [{ path: "", message: String(err?.message || err) }],
    }) + "\n",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      errors: [{ path: "", message: `invalid JSON: ${err?.message || err}` }],
    }) + "\n",
  );
  process.exit(1);
}

const result = validateSceneCapabilities(parsed, { target: opts.target });
process.stdout.write(JSON.stringify(result) + "\n");
process.exit(result.ok ? 0 : 1);
