/**
 * Contract tests for gpuDispatchContract.validate — determinismRequired override.
 * STATUS: **partial** — unit-enforced; no live GPU.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate } from "../router/contracts/gpuDispatchContract.js";
import { route } from "../router/index.js";

describe("gpuDispatchContract.validate (determinismRequired)", () => {
  it("accepts determinismRequired → cpu.rt4d.print + print class", () => {
    const ok = validate({
      determinismRequired: true,
      capabilityClass: "print",
      backend: "cpu.rt4d.print",
    });
    assert.equal(ok.backend, "cpu.rt4d.print");
    assert.equal(ok.capabilityClass, "print");
  });

  it("rejects determinismRequired with GPU backend", () => {
    assert.throws(
      () =>
        validate({
          determinismRequired: true,
          capabilityClass: "compute",
          backend: "gpu.compute.nvidia.cuda",
        }),
      /cpu\.rt4d\.print/,
    );
  });

  it("rejects determinismRequired with non-print capabilityClass", () => {
    assert.throws(
      () =>
        validate({
          determinismRequired: true,
          capabilityClass: "gen",
          backend: "cpu.rt4d.print",
        }),
      /capabilityClass=print/,
    );
  });

  it("tags GPU assist authority when determinismRequired=false", () => {
    const req = {
      determinismRequired: false,
      capabilityClass: "inference",
      backend: "gpu.inference.amd.rocm",
    };
    validate(req);
    assert.equal(req.authority, "assist");
  });

  it("rejects GPU backend with invalid capabilityClass", () => {
    assert.throws(
      () =>
        validate({
          determinismRequired: false,
          capabilityClass: "print",
          backend: "gpu.gen.nvidia.nim_flux",
        }),
      /gen,inference,compute/,
    );
  });

  it("route() denies GPU + determinismRequired via GPU print safeguard", async () => {
    const r = await route("gpu.compute.nvidia.cuda", {
      intentId: "det-override-1",
      determinismRequired: true,
      modality: "scene",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GPU_PRINT_SAFEGUARD");
    assert.equal(r.assistOnly, true);
    assert.match(String(r.message), /determinismRequired/);
  });

  it("route() keeps GPU assist when determinismRequired=false", async () => {
    const r = await route("gpu.compute.amd.hip", {
      intentId: "assist-1",
      determinismRequired: false,
      mode: "parity",
    });
    assert.equal(r.ok, true);
    assert.equal(r.capabilityId, "gpu.compute.amd.hip");
    assert.equal(r.authority, "assist");
    assert.equal(r.assistOnly, true);
  });
});
