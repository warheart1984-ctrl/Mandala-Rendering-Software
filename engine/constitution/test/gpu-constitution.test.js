/**
 * GPU constitutional gates — never print SoT, never determinism as print authority,
 * never evidence apiKey; uses gpuPrintSafeguard + registry when present.
 *
 * STATUS: **enforced** under node:test (constitutional FULL_PASS for these gates).
 * Live WebGPU hardware remains **partial**.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertGpuPrintSafeguard,
  checkGpuPrintSafeguard,
  GPU_PRINT_SAFEGUARD_CODE,
} from "../../../sovereign-x/router/contracts/gpuPrintSafeguard.js";
import {
  route,
  routeHostAction,
  HostAction,
  findSecretEvidenceKey,
  loadGpuSkillsRegistry,
  HOST_CONSTITUTIONAL_ROUTER_CODE,
} from "../../runtime/hosts/HostConstitutionalRouter.js";

describe("gpu-constitution — print safeguard", () => {
  it("denies GPU + mode print", () => {
    const r = checkGpuPrintSafeguard("gpu.compute.nvidia.cuda", { mode: "print" });
    assert.ok(r);
    assert.equal(r.ok, false);
    assert.equal(r.code, GPU_PRINT_SAFEGUARD_CODE);
    assert.equal(r.assistOnly, true);
  });

  it("denies GPU + determinismRequired", () => {
    assert.throws(
      () => assertGpuPrintSafeguard("gpu.inference.amd.rocm", { determinismRequired: true }),
      /determinismRequired/,
    );
  });

  it("denies asPrintSoT on GPU capability", () => {
    const r = checkGpuPrintSafeguard("gpu.gen.nvidia.nim_flux", { asPrintSoT: true });
    assert.ok(r);
    assert.match(r.message, /print/);
  });

  it("allows GPU assist without print/determinism", () => {
    assert.equal(checkGpuPrintSafeguard("gpu.compute.amd.hip", { mode: "parity" }), null);
  });
});

describe("gpu-constitution — host router gates", () => {
  it("denies gpu.print action", () => {
    const r = routeHostAction(HostAction.GPU_PRINT, {}, { host: "test" });
    assert.equal(r.ok, false);
    assert.equal(r.code, HOST_CONSTITUTIONAL_ROUTER_CODE);
    assert.equal(r.reason, "gpu_never_print_sot");
  });

  it("denies setDeterminismRequired as print authority for GPU", () => {
    const r = route(HostAction.SET_DETERMINISM_REQUIRED, {
      asPrintAuthority: true,
      gpu: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "determinism_not_print_authority");
  });

  it("denies injectEvidence with apiKey", () => {
    const r = route(HostAction.INJECT_EVIDENCE, {
      evidence: { id: "ev-1", apiKey: "sk-test" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "evidence_purity");
    assert.equal(findSecretEvidenceKey({ apiKey: "x" }), "apiKey");
  });

  it("allows renderAssist (assist-only)", () => {
    const r = route(HostAction.RENDER_ASSIST, {});
    assert.equal(r.ok, true);
    assert.equal(r.assistOnly, true);
    assert.equal(r.nonAuthoritative, true);
    assert.equal(r.authoritativePrint, "cpu.rt4d.print");
  });
});

describe("gpu-constitution — skills registry", () => {
  it("loads registry with authoritativePrint cpu.rt4d.print", () => {
    const reg = loadGpuSkillsRegistry();
    assert.ok(reg);
    assert.equal(reg.authoritativePrint, "cpu.rt4d.print");
    assert.equal(reg.capabilityMeta?.["gpu.compute.nvidia.cuda"]?.authority, "assist");
  });
});
