/**
 * FLUX lookdev-from-image + flux_generate stub tests (no network).
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { route } from "../router/index.js";
import { GpuAssistModule } from "../router/modules/gpu/gpuAssistModule.js";
import { LookDevEngine } from "../router/modules/gpu/assist/lookDevEngine.js";
import { extractFluxSceneSpec } from "../router/modules/gpu/assist/fluxSceneSpecExtractor.js";
import {
  fluxGenerate,
  buildFluxStub,
  loadImageBase64,
  resolveFluxEndpoint,
  extractOutputBase64,
} from "../skills/nvidia-gpu-assist/flux_generate.js";

describe("flux_generate (offline)", () => {
  it("resolveFluxEndpoint prefers NIM_FLUX_ENDPOINT", () => {
    const prev = process.env.NIM_FLUX_ENDPOINT;
    process.env.NIM_FLUX_ENDPOINT = "https://example.test/v1/infer";
    try {
      assert.equal(resolveFluxEndpoint(), "https://example.test/v1/infer");
    } finally {
      if (prev === undefined) delete process.env.NIM_FLUX_ENDPOINT;
      else process.env.NIM_FLUX_ENDPOINT = prev;
    }
  });

  it("loadImageBase64 from path", () => {
    const dir = mkdtempSync(join(tmpdir(), "sx-flux-"));
    const p = join(dir, "a.png");
    writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const loaded = loadImageBase64({ imagePath: p });
    assert.equal(loaded.ok, true);
    assert.ok(loaded.base64.length > 0);
  });

  it("dryRun stub does not call fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sx-flux-"));
    const p = join(dir, "a.png");
    writeFileSync(p, Buffer.from("png"));
    let fetchCalls = 0;
    const result = await fluxGenerate({
      imagePath: p,
      dryRun: true,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    });
    assert.equal(fetchCalls, 0);
    assert.equal(result.assistOnly, true);
    assert.equal(result.live, false);
    assert.equal(result.code, "FLUX_DRY_RUN");
    assert.equal(result.imageIngested, true);
  });

  it("missing key returns assistOnly stub", async () => {
    const prev = {
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
      NVIDIA_NIM_API_KEY: process.env.NVIDIA_NIM_API_KEY,
      NGC_API_KEY: process.env.NGC_API_KEY,
    };
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;
    delete process.env.NGC_API_KEY;
    try {
      const result = await fluxGenerate({
        imageBase64: Buffer.from("x").toString("base64"),
        forceStub: false,
      });
      assert.equal(result.assistOnly, true);
      assert.equal(result.code, "FLUX_MISSING_API_KEY");
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("extractOutputBase64 reads artifacts", () => {
    assert.equal(
      extractOutputBase64({ artifacts: [{ base64: "abc" }] }),
      "abc",
    );
  });

  it("buildFluxStub is always assistOnly", () => {
    const s = buildFluxStub({});
    assert.equal(s.assistOnly, true);
    assert.equal(s.nonAuthoritative, true);
  });
});

describe("fluxSceneSpecExtractor", () => {
  it("returns empty geometry draft with assist tags", () => {
    const spec = extractFluxSceneSpec(
      { code: "FLUX_DRY_RUN", live: false, imageIngested: true },
      { intentId: "t1", prompt: "demo" },
    );
    assert.equal(spec.assistOnly, true);
    assert.equal(spec.status, "declared");
    assert.deepEqual(spec.objects, []);
    assert.equal(spec.id, "t1");
    assert.equal(spec.flux.code, "FLUX_DRY_RUN");
  });
});

describe("GpuAssistModule lookdev-from-image dispatch", () => {
  const mod = new GpuAssistModule({ route });

  it("dispatch mode lookdev-from-image → flux ingest dry-run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sx-flux-"));
    const p = join(dir, "a.png");
    writeFileSync(p, Buffer.from("png"));
    const r = await mod.dispatch({
      mode: "lookdev-from-image",
      imagePath: p,
      dryRun: true,
    });
    assert.equal(r.assistOnly, true);
    assert.equal(r.capabilityId, "gpu.gen.nvidia.nim_flux");
    assert.equal(r.code, "FLUX_DRY_RUN");
  });

  it("handleFluxImageIngest determinismRequired → cpu print", async () => {
    const r = await mod.handleFluxImageIngest({
      determinismRequired: true,
      imageBase64: "aa",
    });
    assert.equal(r.capabilityId, "cpu.rt4d.print");
    assert.equal(r.authority, "authoritative");
  });
});

describe("LookDevEngine.runFromImage", () => {
  it("returns draft sceneSpec + concept (dry-run)", async () => {
    const engine = new LookDevEngine({ route });
    const dir = mkdtempSync(join(tmpdir(), "sx-flux-"));
    const p = join(dir, "a.png");
    writeFileSync(p, Buffer.from("png"));
    const out = await engine.runFromImage({
      imagePath: p,
      dryRun: true,
      intentId: "eng-1",
    });
    assert.equal(out.assistOnly, true);
    assert.equal(out.mode, "lookdev-from-image");
    assert.ok(out.sceneSpec);
    assert.equal(out.sceneSpec.assistOnly, true);
    assert.equal(out.concept.code, "FLUX_DRY_RUN");
  });
});

describe("router route nim_flux lookdev-from-image", () => {
  it("wires skill module via registry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sx-flux-"));
    const p = join(dir, "a.png");
    writeFileSync(p, Buffer.from("png"));
    const r = await route("gpu.gen.nvidia.nim_flux", {
      mode: "lookdev-from-image",
      imagePath: p,
      dryRun: true,
    });
    assert.equal(r.assistOnly, true);
    assert.equal(r.capabilityId, "gpu.gen.nvidia.nim_flux");
    assert.ok(r.skillModule);
    assert.match(String(r.skillModule), /flux_generate\.js$/);
  });
});
