/**
 * Face rig + timeline tests (fixture GLB).
 * Status: **enforced** against mrs/assets/human/HumanFaceRigged.glb
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  applyFacePose,
  defaultFaceRigConfig,
  defaultFaceSmileTimeline,
  defaultFaceRiggedGlbPath,
  DefaultWorld3D,
  DefaultWorldMesh,
  detectFaceAssetKind,
  facePoseFromTimeline,
  loadFaceRig,
  resolveHumanFacePath,
  validateFaceRig,
  renderEngine3dStill,
} from "../../src/index.js";

const FIXTURE = defaultFaceRiggedGlbPath();

describe("face rig fixture", () => {
  it("fixture GLB exists", () => {
    assert.ok(existsSync(FIXTURE), `missing fixture at ${FIXTURE}`);
  });

  it("loads and validates required bones/blendshapes", () => {
    const loaded = loadFaceRig(defaultFaceRigConfig(FIXTURE));
    assert.equal(loaded.assetKind, "fixture");
    const check = validateFaceRig(loaded.rig, loaded.config);
    assert.equal(check.ok, true);
    assert.equal(check.missingBones.length, 0);
    assert.equal(check.missingBlendshapes.length, 0);
  });

  it("strict mode rejects missing blendshape names", () => {
    const loaded = loadFaceRig({
      ...defaultFaceRigConfig(FIXTURE),
      strict: false,
    });
    const bad = validateFaceRig(loaded.rig, {
      ...loaded.config,
      blendshapes: ["Smile", "NotARealMorph"],
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.missingBlendshapes.includes("NotARealMorph"));
  });

  it("applyFacePose with Smile changes vertices", () => {
    const loaded = loadFaceRig(defaultFaceRigConfig(FIXTURE));
    const neutral = applyFacePose(loaded, { time: 0, bones: {}, expressions: [] });
    const smiled = applyFacePose(loaded, {
      time: 1,
      bones: {},
      expressions: [{ name: "Smile", weight: 1 }],
    });
    const a = neutral.meshes[0]!.vertices;
    const b = smiled.meshes[0]!.vertices;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    assert.ok(diff > 0.01, `expected morph delta, got ${diff}`);
  });

  it("facePoseFromTimeline lerps Smile", () => {
    const tl = defaultFaceSmileTimeline({ duration: 1, fps: 4 });
    const mid = facePoseFromTimeline(tl, 0.5);
    const smile = mid.expressions.find((e) => e.name === "Smile");
    assert.ok(smile);
    assert.ok(Math.abs(smile!.weight - 0.35) < 1e-9);
  });

  it("renderEngine3dStill with face fixture sets face_rig", () => {
    const dir = mkdtempSync(join(tmpdir(), "e3d-face-"));
    try {
      const result = renderEngine3dStill({
        outDir: dir,
        width: 64,
        height: 48,
        humanGlb: FIXTURE,
        preferFaceFixture: false,
      });
      assert.equal(result.structureRecord.structure_source, "engine3d_raster");
      assert.equal(result.structureRecord.face_rig, true);
      assert.equal(result.structureRecord.face_asset, "fixture");
      const detail = result.structureRecord.face_rig_detail;
      assert.ok(detail, "expected face_rig_detail on face still");
      assert.equal(detail!.armature_name, "Armature");
      assert.ok(detail!.mesh_path.includes("HumanFaceRigged.glb"));
      assert.equal(detail!.asset_kind, "fixture");
      for (const bone of [
        "Head",
        "Jaw",
        "LeftEye",
        "RightEye",
        "LeftBrow",
        "RightBrow",
        "UpperLip",
        "LowerLip",
      ]) {
        assert.ok(detail!.bones.includes(bone), `missing bone ${bone}`);
      }
      for (const morph of [
        "Smile",
        "Frown",
        "BlinkLeft",
        "BlinkRight",
        "Squint",
        "WideEyes",
        "MouthOpen",
        "MouthNarrow",
      ]) {
        assert.ok(detail!.blendshapes.includes(morph), `missing morph ${morph}`);
      }
      const pose = result.structureRecord.face_pose;
      assert.ok(pose, "expected face_pose on face still");
      assert.equal(pose!.time, 0);
      assert.deepEqual(pose!.bones, {});
      assert.deepEqual(pose!.expressions, []);
      assert.ok(existsSync(result.beautyPath));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("operator OPERATOR_ASSETS_ROOT override reports face_asset operator", () => {
    const prev = process.env.OPERATOR_ASSETS_ROOT;
    const opRoot = mkdtempSync(join(tmpdir(), "e3d-op-assets-"));
    const humanDir = join(opRoot, "human");
    mkdirSync(humanDir, { recursive: true });
    const opGlb = join(humanDir, "HumanFaceRigged.glb");
    copyFileSync(FIXTURE, opGlb);
    process.env.OPERATOR_ASSETS_ROOT = opRoot;
    const stillDir = mkdtempSync(join(tmpdir(), "e3d-face-op-"));
    try {
      const resolved = resolveHumanFacePath("HumanFaceRigged");
      assert.equal(resolved.face_asset, "operator");
      assert.equal(resolved.path, opGlb);
      assert.equal(detectFaceAssetKind(resolved.path), "operator");

      const loaded = loadFaceRig(defaultFaceRigConfig(resolved.path));
      assert.equal(loaded.assetKind, "operator");

      const result = renderEngine3dStill({
        outDir: stillDir,
        width: 64,
        height: 48,
        preferFaceFixture: true,
      });
      assert.equal(result.structureRecord.face_rig, true);
      assert.equal(result.structureRecord.face_asset, "operator");
      assert.equal(result.structureRecord.face_rig_detail?.asset_kind, "operator");
      assert.ok(
        result.structureRecord.face_rig_detail?.mesh_path.includes("HumanFaceRigged.glb"),
      );
      assert.ok(result.structureRecord.face_pose);
    } finally {
      if (prev === undefined) delete process.env.OPERATOR_ASSETS_ROOT;
      else process.env.OPERATOR_ASSETS_ROOT = prev;
      rmSync(opRoot, { recursive: true, force: true });
      rmSync(stillDir, { recursive: true, force: true });
    }
  });

  it("World3D.addFaceRig + applyFacePose binds materials and deforms", () => {
    const mesh = new DefaultWorldMesh(
      new Float32Array(9),
      new Float32Array(9),
      new Uint32Array([0, 1, 2]),
    );
    const world = new DefaultWorld3D(mesh);
    world.addFaceRig(defaultFaceRigConfig(FIXTURE));
    assert.ok(world.face);
    assert.ok(world.materials.face_skin);
    assert.ok(world.materials.eye);
    assert.ok(world.materials.mouth);
    const pose = facePoseFromTimeline(defaultFaceSmileTimeline({ duration: 1, fps: 4 }), 1);
    const deformed = world.applyFacePose(pose);
    assert.ok(deformed);
    assert.ok(deformed!.meshes.length > 0);
  });

  it("defaultCamera keeps fallbacks when world camera omits eye/lookAt", async () => {
    const { defaultCamera, DEFAULT_BRIDGE_CAMERA } = await import("../../src/index.js");
    const cam = defaultCamera(64, 48, {
      id: "world-cam",
      eye: undefined,
      lookAt: undefined,
      up: undefined,
    } as never);
    assert.equal(cam.id, "world-cam");
    assert.deepEqual(cam.eye, [
      DEFAULT_BRIDGE_CAMERA.eye[0],
      DEFAULT_BRIDGE_CAMERA.eye[1],
      DEFAULT_BRIDGE_CAMERA.eye[2],
    ]);
    assert.deepEqual(cam.lookAt, [
      DEFAULT_BRIDGE_CAMERA.lookAt[0],
      DEFAULT_BRIDGE_CAMERA.lookAt[1],
      DEFAULT_BRIDGE_CAMERA.lookAt[2],
    ]);
  });
});

// silence unused in some bundlers
void dirname;
void fileURLToPath;
