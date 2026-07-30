/**
 * Lemonade SD adapter unit tests (no live generation required).
 * STATUS: **partial**
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ADAPTER_ID,
  MODEL_CASCADE,
  resolveLemonadeBaseUrl,
  probeLemonadeCapabilities,
  classifyLemonadeHaltCause,
  verifyModelWeightsProvenance,
  sha256File,
  generateStillViaImageGenProviders,
  reportLemonadeSdCapability,
} from "../router/modules/gpu/amd/lemonadeSdAdapter.js";

describe("lemonadeSdAdapter", () => {
  it("exposes adapter id and cascade", () => {
    assert.equal(ADAPTER_ID, "sx.adapter.lemonade.sd");
    assert.ok(MODEL_CASCADE.includes("SD-Turbo-GGUF"));
    assert.ok(MODEL_CASCADE.includes("SD-Turbo"));
  });

  it("resolves base URL from env", () => {
    assert.equal(
      resolveLemonadeBaseUrl({ LEMONADE_BASE_URL: "http://localhost:9/api/v1/" }),
      "http://localhost:9/api/v1",
    );
    assert.equal(
      resolveLemonadeBaseUrl({ LEMONADE_HOST: "127.0.0.1", LEMONADE_PORT: "13305" }),
      "http://127.0.0.1:13305/api/v1",
    );
  });

  it("probes localhost Lemonade without throwing", async () => {
    const report = await probeLemonadeCapabilities({ verifyWeights: false });
    assert.equal(report.adapterId, ADAPTER_ID);
    assert.ok(["partial", "blocked", "degraded", "invariant_fail"].includes(report.status));
    assert.ok(typeof report.serverUp === "boolean");
    assert.ok(Array.isArray(report.imageModels));
  });

  it("classifies halt causes honestly", () => {
    assert.equal(
      classifyLemonadeHaltCause({
        code: "model_load_error",
        message: "sd-server failed to start or become ready",
      }),
      "sd_server",
    );
    assert.equal(
      classifyLemonadeHaltCause({ message: "STATUS_ILLEGAL_INSTRUCTION AVX2" }),
      "avx2",
    );
    assert.equal(
      classifyLemonadeHaltCause({ message: "R9 380 Tonga ROCm unsupported" }),
      "rocm_unsupported",
    );
    assert.equal(
      classifyLemonadeHaltCause({ code: "provenance_denied", message: "checksum mismatch" }),
      "provenance",
    );
  });

  it("verifies weight checksum when file + expected digest provided", () => {
    const dir = join(tmpdir(), `sx-lemonade-prov-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const weightPath = join(dir, "SD-Turbo-fake.gguf");
    writeFileSync(weightPath, Buffer.from("fake-sd-weights-for-test"));
    const digest = sha256File(weightPath);
    const okGate = verifyModelWeightsProvenance({
      modelId: "SD-Turbo",
      weightPath,
      expectedSha256: { "SD-Turbo": digest },
    });
    assert.equal(okGate.lawful, true);
    assert.equal(okGate.checksumOk, true);
    assert.ok(okGate.provenanceRecord?.lawful);

    const badGate = verifyModelWeightsProvenance({
      modelId: "SD-Turbo",
      weightPath,
      expectedSha256: { "SD-Turbo": "deadbeef".repeat(8) },
    });
    assert.equal(badGate.lawful, false);
    assert.equal(badGate.code, "WEIGHT_CHECKSUM_MISMATCH");
    assert.equal(badGate.haltCauseClass, "provenance");
    rmSync(dir, { recursive: true, force: true });
  });

  it("CCC-ImageGen cascade: GPU down yields fallbackUsed without blockedOnGpu", async () => {
    const out = await generateStillViaImageGenProviders({
      prompt: "unit test still",
      localGpuAvailable: false,
      assumeGpuDown: true,
      env: { IMAGE_GEN_FORCE_GPU_DOWN: "1" },
      requireLawfulWeights: false,
      retries: 1,
      maxModels: 1,
      timeoutMs: 2000,
    });
    assert.equal(out.constitutionalLog.fallbackUsed, true);
    assert.equal(out.blockedOnGpu, false);
    assert.ok(["degraded", "partial", "invariant_fail"].includes(out.status));
    assert.notEqual(out.status, "blocked");
    assert.match(String(out.imagesStatus || ""), /fallback|degraded|provider/i);
  });

  it("capability report includes cccImageGen log when GPU assumed down", async () => {
    const report = await reportLemonadeSdCapability({
      verifyWeights: false,
      assumeGpuDown: true,
      localGpuAvailable: false,
      env: { IMAGE_GEN_FORCE_GPU_DOWN: "1" },
    });
    assert.ok(report.cccImageGen);
    assert.equal(report.cccImageGen.constitutionalLog.fallbackUsed, true);
    assert.ok(report.imagesStatus);
    assert.notEqual(report.status, "blocked");
  });
});