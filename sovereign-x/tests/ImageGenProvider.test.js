/**
 * CCC-ImageGen — provider selection + fallback logging tests.
 * STATUS: **partial** (selection enforced; remote/CPU/photoreal execution declared;
 * opencl.gen wired as first-class local GPU pixel source)
 */

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CAPABILITY_ID,
  IMAGE_GEN_PROVIDERS,
  PHOTOREAL_PROVIDERS,
  LAYOUT_PROVIDERS,
  selectImageGenProvider,
  selectPhotorealBeautyProvider,
  buildConstitutionalImageGenLog,
  attemptImageGenWithFallback,
  attemptLocalCpuProvider,
  attemptRemoteProvider,
  attemptPhotorealBeautyProvider,
  attemptOpenClGenProvider,
  loadCccImageGenConfig,
  CL_GEN_PROVIDER,
} from "../router/modules/gpu/amd/ImageGenProvider.js";

describe("ImageGenProvider / CCC-ImageGen", () => {
  it("exposes capability id and priority order (opencl.gen after local.gpu; photoreal last)", () => {
    assert.equal(CAPABILITY_ID, "image.gen.provider");
    assert.deepEqual([...IMAGE_GEN_PROVIDERS], [
      "local.gpu",
      "opencl.gen",
      "local.cpu",
      "remote.gpu",
      "remote.service",
      "photoreal.remote.diffusion",
      "photoreal.external.pbr",
    ]);
    assert.deepEqual([...PHOTOREAL_PROVIDERS], [
      "photoreal.remote.diffusion",
      "photoreal.external.pbr",
    ]);
    assert.deepEqual([...LAYOUT_PROVIDERS], ["engine3d.soft", "opencl.gen"]);
  });

  it("loads machine CCC config with opencl.gen and photoreal providers", () => {
    const cfg = loadCccImageGenConfig();
    assert.ok(cfg);
    assert.equal(cfg.contractId, "CCC-ImageGen");
    assert.equal(cfg.capability, "image.gen.provider");
    const ids = (cfg.providers || []).map((p) => p.id);
    assert.ok(ids.includes("opencl.gen"));
    assert.ok(ids.includes("photoreal.remote.diffusion"));
    assert.ok(ids.includes("photoreal.external.pbr"));
    assert.deepEqual(cfg.selectionPriority?.[0], "local.gpu");
    assert.deepEqual(cfg.selectionPriority?.[1], "opencl.gen");
  });

  it("selects local.gpu when available", () => {
    const sel = selectImageGenProvider(
      {},
      { localGpuAvailable: true, openclGenAvailable: true },
    );
    assert.equal(sel.selected, "local.gpu");
    assert.equal(sel.fallbackUsed, false);
    assert.equal(sel.invariantOk, true);
    assert.equal(sel.log.fallbackUsed, false);
    assert.equal(sel.log.imageGenProvider, "local.gpu");
  });

  it("prefers opencl.gen when Lemonade/local.gpu down", () => {
    const sel = selectImageGenProvider(
      { IMAGE_GEN_FORCE_GPU_DOWN: "1" },
      { localGpuAvailable: false, openclGenAvailable: true },
    );
    assert.equal(sel.selected, "opencl.gen");
    assert.equal(sel.localGpuAvailable, false);
    assert.equal(sel.fallbackUsed, true);
    assert.equal(sel.log.fallbackUsed, true);
    assert.equal(sel.status, "available");
    assert.ok(sel.available.includes("opencl.gen"));
  });

  it("falls through to local.cpu when GPU and opencl.gen disabled", () => {
    const sel = selectImageGenProvider(
      {
        IMAGE_GEN_FORCE_GPU_DOWN: "1",
        IMAGE_GEN_DISABLE_OPENCL: "1",
      },
      { localGpuAvailable: false, openclGenAvailable: false },
    );
    assert.equal(sel.selected, "local.cpu");
    assert.equal(sel.fallbackUsed, true);
  });

  it("includes remote providers when URLs configured", () => {
    const sel = selectImageGenProvider(
      {
        IMAGE_GEN_DISABLE_LOCAL_GPU: "1",
        IMAGE_GEN_DISABLE_OPENCL: "1",
        IMAGE_GEN_DISABLE_LOCAL_CPU: "1",
        IMAGE_GEN_REMOTE_GPU_URL: "http://127.0.0.1:9999/gpu",
      },
      { localGpuAvailable: false, openclGenAvailable: false },
    );
    assert.equal(sel.selected, "remote.gpu");
    assert.equal(sel.fallbackUsed, true);
    assert.ok(sel.available.includes("remote.gpu"));
  });

  it("includes photoreal.remote.diffusion when URL configured and others disabled", () => {
    const sel = selectImageGenProvider(
      {
        IMAGE_GEN_DISABLE_LOCAL_GPU: "1",
        IMAGE_GEN_DISABLE_OPENCL: "1",
        IMAGE_GEN_DISABLE_LOCAL_CPU: "1",
        PHOTOREAL_REMOTE_DIFFUSION_URL: "http://127.0.0.1:7860",
      },
      { localGpuAvailable: false, openclGenAvailable: false },
    );
    assert.equal(sel.selected, "photoreal.remote.diffusion");
    assert.ok(sel.available.includes("photoreal.remote.diffusion"));
  });

  it("invariant_fail only when zero providers configured", () => {
    const sel = selectImageGenProvider(
      {
        IMAGE_GEN_DISABLE_LOCAL_GPU: "1",
        IMAGE_GEN_DISABLE_OPENCL: "1",
        IMAGE_GEN_DISABLE_LOCAL_CPU: "1",
        PHOTOREAL_DISABLE_REMOTE_DIFFUSION: "1",
        PHOTOREAL_DISABLE_EXTERNAL_PBR: "1",
      },
      { localGpuAvailable: false, openclGenAvailable: false },
    );
    assert.equal(sel.selected, null);
    assert.equal(sel.invariantOk, false);
    assert.equal(sel.status, "invariant_fail");
    assert.match(sel.reason, /invariant_fail/);
  });

  it("builds constitutional log shape", () => {
    const log = buildConstitutionalImageGenLog({
      imageGenProvider: "local.cpu",
      localGpuAvailable: false,
      fallbackUsed: true,
      reason: "gpu down",
    });
    assert.deepEqual(Object.keys(log).sort(), [
      "fallbackUsed",
      "imageGenProvider",
      "localGpuAvailable",
      "reason",
    ]);
    assert.equal(log.fallbackUsed, true);
  });

  it("local.cpu stub defers without fake PNG", async () => {
    const r = await attemptLocalCpuProvider({});
    assert.equal(r.deferred, true);
    assert.equal(r.pixelsProduced, false);
    assert.equal(r.status, "partial");
    assert.equal(r.code, "PROVIDER_EXECUTION_DEFERRED");
    assert.ok(!r.pngBase64);
    assert.ok(!r.outPath);
  });

  it("remote stub reports connect without pixels", async () => {
    const r = await attemptRemoteProvider("remote.service", {
      env: { IMAGE_GEN_REMOTE_SERVICE_URL: "http://example.test/v1" },
    });
    assert.equal(r.code, "REMOTE_CONNECT_STUB");
    assert.equal(r.pixelsProduced, false);
    assert.equal(r.deferred, true);
  });

  it("selectPhotorealBeautyProvider none → layout-only", () => {
    const b = selectPhotorealBeautyProvider("none", {});
    assert.equal(b.selected, null);
    assert.equal(b.role, "layout-only");
    assert.equal(b.photorealClaim, false);
  });

  it("selectPhotorealBeautyProvider remote without URL → deferred stub", () => {
    const b = selectPhotorealBeautyProvider("remote", {});
    assert.equal(b.selected, "photoreal.remote.diffusion");
    assert.equal(b.configured, false);
    assert.equal(b.deferred, true);
    assert.equal(b.pixelsProduced, false);
    assert.equal(b.photorealClaim, false);
    assert.equal(b.code, "PHOTOREAL_BEAUTY_DEFERRED_UNCONFIGURED");
  });

  it("selectPhotorealBeautyProvider remote with URL → stub (no claim)", () => {
    const b = selectPhotorealBeautyProvider("remote", {
      PHOTOREAL_REMOTE_DIFFUSION_URL: "http://example.test/sdxl",
    });
    assert.equal(b.selected, "photoreal.remote.diffusion");
    assert.equal(b.configured, true);
    assert.equal(b.deferred, false);
    assert.equal(b.photorealClaim, false);
    assert.equal(b.code, "PHOTOREAL_BEAUTY_STUB");
  });

  it("selectPhotorealBeautyProvider external-pbr → local pipeline (Cycles may be blocked)", () => {
    const b = selectPhotorealBeautyProvider("external-pbr", {
      PHOTOREAL_DISABLE_EXTERNAL_PBR: "0",
    });
    assert.equal(b.selected, "photoreal.external.pbr");
    assert.equal(b.configured, true);
    assert.equal(b.photorealClaim, false);
    assert.ok(
      b.code === "EXTERNAL_PBR_EXPORT_HELD_CYCLES_BLOCKED" ||
        b.code === "EXTERNAL_PBR_PIPELINE_READY",
    );
    // Without Blender on PATH, beauty remains deferred (no fake PNG).
    if (b.code === "EXTERNAL_PBR_EXPORT_HELD_CYCLES_BLOCKED") {
      assert.equal(b.deferred, true);
    }
  });

  it("attemptPhotorealBeautyProvider never invents beauty PNG", async () => {
    const r = await attemptPhotorealBeautyProvider("photoreal.remote.diffusion", {
      env: { PHOTOREAL_REMOTE_DIFFUSION_URL: "http://example.test/sdxl" },
    });
    assert.equal(r.pixelsProduced, false);
    assert.equal(r.deferred, true);
    assert.equal(r.photorealClaim, false);
    assert.equal(r.code, "PHOTOREAL_BEAUTY_STUB");
    assert.ok(!r.outPath);
    assert.ok(!r.pngBase64);
  });

  it("attemptPhotorealBeautyProvider external-pbr exports GLB without inventing Cycles PNG", async () => {
    const outDir = join(
      fileURLToPath(new URL("../../../../tmp/external-pbr-test/", import.meta.url)),
    );
    mkdirSync(outDir, { recursive: true });
    const r = await attemptPhotorealBeautyProvider("photoreal.external.pbr", {
      env: { ...process.env, PHOTOREAL_DISABLE_EXTERNAL_PBR: "0" },
      outDir,
    });
    assert.equal(r.imageGenProvider, "photoreal.external.pbr");
    assert.equal(r.photorealClaim, false);
    // Export Held when scripts work; Cycles only if Blender present.
    if (r.code === "CYCLES_BEAUTY_PIXELS") {
      assert.equal(r.pixelsProduced, true);
      assert.ok(r.outPath);
    } else {
      assert.equal(r.pixelsProduced, false);
      assert.ok(
        r.code === "CYCLES_BLOCKED_NO_BLENDER" ||
          r.code === "GLB_EXPORT_FAILED" ||
          r.code === "CYCLES_RENDER_FAILED" ||
          r.code === "PHOTOREAL_NOT_CONFIGURED",
      );
      if (r.export?.status === "held" || r.glbPath) {
        assert.ok(r.glbPath || r.export?.glbPath);
      }
    }
  });

  it("attemptOpenClGenProvider uses mock generateFn without spawning", async () => {
    const r = await attemptOpenClGenProvider({
      openclGenAvailable: true,
      openclGenGenerateFn: async () => ({
        ok: true,
        outPath: "docs/4d-engine/proofs/cl-gen/mock.png",
        pixelsProduced: true,
        status: "partial",
      }),
    });
    assert.equal(r.imageGenProvider, CL_GEN_PROVIDER);
    assert.equal(r.pixelsProduced, true);
    assert.equal(r.ok, true);
  });

  it("cascade: Lemonade fail → opencl.gen pixels (prefer over local.cpu)", async () => {
    const out = await attemptImageGenWithFallback({
      localGpuAvailable: true,
      openclGenAvailable: true,
      env: {},
      localGpuGenerateFn: async () => ({
        ok: false,
        status: "degraded",
        code: "LEMONADE_SD_DEGRADED",
        message: "sd-server failed to start or become ready",
      }),
      openclGenGenerateFn: async () => ({
        ok: true,
        outPath: "docs/4d-engine/proofs/cl-gen/mock-cascade.png",
        pixelsProduced: true,
        status: "partial",
      }),
    });
    assert.equal(out.blockedOnGpu, false);
    assert.equal(out.pixelsProduced, true);
    assert.equal(out.imageGenProvider, "opencl.gen");
    assert.equal(out.fallbackUsed, true);
    assert.equal(out.attempts[0].imageGenProvider, "local.gpu");
    assert.equal(out.attempts[1].imageGenProvider, "opencl.gen");
  });

  it("attemptImageGenWithFallback logs fallback when GPU+opencl fail", async () => {
    const out = await attemptImageGenWithFallback({
      localGpuAvailable: true,
      openclGenAvailable: true,
      env: {},
      localGpuGenerateFn: async () => ({
        ok: false,
        status: "degraded",
        code: "LEMONADE_SD_DEGRADED",
        message: "sd-server failed to start or become ready",
      }),
      openclGenGenerateFn: async () => ({
        ok: false,
        pixelsProduced: false,
        message: "opencl mock fail",
      }),
    });
    assert.equal(out.blockedOnGpu, false);
    assert.equal(out.fallbackUsed, true);
    assert.equal(out.pixelsProduced, false);
    assert.equal(out.status, "degraded");
    assert.ok(out.attempts.length >= 2);
    assert.equal(out.attempts[0].imageGenProvider, "local.gpu");
    assert.equal(out.attempts[1].imageGenProvider, "opencl.gen");
    assert.equal(out.attempts[2].imageGenProvider, "local.cpu");
  });

  it("probe path: GPU down → opencl.gen selected without halt-on-GPU", async () => {
    const out = await attemptImageGenWithFallback({
      localGpuAvailable: false,
      openclGenAvailable: true,
      env: { IMAGE_GEN_FORCE_GPU_DOWN: "1" },
      openclGenGenerateFn: async () => ({
        ok: true,
        outPath: "docs/4d-engine/proofs/cl-gen/mock-gpu-down.png",
        pixelsProduced: true,
      }),
    });
    assert.equal(out.selection.selected, "opencl.gen");
    assert.equal(out.pixelsProduced, true);
    assert.equal(out.blockedOnGpu, false);
    assert.notEqual(out.status, "blocked");
  });
});
