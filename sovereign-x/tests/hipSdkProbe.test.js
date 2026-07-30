/**

 * HIP SDK probe unit tests (filesystem + mock env; no live compile required).

 */

import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";

import { join } from "node:path";

import { tmpdir } from "node:os";

import {

  ADAPTER_ID,

  resolveHipRootCandidates,

  probeHipSdk,

  hipBeautyAssistSketch,

  resolveHipBeautyKernelStatus,

  readHipHelloCompileProof,

} from "../router/modules/gpu/amd/hipSdkProbe.js";



describe("hipSdkProbe", () => {

  it("exposes adapter id and prefers HIP_PATH", () => {

    assert.equal(ADAPTER_ID, "sx.adapter.hip.sdk.probe");

    const c = resolveHipRootCandidates({

      HIP_PATH: "C:\\Program Files\\AMD\\ROCm\\7.1",

    });

    assert.equal(c[0], "C:\\Program Files\\AMD\\ROCm\\7.1");

  });



  it("probes host without throwing", () => {

    const report = probeHipSdk();

    assert.ok(["absent", "partial"].includes(report.statusTag));

    assert.ok(Array.isArray(report.candidates));

    assert.ok(Array.isArray(report.blockers));

  });



  it("beauty sketch is absent when SDK absent", () => {

    const sketch = hipBeautyAssistSketch(

      { statusTag: "absent", selectedRoot: null },

      { helloProofPath: join(tmpdir(), "no-such-hip-hello-proof.json") },

    );

    assert.equal(sketch.status, "absent");

    assert.equal(sketch.kernelStatus, "absent");

  });



  it("beauty sketch stays declared without compile proof", () => {

    const sketch = hipBeautyAssistSketch(

      { statusTag: "partial", selectedRoot: "C:\\Program Files\\AMD\\ROCm\\7.1" },

      { helloProofPath: join(tmpdir(), "no-such-hip-hello-proof.json") },

    );

    assert.equal(sketch.status, "declared");

    assert.equal(sketch.kernelStatus, "declared");

  });



  it("beauty sketch advances to partial when hello compile proof ok", () => {

    const dir = join(tmpdir(), `hip-hello-proof-${Date.now()}`);

    mkdirSync(dir, { recursive: true });

    const proofPath = join(dir, "hip-hello-compile-run-proof.json");

    writeFileSync(

      proofPath,

      JSON.stringify({

        statusTag: "partial",

        compile: { ok: true, offloadArch: "gfx803" },

        run: { deviceRuntime: "blocked", exitCode: 2 },

      }),

      "utf8",

    );

    const resolved = resolveHipBeautyKernelStatus(

      { statusTag: "partial", selectedRoot: "C:\\x" },

      { helloProofPath: proofPath },

    );

    assert.equal(resolved.kernelStatus, "partial");

    assert.equal(resolved.helloProof.compileOk, true);

    assert.equal(resolved.helloProof.deviceRuntime, "blocked");

    const sketch = hipBeautyAssistSketch(

      { statusTag: "partial", selectedRoot: "C:\\x" },

      { helloProofPath: proofPath },

    );

    assert.equal(sketch.status, "partial");

    const read = readHipHelloCompileProof(proofPath);

    assert.equal(read.compileOk, true);

    if (existsSync(proofPath)) unlinkSync(proofPath);

  });



  it("host beauty status follows compile proof when SDK partial", () => {

    const report = probeHipSdk();

    const sketch = hipBeautyAssistSketch(report);

    if (report.statusTag === "partial") {

      assert.ok(["declared", "partial"].includes(sketch.status));

      if (sketch.status === "partial") {

        assert.equal(sketch.kernelStatus, "partial");

        assert.equal(sketch.helloProof?.compileOk, true);

      }

    } else {

      assert.equal(sketch.status, "absent");

    }

  });

});


