/**
 * GPU print safeguard + Face Creation Assist unit tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertGpuPrintSafeguard,
  checkGpuPrintSafeguard,
  GPU_PRINT_SAFEGUARD_CODE,
} from "../router/contracts/gpuPrintSafeguard.js";
import { route } from "../router/index.js";
import { runFaceCreationAssist } from "../integrations/genblaze/modes/faceCreationAssist.js";
import { sceneToCharacterSpec } from "../integrations/genblaze/modes/sceneToCharacterSpec.js";
import { runCharacterBuilderPipeline } from "../integrations/genblaze/modes/characterBuilderPipeline.js";

describe("gpuPrintSafeguard", () => {
  it("throws when determinismRequired + gpu", () => {
    assert.throws(
      () =>
        assertGpuPrintSafeguard("gpu.gen.nvidia.nim_flux", {
          determinismRequired: true,
        }),
      /determinismRequired/,
    );
  });

  it("throws when mode=print + gpu", () => {
    assert.throws(
      () =>
        assertGpuPrintSafeguard("gpu.compute.amd.hip", {
          mode: "print",
        }),
      /print mode/,
    );
  });

  it("allows cpu.rt4d.print", () => {
    assert.doesNotThrow(() =>
      assertGpuPrintSafeguard("cpu.rt4d.print", {
        determinismRequired: true,
        mode: "print",
      }),
    );
  });

  it("route() returns GPU_PRINT_SAFEGUARD for gpu+determinism", async () => {
    const r = await route("gpu.inference.nvidia.tao", {
      determinismRequired: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, GPU_PRINT_SAFEGUARD_CODE);
  });

  it("route() returns GPU_PRINT_SAFEGUARD for gpu+mode print", async () => {
    const r = await route("gpu.compute.nvidia.cuda", { mode: "print" });
    assert.equal(r.ok, false);
    assert.equal(r.code, GPU_PRINT_SAFEGUARD_CODE);
  });

  it("route() allows cpu.rt4d.print", async () => {
    const r = await route("cpu.rt4d.print", {
      determinismRequired: true,
      modality: "scene",
    });
    assert.equal(r.ok, true);
    assert.equal(r.capabilityId, "cpu.rt4d.print");
  });

  it("checkGpuPrintSafeguard soft-denies without throw", () => {
    const denial = checkGpuPrintSafeguard("gpu.gen.nvidia.nim_flux", {
      intentLane: "print",
    });
    assert.equal(denial.ok, false);
    assert.equal(denial.code, GPU_PRINT_SAFEGUARD_CODE);
  });
});

describe("faceCreationAssist", () => {
  it("sceneToCharacterSpec is assistOnly draft", () => {
    const spec = sceneToCharacterSpec(
      { id: "sc1", kind: "SceneSpecification", objects: [] },
      { prompt: "hero" },
    );
    assert.equal(spec.assistOnly, true);
    assert.equal(spec.status, "declared");
    assert.ok(spec.face.blendshapes.length > 0);
    assert.equal(spec.objects, undefined);
    assert.equal(spec.fromScene.objectCount, 0);
  });

  it("runFaceCreationAssist dry-run is assistOnly", async () => {
    const out = await runFaceCreationAssist({
      prompt: "test face",
      dryRun: true,
      intentId: "face-1",
    });
    assert.equal(out.ok, true);
    assert.equal(out.assistOnly, true);
    assert.ok(out.characterSpec);
    assert.equal(out.characterSpec.assistOnly, true);
    assert.equal(out.nextStep, "human_curation_then_cpu.rt4d.print");
  });

  it("denies asPrintSoT", async () => {
    const out = await runFaceCreationAssist({ asPrintSoT: true });
    assert.equal(out.ok, false);
    assert.equal(out.code, "FACE_CREATION_PRINT_SOT_DENIED");
  });

  it("pipeline determinismRequired → cpu print handoff", async () => {
    const out = await runCharacterBuilderPipeline(
      { determinismRequired: true, intentId: "d1" },
      { route },
    );
    assert.equal(out.capabilityId, "cpu.rt4d.print");
    assert.equal(out.authority, "authoritative");
  });
});
