/**
 * Sovereign X canonical router — contract + assist routing tests.
 * STATUS: contract rules partial (enforced in unit tests); GPU live declared.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadGpuSkillsRegistry,
  resolveCapability,
  route,
} from "../../../../sovereign-x/router/index.js";
import { validate } from "../../../../sovereign-x/router/contracts/gpuDispatchContract.js";
import { GpuAssistModule } from "../../../../sovereign-x/router/modules/gpu/gpuAssistModule.js";
import { LookDevEngine } from "../../../../sovereign-x/router/modules/gpu/assist/lookDevEngine.js";

const router = { route };

describe("gpuSkillsRegistry resolve", () => {
  it("maps NVIDIA/AMD capabilities to skill paths", () => {
    const reg = loadGpuSkillsRegistry({ reload: true });
    assert.equal(
      reg.skills["gpu.gen.nvidia.nim_flux"],
      "~/.agents/skills/nvidia-gpu-assist",
    );
    assert.equal(
      reg.skills["gpu.compute.amd.hip"],
      "~/.agents/skills/amd-gpu-assist",
    );
    const r = resolveCapability("gpu.inference.nvidia.tao");
    assert.equal(r.ok, true);
    assert.equal(r.authority, "assist");
  });

  it("cpu.rt4d.print is authoritative", () => {
    const r = resolveCapability("cpu.rt4d.print");
    assert.equal(r.ok, true);
    assert.equal(r.authority, "authoritative");
    assert.equal(r.capabilityClass, "print");
  });
});

describe("gpuDispatchContract.validate", () => {
  it("requires cpu.rt4d.print when determinismRequired", () => {
    assert.throws(() =>
      validate({
        determinismRequired: true,
        capabilityClass: "gen",
        backend: "gpu.gen.nvidia.nim_flux",
      }),
    );
    const ok = validate({
      determinismRequired: true,
      capabilityClass: "print",
      backend: "cpu.rt4d.print",
    });
    assert.equal(ok.backend, "cpu.rt4d.print");
  });

  it("marks gpu.* as assist", () => {
    const req = {
      determinismRequired: false,
      capabilityClass: "compute",
      backend: "gpu.compute.nvidia.cuda",
    };
    validate(req);
    assert.equal(req.authority, "assist");
  });
});

describe("GpuAssistModule handlers", () => {
  const mod = new GpuAssistModule(router);

  it("determinismRequired → cpu.rt4d.print", async () => {
    const r = await mod.handleLookDev({
      intentId: "d1",
      modality: "image",
      determinismRequired: true,
      vendorPreference: "nvidia",
    });
    assert.equal(r.capabilityId, "cpu.rt4d.print");
    assert.equal(r.authority, "authoritative");
  });

  it("GPU lookdev is assistOnly", async () => {
    const r = await mod.handleLookDev({
      intentId: "a1",
      modality: "image",
      determinismRequired: false,
      vendorPreference: "nvidia",
    });
    assert.equal(r.ok, true);
    assert.equal(r.assistOnly, true);
    assert.equal(r.authority, "assist");
    assert.equal(r.capabilityId, "gpu.gen.nvidia.nim_flux");
  });

  it("denies GPU as print SoT", async () => {
    const r = await route("gpu.compute.nvidia.cuda", { asPrintSoT: true });
    assert.equal(r.ok, false);
    // Safeguard fires before legacy GPU_PRINT_SOT_DENIED (same ban, earlier gate)
    assert.ok(
      r.code === "GPU_PRINT_SAFEGUARD" || r.code === "GPU_PRINT_SOT_DENIED",
      `unexpected code ${r.code}`,
    );
  });
});

describe("LookDevEngine skeleton", () => {
  it("returns assistOnly concept/enhanced/hints", async () => {
    const engine = new LookDevEngine(router);
    const out = await engine.run({
      intentId: "ld1",
      modality: "image",
      determinismRequired: false,
    });
    assert.equal(out.assistOnly, true);
    assert.ok(out.concept);
    assert.ok(out.enhanced);
    assert.ok(out.hints);
  });
});
