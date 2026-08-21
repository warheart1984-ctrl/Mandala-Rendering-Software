import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllQuads } from "../models/topology.mjs";
import { requiredBoneGroups } from "../models/armature.mjs";
import { buildCharacterAsset } from "../models/character.mjs";
import { runCharacterSim } from "../sim/run-sim.mjs";
import { buildPipeline } from "../tools/pipeline.mjs";
import { inspectGlb } from "../tools/import-glb.mjs";
import { exportFbx, FBX_STATUS } from "../tools/export-fbx.mjs";
import { PRESETS } from "../renders/presets.mjs";

test("quad topology and joint loops", () => {
  const asset = buildCharacterAsset({ id: "t", species: "anthro" });
  assert.equal(isAllQuads(asset.mesh), true);
  assert.ok(asset.mesh.faceCount >= 64);
  assert.equal(asset.topo.ok, true);
  assert.ok(asset.mesh.loops.hips);
  assert.ok(asset.mesh.loops.chest);
  assert.ok(asset.mesh.loops.shoulders);
});

test("armature has spine, shoulders, hips, tail, fingers", () => {
  const asset = buildCharacterAsset({ id: "t", species: "human" });
  const g = requiredBoneGroups(asset.armature);
  assert.equal(g.spine, true);
  assert.equal(g.shoulders, true);
  assert.equal(g.hips, true);
  assert.equal(g.tail, true);
  assert.equal(g.fingers, true);
  assert.ok(asset.armature.bones.length >= 40);
});

test("sim always runs and moves cloth", () => {
  const asset = buildCharacterAsset({ id: "t", species: "anthro" });
  const sim = runCharacterSim(asset, { frames: 8 });
  assert.equal(sim.ran, true);
  assert.equal(sim.cloakMoved, true);
  assert.ok(sim.volumes.some((v) => v.id === "hips"));
  assert.ok(sim.volumes.some((v) => v.id === "chest"));
  assert.ok(sim.hairCurves.length >= 4);
});

test("pipeline writes wire / rigged / final GLB+PNG from one asset", () => {
  const dir = mkdtempSync(join(tmpdir(), "char-pipe-"));
  const { paths, manifest, asset } = buildPipeline({
    id: "char",
    species: "anthro",
    outDir: dir,
    width: 128,
    simFrames: 6,
  });
  assert.equal(manifest.presets.includes("wire_sim"), true);
  assert.equal(manifest.presets.includes("beauty_sim"), true);
  for (const p of [
    paths.char_wire_glb, paths.char_wire_png,
    paths.char_rigged_glb, paths.char_rig_png,
    paths.char_final_glb, paths.char_final_png,
  ]) {
    assert.equal(existsSync(p), true, p);
  }
  const pngMagic = Buffer.from([137, 80, 78, 71]);
  assert.ok(readFileSync(paths.char_wire_png).subarray(0, 4).equals(pngMagic));
  assert.ok(readFileSync(paths.char_rig_png).subarray(0, 4).equals(pngMagic));
  assert.ok(readFileSync(paths.char_final_png).subarray(0, 4).equals(pngMagic));

  const wire = inspectGlb(paths.char_wire_glb);
  const rig = inspectGlb(paths.char_rigged_glb);
  const fin = inspectGlb(paths.char_final_glb);
  assert.equal(wire.extras.stage, "wire");
  assert.equal(rig.hasSkin, true);
  assert.equal(fin.hasSkin, true);
  assert.equal(wire.extras.characterId, "char");
  assert.equal(asset.mesh.vertexCount, buildCharacterAsset({ id: "char", species: "anthro" }).mesh.vertexCount);
});

test("FBX is declared, not faked", () => {
  assert.equal(FBX_STATUS, "declared");
  assert.equal(exportFbx({}, "final").status, "declared");
});

test("render presets exist", () => {
  assert.ok(PRESETS.wire_sim);
  assert.ok(PRESETS.beauty_sim);
  assert.ok(PRESETS.rig_view);
});
