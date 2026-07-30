/**
 * CL-Gen / opencl.gen — constitutional wrap + scene mapping tests.
 * STATUS: **partial** (wrap + mapping unit-tested; live OpenCL host-dependent)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyClGenConstitutionalWrap,
  buildClGenLawfulEvidence,
  buildClGenIntent,
  CL_GEN_PROVIDER,
  CL_GEN_CAPABILITY,
} from "../router/modules/gpu/amd/clGenConstitutionalWrap.js";
import {
  detectOpenClGenAvailable,
  engine3dContextToClGenScene,
  ADAPTER_ID,
} from "../router/modules/gpu/amd/openclGenProvider.js";

describe("opencl.gen / CL-Gen", () => {
  it("exports provider and capability ids", () => {
    assert.equal(CL_GEN_PROVIDER, "opencl.gen");
    assert.equal(CL_GEN_CAPABILITY, "image.gen.opencl");
    assert.equal(ADAPTER_ID, "sx.adapter.image.gen.opencl");
  });

  it("detects script presence unless disabled", () => {
    assert.equal(detectOpenClGenAvailable({}, { openclGenAvailable: true }), true);
    assert.equal(
      detectOpenClGenAvailable(
        { IMAGE_GEN_DISABLE_OPENCL: "1" },
        { openclGenAvailable: true },
      ),
      false,
    );
    assert.equal(
      detectOpenClGenAvailable({}, { openclGenAvailable: false }),
      false,
    );
  });

  it("maps Engine3D-ish context into CL-Gen scene (partial)", () => {
    const scene = engine3dContextToClGenScene(
      {
        camera: { eye: [1, 2, 3], look: [0, 1, 0], fovDeg: 40 },
        ambient: [0.1, 0.1, 0.1],
        worldContext: "interior.dim-room",
      },
      {
        camera: {},
        ambient: [0, 0, 0],
        lights: [],
        spheres: [{ center: [0, 0.5, 0], radius: 0.5, albedo: [1, 0, 0], emissive: [0, 0, 0] }],
        planes: [],
        post: {},
      },
    );
    assert.deepEqual(scene.camera.eye, [1, 2, 3]);
    assert.equal(scene.camera.fovDeg, 40);
    assert.deepEqual(scene.ambient, [0.1, 0.1, 0.1]);
    assert.equal(scene.worldContext, "interior.dim-room");
    assert.equal(scene.spheres.length, 1);
  });

  it("Amendment VII/VIII wrap allows lawful dim-room evidence", async () => {
    const wrap = await applyClGenConstitutionalWrap({
      intent: buildClGenIntent({ intentId: "intent-cl-gen-test" }),
      evidence: buildClGenLawfulEvidence({ evidenceId: "ev-cl-gen-test" }),
    });
    assert.equal(wrap.ok, true);
    assert.equal(wrap.halted, false);
    assert.equal(wrap.provider, "opencl.gen");
    assert.ok(wrap.gates.some((g) => g.amendment === "VII" && g.ok));
    assert.ok(wrap.gates.some((g) => g.amendment === "VIII" && g.ok));
  });

  it("wrap can be skipped explicitly", async () => {
    const wrap = await applyClGenConstitutionalWrap({
      skipConstitutional: true,
    });
    assert.equal(wrap.ok, true);
    assert.equal(wrap.skipped, true);
  });
});
