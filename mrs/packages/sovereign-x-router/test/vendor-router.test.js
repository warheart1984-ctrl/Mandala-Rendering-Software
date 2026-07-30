/**
 * Sovereign X vendor router — dispatch + registry contract tests.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import {
  clearRegistryCache,
  DISPATCH_CODES,
  dispatchVendorCapability,
  getCapability,
  listForbiddenPrintCapabilityIds,
  listUpstreamCapabilityIds,
  loadVendorCapabilityRegistry,
} from "../src/index.js";

const NVIDIA_IDS = [
  "gpu.inference.nvidia.tao",
  "gpu.compute.nvidia.cuda",
  "gpu.optimize.nvidia.dynamo",
  "gpu.sim.nvidia.tilegym",
  "ai.gen.nvidia.flux",
  "gpu.gen.nvidia.nim_flux",
  "ai.gen.nvidia.cosmos",
  "ai.vision.nvidia.llama",
];

const AMD_IDS = [
  "gpu.compute.amd.rocm",
  "gpu.compute.amd.hip",
  "gpu.inference.amd.rocm",
  "gpu.compute.amd.legacy_efficient",
];

/** Prior IDs kept; nim_flux is alias row (still listed upstream). */
const UPSTREAM_ALLOW_IDS = [
  "gpu.inference.nvidia.tao",
  "gpu.compute.nvidia.cuda",
  "gpu.optimize.nvidia.dynamo",
  "gpu.sim.nvidia.tilegym",
  "ai.gen.nvidia.flux",
  "gpu.gen.nvidia.nim_flux",
  "ai.gen.nvidia.cosmos",
  "ai.vision.nvidia.llama",
  ...AMD_IDS,
];

const FORBIDDEN_PRINT_IDS = [
  "gpu.print.beauty",
  "gpu.print.deterministic_plates",
  "gpu.rt4d.sot",
  "gpu.denoise.evidence",
  "gpu.integrator.print",
];

describe("SovereignX vendor capability registry", () => {
  before(() => {
    clearRegistryCache();
  });

  it("loads registry with expected kind and related contract links", () => {
    const doc = loadVendorCapabilityRegistry({ reload: true });
    assert.equal(doc.kind, "SovereignXVendorCapabilityRegistry");
    assert.equal(doc.status, "declared");
    assert.ok(doc.related?.digitalPrinterContract);
    assert.ok(doc.related?.vendorSkillsInstallNote);
    assert.equal(doc.capabilities.length, UPSTREAM_ALLOW_IDS.length);
    assert.ok(doc.aliases?.["gpu.gen.nvidia.nim_flux"]);
    assert.deepEqual(
      (doc.canonicalCapabilityClasses ?? []).slice(0, 5),
      [
        "gpu.inference.nvidia.tao",
        "gpu.compute.nvidia.cuda",
        "gpu.gen.nvidia.nim_flux",
        "gpu.inference.amd.rocm",
        "gpu.compute.amd.hip",
      ],
    );
  });

  it("maps every NVIDIA + AMD architecture ID to skillNames and upstream|forbidden_for_print", () => {
    for (const id of UPSTREAM_ALLOW_IDS) {
      const cap = getCapability(id);
      assert.ok(cap, `missing capability ${id}`);
      assert.equal(cap.lane, "upstream");
      assert.equal(cap.printLane, "forbidden_for_print");
      assert.ok(
        cap.status === "declared" || cap.status === "partial",
        `${id} status must be declared|partial`,
      );
      assert.ok(Array.isArray(cap.skillNames) && cap.skillNames.length > 0);
    }
  });

  it("marks AMD capabilities hostCapabilityDriven", () => {
    for (const id of AMD_IDS) {
      assert.equal(getCapability(id).hostCapabilityDriven, true);
    }
  });
});

describe("SovereignX vendor dispatch stubs", () => {
  it("ALLOWs registered upstream IDs", () => {
    for (const id of UPSTREAM_ALLOW_IDS) {
      const result = dispatchVendorCapability(id, {
        intentId: "test-upstream",
        intentLane: "upstream",
      });
      assert.equal(result.ok, true, id);
      assert.equal(result.code, DISPATCH_CODES.ALLOWED_UPSTREAM);
      assert.ok(result.message.includes("ALLOWED"));
    }
  });

  it("ALLOWs AMD dispatch when hostCapable=false (host-capability driven stub)", () => {
    const result = dispatchVendorCapability("gpu.compute.amd.rocm", {
      intentLane: "lookdev",
      hostCapable: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.hostCapabilityDriven, true);
    assert.ok(result.message.includes("Host did not advertise"));
  });

  it("REJECTs constitutionally banned print-SoT capability IDs", () => {
    for (const id of FORBIDDEN_PRINT_IDS) {
      const result = dispatchVendorCapability(id, {
        intentLane: "upstream",
      });
      assert.equal(result.ok, false, id);
      assert.equal(result.code, DISPATCH_CODES.PRINT_SOT_BANNED);
      assert.ok(result.message.length > 0);
    }
    assert.deepEqual(
      listForbiddenPrintCapabilityIds().sort(),
      [...FORBIDDEN_PRINT_IDS].sort(),
    );
  });

  it("REJECTs upstream IDs when asPrintSoT or intentLane=print", () => {
    const a = dispatchVendorCapability("ai.gen.nvidia.flux", {
      asPrintSoT: true,
    });
    assert.equal(a.ok, false);
    assert.equal(a.code, DISPATCH_CODES.FORBIDDEN_FOR_PRINT);
    assert.ok(a.message.includes("CONTRACT_DIGITAL_PRINT"));

    const b = dispatchVendorCapability("gpu.compute.nvidia.cuda", {
      intentLane: "print",
    });
    assert.equal(b.ok, false);
    assert.equal(b.code, DISPATCH_CODES.FORBIDDEN_FOR_PRINT);
  });

  it("REJECTs unknown capability IDs with clear error", () => {
    const result = dispatchVendorCapability("gpu.mystery.vendor.x", {});
    assert.equal(result.ok, false);
    assert.equal(result.code, DISPATCH_CODES.UNKNOWN_CAPABILITY);
  });

  it("REJECTs empty capabilityId", () => {
    const result = dispatchVendorCapability("", {});
    assert.equal(result.ok, false);
    assert.equal(result.code, DISPATCH_CODES.INVALID_REQUEST);
  });

  it("lists all upstream IDs from architecture", () => {
    const ids = listUpstreamCapabilityIds().sort();
    assert.deepEqual(ids, [...UPSTREAM_ALLOW_IDS].sort());
  });
});
