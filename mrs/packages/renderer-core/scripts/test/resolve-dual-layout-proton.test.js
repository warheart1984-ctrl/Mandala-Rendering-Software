/**
 * Dual-layout proton path resolution tests (monorepo + simulated Docker flatten).
 *
 * STATUS: **enforced** for candidate picking; does not run Docker.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import {
  firstExistingPath,
  resolveMintCirPath,
  resolveProtonIndexPath,
  resolveEncodePngPath,
} from "../lib/resolveDualLayout.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..");
const REPO_MRS = resolve(SCRIPTS, "..", "..", ".."); // .../mrs
const MONOREPO_MINT = resolve(REPO_MRS, "adapters", "proton-raster-bridge", "mintCir.js");
const MONOREPO_INDEX = resolve(SCRIPTS, "..", "src", "render", "rt4d", "proton", "index.js");
const MONOREPO_ENCODE = resolve(SCRIPTS, "render-still.mjs");

assert.ok(existsSync(MONOREPO_MINT), `monorepo mintCir missing: ${MONOREPO_MINT}`);
assert.ok(existsSync(MONOREPO_INDEX), `monorepo proton index missing: ${MONOREPO_INDEX}`);
assert.ok(existsSync(MONOREPO_ENCODE), `monorepo render-still missing: ${MONOREPO_ENCODE}`);

// Monorepo: from renderer-core/scripts
{
  const mint = resolveMintCirPath(SCRIPTS);
  assert.equal(resolve(mint), resolve(MONOREPO_MINT));
  const idx = resolveProtonIndexPath(SCRIPTS);
  assert.equal(resolve(idx), resolve(MONOREPO_INDEX));
  const enc = resolveEncodePngPath(SCRIPTS);
  assert.equal(resolve(enc), resolve(MONOREPO_ENCODE));
}

// Simulated Docker flatten under a temp /app-like tree
{
  const root = join(tmpdir(), `mrs-proton-layout-${process.pid}`);
  const scriptsDir = join(root, "renderer-core", "scripts");
  const bridgeDir = join(root, "proton-raster-bridge");
  const protonSrc = join(root, "renderer-core", "src", "render", "rt4d", "proton");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(bridgeDir, { recursive: true });
  mkdirSync(protonSrc, { recursive: true });
  writeFileSync(join(bridgeDir, "mintCir.js"), "export function mintCir(){return{}};\n");
  writeFileSync(join(protonSrc, "index.js"), "export const PROTON_MODULE_STATUS='test';\n");
  writeFileSync(
    join(scriptsDir, "render-still.mjs"),
    "export function encodePNG(){return Buffer.alloc(0)}\n",
  );

  const badMono = join(scriptsDir, "../../../adapters/proton-raster-bridge/mintCir.js");
  assert.equal(existsSync(badMono), false, "simulated docker must lack monorepo adapters path");

  const mint = resolveMintCirPath(scriptsDir);
  assert.equal(resolve(mint), resolve(join(bridgeDir, "mintCir.js")));

  const idx = resolveProtonIndexPath(scriptsDir);
  assert.equal(resolve(idx), resolve(join(protonSrc, "index.js")));

  const enc = resolveEncodePngPath(scriptsDir);
  assert.equal(resolve(enc), resolve(join(scriptsDir, "render-still.mjs")));

  // Bridge-side resolution (adapter cwd) against the same flatten tree
  const bridgeHelperUrl = pathToFileURL(
    resolve(REPO_MRS, "adapters", "proton-raster-bridge", "resolveDualLayout.mjs"),
  ).href;
  const bridge = await import(bridgeHelperUrl);
  const bridgeIdx = bridge.resolveProtonIndexPath(bridgeDir);
  assert.equal(resolve(bridgeIdx), resolve(join(protonSrc, "index.js")));
  const bridgeEnc = bridge.resolveEncodePngPath(bridgeDir);
  assert.equal(resolve(bridgeEnc), resolve(join(scriptsDir, "render-still.mjs")));

  rmSync(root, { recursive: true, force: true });
}

assert.equal(resolve(firstExistingPath("/no/such/a", MONOREPO_ENCODE)), resolve(MONOREPO_ENCODE));
assert.equal(firstExistingPath("/no/such"), null);

// ENV override wins
{
  process.env.PROTON_MINTCIR_SCRIPT = MONOREPO_MINT;
  assert.equal(resolve(resolveMintCirPath("/nonexistent/dir")), resolve(MONOREPO_MINT));
  delete process.env.PROTON_MINTCIR_SCRIPT;
}

console.log("resolve-dual-layout-proton.test.js: PASS");
