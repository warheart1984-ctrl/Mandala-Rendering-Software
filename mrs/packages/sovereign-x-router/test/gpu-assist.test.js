/**
 * GPU assist module + GpuDispatchContract tests.
 * STATUS: contract rules **enforced** in these unit tests; LookDev engine **declared**.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import {
  clearRegistryCache,
  CONTRACT_CODES,
  DISPATCH_CODES,
  dispatchVendorCapability,
  getCapability,
  listCanonicalCapabilityClasses,
  planLookDevPipeline,
  resolveAssistBinding,
  resolveCapabilityId,
  routeEmbeddings,
  routeLookDev,
  routeSceneSpecAssist,
  validateGpuDispatchContract,
} from "../src/index.js";

const BASE = {
  intentId: "intent-gpu-assist-1",
  modality: "image",
  determinismRequired: false,
  vendorPreference: "auto",
};

describe("Capability map aliases (§A)", () => {
  before(() => clearRegistryCache());

  it("maps gpu.gen.nvidia.nim_flux ↔ ai.gen.nvidia.flux", () => {
    assert.equal(resolveCapabilityId("gpu.gen.nvidia.nim_flux"), "ai.gen.nvidia.flux");
    assert.equal(resolveCapabilityId("ai.gen.nvidia.flux"), "ai.gen.nvidia.flux");
    const viaAlias = getCapability("gpu.gen.nvidia.nim_flux");
    const viaPrior = getCapability("ai.gen.nvidia.flux");
    assert.ok(viaAlias);
    assert.equal(viaAlias.id, "ai.gen.nvidia.flux");
    assert.equal(viaPrior.id, viaAlias.id);
  });

  it("lists user SoT canonical capability classes", () => {
    const classes = listCanonicalCapabilityClasses();
    for (const id of [
      "gpu.inference.nvidia.tao",
      "gpu.compute.nvidia.cuda",
      "gpu.gen.nvidia.nim_flux",
      "gpu.inference.amd.rocm",
      "gpu.compute.amd.hip",
    ]) {
      assert.ok(classes.includes(id), id);
    }
  });

  it("dispatches alias id as upstream allow", () => {
    const r = dispatchVendorCapability("gpu.gen.nvidia.nim_flux", {
      intentLane: "lookdev",
    });
    assert.equal(r.ok, true);
    assert.equal(r.code, DISPATCH_CODES.ALLOWED_UPSTREAM);
  });
});

describe("GpuDispatchContract validation", () => {
  it("VALID when required fields present", () => {
    const r = validateGpuDispatchContract(BASE);
    assert.equal(r.ok, true);
    assert.equal(r.code, CONTRACT_CODES.VALID);
    assert.equal(r.contract.authorityTag, "assist");
  });

  it("INVALID without intentId / modality / flags", () => {
    assert.equal(validateGpuDispatchContract({}).ok, false);
    assert.equal(
      validateGpuDispatchContract({ ...BASE, modality: "audio" }).ok,
      false,
    );
    assert.equal(
      validateGpuDispatchContract({
        ...BASE,
        determinismRequired: "yes",
      }).ok,
      false,
    );
  });

  it("REJECTS /printer/* routes", () => {
    const r = validateGpuDispatchContract({
      ...BASE,
      route: "/printer/beauty",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, CONTRACT_CODES.PRINTER_ROUTE_BANNED);
  });

  it("REJECTS evidence SoT / asPrintSoT", () => {
    const a = validateGpuDispatchContract({ ...BASE, asPrintSoT: true });
    assert.equal(a.code, CONTRACT_CODES.EVIDENCE_SOT_BANNED);
    const b = validateGpuDispatchContract({
      ...BASE,
      route: "bundle/printProvenance",
    });
    assert.equal(b.code, CONTRACT_CODES.EVIDENCE_SOT_BANNED);
  });

  it("REJECTS banned print capabilityClass", () => {
    const r = validateGpuDispatchContract({
      ...BASE,
      capabilityClass: "gpu.print.beauty",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, CONTRACT_CODES.PRINT_SOT_BANNED);
  });
});

describe("Assist binding policy", () => {
  it("determinismRequired=true → CPU RT4D only", () => {
    const r = resolveAssistBinding({
      ...BASE,
      determinismRequired: true,
      vendorPreference: "nvidia",
    });
    assert.equal(r.ok, true);
    assert.equal(r.vendor, "cpu");
    assert.equal(r.capabilityClass, "cpu.rt4d.print");
    assert.equal(r.code, CONTRACT_CODES.DETERMINISM_CPU_ONLY);
    assert.equal(r.authorityTag, "assist");
    assert.equal(r.provenanceKind, "assistProvenance");
    assert.equal(r.printProvenance, false);
  });

  it("vendor=auto → NVIDIA → AMD → CPU cascade", () => {
    const nvidia = resolveAssistBinding(BASE, {
      backendsAvailable: { nvidia: true, amd: true, cpu: true },
    });
    assert.equal(nvidia.vendor, "nvidia");

    const amd = resolveAssistBinding(BASE, {
      backendsAvailable: { nvidia: false, amd: true, cpu: true },
    });
    assert.equal(amd.vendor, "amd");
    assert.equal(amd.code, CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU);

    const cpu = resolveAssistBinding(BASE, {
      backendsAvailable: { nvidia: false, amd: false, cpu: true },
    });
    assert.equal(cpu.vendor, "cpu");
    assert.equal(cpu.code, CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU);
  });

  it("sovereignty override when preferred backend missing", () => {
    const r = resolveAssistBinding(
      { ...BASE, vendorPreference: "nvidia" },
      { backendsAvailable: { nvidia: false, amd: false, cpu: true } },
    );
    assert.equal(r.vendor, "cpu");
    assert.equal(r.code, CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU);
  });
});

describe("GpuAssistModule routes", () => {
  it("routeLookDev returns assistProvenance only", () => {
    const r = routeLookDev(BASE);
    assert.equal(r.ok, true);
    assert.equal(r.kind, "lookDev");
    assert.equal(r.printProvenance, false);
    assert.equal(r.provenanceKind, "assistProvenance");
    assert.ok(r.assistProvenance);
    assert.equal(r.assistProvenance.kind, "lookDev");
  });

  it("routeSceneSpecAssist + routeEmbeddings ok", () => {
    const a = routeSceneSpecAssist({ ...BASE, modality: "text" });
    assert.equal(a.ok, true);
    assert.equal(a.kind, "sceneSpecAssist");
    const b = routeEmbeddings({ ...BASE, modality: "text" });
    assert.equal(b.ok, true);
    assert.equal(b.kind, "embeddings");
  });

  it("assist routes reject printer path contracts", () => {
    const r = routeLookDev({ ...BASE, route: "api/printer/run" });
    assert.equal(r.ok, false);
    assert.equal(r.code, CONTRACT_CODES.PRINTER_ROUTE_BANNED);
  });
});

describe("SovereignLookDevEngine skeleton", () => {
  it("plans Steps 1–4 with assistOnly through 3 and CPU print handoff", () => {
    const plan = planLookDevPipeline(BASE);
    assert.equal(plan.status, "declared");
    assert.equal(plan.ok, true);
    assert.equal(plan.steps.length, 4);
    assert.equal(plan.steps[0].assistOnly, true);
    assert.equal(plan.steps[1].assistOnly, true);
    assert.equal(plan.steps[2].assistOnly, true);
    assert.equal(plan.steps[3].printBackend, "cpu.rt4d.print");
    assert.equal(plan.steps[3].bannedAssistIntoPrinter, true);
    assert.equal(plan.finalPrint, "cpu.rt4d.print");
  });
});
