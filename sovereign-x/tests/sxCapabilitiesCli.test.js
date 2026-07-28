/**
 * CLI edge-case tests for sx-capabilities (skeleton inspector).
 * STATUS: **partial** — exercises list/inspect/help/exit codes; no live GPU.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "cli", "sx-capabilities.js");

/**
 * @param {string[]} args
 */
function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: process.env,
  });
}

describe("sx-capabilities CLI", () => {
  it("list prints authoritative print + GPU assist skills", () => {
    const r = runCli(["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /cpu\.rt4d\.print \(authoritative\)/);
    assert.match(r.stdout, /gpu\.gen\.nvidia\.nim_flux/);
    assert.match(r.stdout, /gpu\.integrator\.deterministic/);
    assert.match(r.stdout, /gpu\.compute\.amd\.hip/);
  });

  it("inspect cpu.rt4d.print shows authoritative meta", () => {
    const r = runCli(["inspect", "cpu.rt4d.print"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Authority: authoritative/);
    assert.match(r.stdout, /capabilityClass: print/);
    assert.match(r.stdout, /vendor: cpu/);
  });

  it("inspect integrator shows assist + bans", () => {
    const r = runCli(["inspect", "gpu.integrator.deterministic"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Authority: assist/);
    assert.match(r.stdout, /status: declared/);
    assert.match(r.stdout, /bans:.*printSoT/);
  });

  it("inspect missing capability exits 1", () => {
    const r = runCli(["inspect", "gpu.does.not.exist"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Capability not found/);
  });

  it("inspect without capability id exits 1", () => {
    const r = runCli(["inspect"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage:.*inspect/);
  });

  it("unknown command exits 1 and prints help", () => {
    const r = runCli(["wat"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown command/);
    assert.match(`${r.stdout}${r.stderr}`, /Usage:/);
  });

  it("help exits 0", () => {
    const r = runCli(["help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Usage:/);
  });

  it("inspect-flux-image shows lookdev-from-image wiring", () => {
    const r = runCli(["inspect-flux-image"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Mode: lookdev-from-image/);
    assert.match(r.stdout, /gpu\.gen\.nvidia\.nim_flux/);
    assert.match(r.stdout, /handleFluxImageIngest/);
    assert.match(r.stdout, /never print SoT/);
  });
});
