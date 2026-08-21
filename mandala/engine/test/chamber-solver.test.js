import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runCinematicProtoSolver,
  walkOnGradV,
  applyDefectMotionToActors,
  CHAMBER_SOLVER_ID,
} from "../chamber/solver-hook.mjs";
import { INTEGRATOR_DRIVER } from "../physics/index.mjs";
import { createUniverse, project, createImage } from "../sdk/index.mjs";

describe("chamber solver hook v0.4", () => {
  it("advances certified t via physics; Movie Lane does not own time", () => {
    const r = runCinematicProtoSolver({ seed: 7, tEnd: 3, beatDuration: 3 });
    assert.equal(r.solver, CHAMBER_SOLVER_ID);
    assert.equal(r.movieLaneOwnsTime, false);
    assert.equal(r.motionDriverActual, INTEGRATOR_DRIVER);
    assert.equal(r.cinematicFallback, "pose_interpolation");
    assert.equal(r.committedSteps, 3);
    assert.equal(r.observer.ownsTime, false);
    assert.equal(r.renderDidNotMutate, true);
    assert.ok(r.hash.length >= 32);
    assert.ok(r.defectWorldline.length >= 2);
  });

  it("defect/actor position changes when ∇V is nonzero and stays put at ground state", () => {
    const ground = walkOnGradV({ flat: true });
    assert.ok(ground.gMag < 1e-12);
    assert.equal(ground.moved, false);
    assert.equal(ground.next.x, ground.defect.x);
    assert.equal(ground.next.y, ground.defect.y);
    assert.equal(ground.next.z, ground.defect.z);

    const slope = walkOnGradV({ flat: false, wellAt: [22, 16, 16], defectAt: [16, 16, 16] });
    assert.ok(slope.gMag > 0);
    assert.equal(slope.moved, true);

    const rest = [-1.2, 1.35, 0.6, 0];
    const actorMove = { id: "aven", position: [...rest], _solverRest: [...rest] };
    applyDefectMotionToActors([actorMove], slope.next, slope.defect);
    assert.notDeepEqual(actorMove.position, rest);
    assert.equal(actorMove.notGradV, false);
    assert.equal(actorMove.motionDriverActual, INTEGRATOR_DRIVER);

    const actorStay = { id: "aven", position: [...rest], _solverRest: [...rest] };
    applyDefectMotionToActors([actorStay], ground.next, ground.defect);
    assert.deepEqual(actorStay.position, rest);

    const u = createUniverse({ seed: 7 });
    const hash = u.state.hash;
    const image = createImage(8, 8);
    project(u, image);
    assert.equal(u.state.hash, hash);
  });
});
