/**
 * Tests for bios.ai.npu lane — silicon-rooted verification, assist-only.
 * STATUS: **declared** — unit-enforced lane spec; hardware probe + stubs only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route, resolveCapability } from "../router/index.js";
import {
  CAPABILITY_ID,
  detectBiosAiNpu,
  quantizePbnGrid,
  verifyHop,
  capabilityCheck,
  predictThermalCpo,
  handleBiosAiLane,
} from "../router/modules/bios/biosAiLane.js";

describe("bios.ai.npu lane", () => {
  it("resolves from registry as assist verification bios", () => {
    const r = resolveCapability(CAPABILITY_ID);
    assert.equal(r.ok, true);
    assert.equal(r.authority, "assist");
    assert.equal(r.capabilityClass, "verification");
    assert.equal(r.vendor, "bios");
  });

  it("detects NPU when npuTops provided", async () => {
    const caps = await detectBiosAiNpu({ npuTops: 40, biosAiVersion: "2.1" });
    assert.ok(caps);
    assert.equal(caps.npuTops, 40);
    assert.equal(caps.assistOnly, true);
    assert.deepEqual(caps.bans, ["printSoT", "beautyPixels", "digitalPrinterEvidence"]);
    assert.ok(caps.canDo.includes("pbnGridQuantization"));
    assert.ok(caps.canDo.includes("verifyHop"));
    assert.ok(caps.canDo.includes("fanThermalPrediction"));
    assert.ok(caps.canDo.includes("vossBinding"));
  });

  it("returns null when no NPU detected", async () => {
    const caps = await detectBiosAiNpu({});
    assert.equal(caps, null);
  });

  it("PBN quantization produces 4x4 grid + 16-color key + sha256 hash", () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 128;
      rgba[i + 2] = 64;
    }
    const { grid, key, payloadHash } = quantizePbnGrid(rgba, width, height);
    assert.equal(grid.length, 4);
    assert.equal(grid[0].length, 4);
    assert.ok(key.length <= 16);
    assert.equal(payloadHash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(payloadHash));
  });

  it("PBN quantization is deterministic for same input", () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = i % 256;
      rgba[i + 1] = (i * 2) % 256;
      rgba[i + 2] = (i * 3) % 256;
    }
    const r1 = quantizePbnGrid(rgba, width, height);
    const r2 = quantizePbnGrid(rgba, width, height);
    assert.equal(r1.payloadHash, r2.payloadHash);
    assert.deepEqual(r1.grid, r2.grid);
    assert.deepEqual(r1.key, r2.key);
  });

  it("verifyHop validates payload hash, signature, public key lengths", () => {
    const ok = verifyHop("a".repeat(64), "b".repeat(128), "c".repeat(64));
    assert.equal(ok, true);
    const bad = verifyHop("short", "b".repeat(128), "c".repeat(64));
    assert.equal(bad, false);
  });

  it("capabilityCheck returns lane capabilities with bans", () => {
    const caps = { npuTops: 20, canDo: ["hashPayload"], bans: ["printSoT", "beautyPixels"] };
    const check = capabilityCheck(caps);
    assert.equal(check.ok, true);
    assert.equal(check.capabilityId, CAPABILITY_ID);
    assert.equal(check.assistOnly, true);
    assert.ok(check.bans.includes("printSoT"));
    assert.ok(check.bans.includes("beautyPixels"));
  });

  it("thermal prediction returns hopLimit adjustment for high throttle risk", () => {
    const prediction = predictThermalCpo(
      { currentTempC: 78, targetTempC: 80, fanRpm: 2000, powerWatts: 35 },
      { npuTops: 20 }
    );
    assert.ok(prediction.hopLimit <= 4);
    assert.ok(["low", "high"].includes(prediction.throttleRisk));
    assert.ok(typeof prediction.throttleScore === "number");
  });

  it("thermal prediction returns nominal hopLimit when cool", () => {
    const prediction = predictThermalCpo(
      { currentTempC: 40, targetTempC: 80, fanRpm: 800, powerWatts: 10 },
      { npuTops: 40 }
    );
    assert.equal(prediction.hopLimit, 8);
    assert.equal(prediction.throttleRisk, "none");
  });

  it("handleBiosAiLane denies without intentId", async () => {
    const r = await handleBiosAiLane({ mode: "capability-check", platformInfo: { npuTops: 10 } });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GOVERNANCE_INTENT_REQUIRED");
    assert.equal(r.assistOnly, true);
  });

  it("handleBiosAiLane denies when NPU not available", async () => {
    const r = await handleBiosAiLane({
      intentId: "test-1",
      mode: "capability-check",
      platformInfo: {},
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "NPU_NOT_AVAILABLE");
  });

  it("handleBiosAiLane capability-check returns caps with audit", async () => {
    const r = await handleBiosAiLane({
      intentId: "test-cap-1",
      mode: "capability-check",
      platformInfo: { npuTops: 30, biosAiVersion: "1.0" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.capabilityId, CAPABILITY_ID);
    assert.equal(r.authority, "assist");
    assert.equal(r.assistOnly, true);
    assert.equal(r.mode, "capability-check");
    assert.ok(r.audit);
    assert.equal(r.audit.intentId, "test-cap-1");
    assert.equal(r.audit.lane, CAPABILITY_ID);
  });

  it("handleBiosAiLane pbn-quantize returns grid + key + hash", async () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 200;
      rgba[i + 1] = 100;
      rgba[i + 2] = 50;
    }
    const r = await handleBiosAiLane({
      intentId: "test-pbn-1",
      mode: "pbn-quantize",
      payload: { rgba, width, height },
      platformInfo: { npuTops: 15 },
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "pbn-quantize");
    assert.ok(r.grid);
    assert.ok(r.key);
    assert.equal(r.payloadHash.length, 64);
    assert.ok(r.audit);
  });

  it("handleBiosAiLane verify-hop validates signature", async () => {
    const r = await handleBiosAiLane({
      intentId: "test-hop-1",
      mode: "verify-hop",
      payload: {
        payloadHash: "a".repeat(64),
        signature: "b".repeat(128),
        publicKey: "c".repeat(64),
      },
      platformInfo: { npuTops: 10 },
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "verify-hop");
    assert.equal(r.verified, true);
  });

  it("handleBiosAiLane thermal-cpo returns hopLimit prediction", async () => {
    const r = await handleBiosAiLane({
      intentId: "test-thermal-1",
      mode: "thermal-cpo",
      thermalTelemetry: { currentTempC: 50, targetTempC: 85, fanRpm: 1000, powerWatts: 12 },
      platformInfo: { npuTops: 25 },
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "thermal-cpo");
    assert.ok(typeof r.hopLimit === "number");
    assert.ok(["none", "low", "high"].includes(r.throttleRisk));
  });

  it("route() integrates bios.ai.npu with telemetry", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "route-test-1",
      determinismRequired: false,
      mode: "capability-check",
      platformInfo: { npuTops: 12, biosAiVersion: "2.0" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.capabilityId, CAPABILITY_ID);
    assert.equal(r.assistOnly, true);
    assert.equal(r.authority, "assist");
    assert.ok(r.workloadClass);
    assert.ok(r.recommendedPlacement);
  });

  it("route() denies print SoT for bios.ai.npu", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "sot-test",
      asPrintSoT: true,
      platformInfo: { npuTops: 10 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.assistOnly, true);
  });

  it("route() redirects determinismRequired for bios.ai.npu to cpu.rt4d.print", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "det-test",
      determinismRequired: true,
      platformInfo: { npuTops: 10 },
    });
    assert.equal(r.ok, true);
    assert.equal(r.capabilityId, "cpu.rt4d.print");
    assert.equal(r.authority, "authoritative");
    assert.equal(r.assistOnly, false);
  });

  it("route() denies unknown mode", async () => {
    const r = await route(CAPABILITY_ID, {
      intentId: "mode-test",
      mode: "beauty-render",
      platformInfo: { npuTops: 10 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "UNKNOWN_MODE");
    assert.ok(r.message.includes("beauty-render"));
  });


  it("AMD legacy profile detects FX-8350 + RX 580 without inventing NPU", async () => {
    const caps = await detectBiosAiNpu({
      amdLegacy: true,
      cpuModel: "FX-8350",
      gpuModel: "RX 580",
    });
    assert.ok(caps);
    assert.equal(caps.amdLegacy, true);
    assert.equal(caps.npuTops, 0);
    assert.equal(caps.npu_boost_class, "none");
    assert.equal(caps.rocm, false);
    assert.equal(caps.compute, "vulkan");
    assert.ok(caps.bans.includes("firmware_write"));
    assert.ok(caps.canDo.includes("amulTopologyDensify"));
  });

  it("AMD eco_conservative AMUL densify does not spuriously throttle under 80C", () => {
    const prediction = predictThermalCpo(
      {
        currentTempC: 62,
        cpuTempC: 62,
        gpuTempC: 58,
        workload: "amul_topology",
        amulDensify: true,
        powerWatts: 90,
      },
      {
        amdLegacy: true,
        thermalModel: "amd_legacy_fx8350_rx580",
        npuTops: 0,
        workload: "amul_topology",
      },
    );
    assert.equal(prediction.throttleRisk, "none");
    assert.ok(prediction.hopLimit >= 6, `hopLimit=${prediction.hopLimit}`);
    assert.equal(prediction.pbnGridSize, 32);
    assert.match(prediction.reason, /amul_densify/);
  });

  it("replay-parity: fox and humanoid share topology_hash; material_key differs", async () => {
    const r = await handleBiosAiLane({
      intentId: "replay-1",
      mode: "replay-parity",
      payload: { density: "amul" },
      platformInfo: { amdLegacy: true },
    });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "replay-parity");
    assert.equal(r.replayParity.checks.topology_hash_equal, true);
    assert.equal(r.replayParity.checks.body_payload_hash_equal, true);
    assert.equal(r.replayParity.checks.material_key_differs, true);
    assert.equal(r.replayParity.enforcement.topology_hash, "enforced");
    assert.equal(r.replayParity.enforcement.isa_bridge_ops, "enforced");
  });

});
