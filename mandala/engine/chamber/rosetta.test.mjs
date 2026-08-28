import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOBS,
  ROSETTA_HOLO_GPU_STATUS,
  ROSETTA_STATUS,
  SHARED_STATE_KEYS,
  compareSharedState,
  mapHoloFrameToSharedState,
  mapProjectionFrameToSharedState,
} from "./rosetta.mjs";

describe("Chamber Rosetta", () => {
  it("names compose, compiler, and Rosetta as three jobs", () => {
    assert.equal(JOBS.compose.job, "compose");
    assert.equal(JOBS.compose.contractId, "math4d.projection.v1");
    assert.equal(JOBS.compose.status, "enforced");
    assert.equal(JOBS.compiler.projection.status, "enforced");
    assert.equal(JOBS.compiler.holography.status, "partial");
    assert.equal(JOBS.compiler.holography.gpu, "declared");
    assert.equal(JOBS.rosetta.status, "partial");
    assert.equal(JOBS.rosetta.holographicIsNotPi, true);
    assert.equal(JOBS.rosetta.math4dIsNotHijCompiler, true);
  });

  it("maps holo chamber clock, observer, provenance, outDir", () => {
    const shared = mapHoloFrameToSharedState({
      frame: 3,
      bulk: { state: { t: 7 } },
      observer: { observer: { x: 1, y: 2, z: 3, t: 7 }, defect: { x: 4, y: 5, z: 6 } },
      sceneCard: { id: "scene-salt-atlas" },
      outDir: "/tmp/holo-out",
      width: 384,
      height: 512,
    });

    assert.equal(shared.status, ROSETTA_STATUS);
    assert.equal(shared.source, "holography");
    assert.equal(shared.t, 7);
    assert.equal(shared.X.x, 1);
    assert.equal(shared.X.y, 2);
    assert.equal(shared.X.z, 3);
    assert.equal(shared.X.w, 7);
    assert.equal(shared.timeAsW.usedBy, "holo-clock-only");
    assert.equal(shared.timeAsW.extrusion, false);
    assert.equal(shared.camera.kind, "movie-lane-observer");
    assert.equal(shared.camera.notCamera4D, true);
    assert.equal(shared.provenance.renderIdentity, "chamber-3");
    assert.equal(shared.provenance.worldId, "scene-salt-atlas");
    assert.equal(shared.outDir, "/tmp/holo-out");
    assert.equal(shared.sharePi, false);
    for (const key of SHARED_STATE_KEYS) {
      assert.ok(key in shared, `missing ${key}`);
    }
  });

  it("does not treat holography observer as Camera4D or as Π", () => {
    const holo = mapHoloFrameToSharedState({
      frame: 0,
      bulk: { t: 2 },
      observer: { observer: { x: 8, y: 0, z: 0 } },
    });
    const proj = mapProjectionFrameToSharedState({
      X: { x: 8, y: 0, z: 0, w: 2 },
      t: 2,
      camera: { position: { x: 0, y: 0, z: 0, w: 0 } },
      extrusion: true,
    });
    const cmp = compareSharedState(holo, proj);
    assert.equal(cmp.shareClock, true);
    assert.equal(cmp.sharePi, false);
    assert.equal(holo.camera.kind, "movie-lane-observer");
    assert.equal(proj.camera.kind, "camera4d");
    assert.equal(proj.timeAsW.extrusion, true);
    assert.equal(holo.timeAsW.extrusion, false);
    assert.equal(ROSETTA_HOLO_GPU_STATUS, "declared");
  });
});
