/**
 * Cinematic Chamber ↔ proto physics hook (roadmap v0.4).
 *
 * Default cinematic solver is mandala-proto: certified −∇φ defect walk is
 * mapped onto actor world positions. `--solver pose` restores beat lerp.
 * Beat clock / duration maps to Movie Lane observer path (does not own time).
 *
 * Status: **partial**
 */

import { MOTION_DRIVER_ACTUAL } from "../../substrate/chamber-hook.mjs";
import { INTEGRATOR_DRIVER } from "../physics/index.mjs";
import { createUniverse, stepPhysics, observe, project, createImage } from "../sdk/index.mjs";
import { defaultFlythroughPath, setObserverPath } from "../../proto/movie-lane.mjs";
import { computeGradientInto, walkDefect } from "../../proto/cpu-reference.mjs";
import { applyWell } from "../../proto/certified-state.mjs";
import { PROTO_SHAPE } from "../../proto/constitution.mjs";

export const CHAMBER_SOLVER_STATUS = "partial";
export const CHAMBER_SOLVER_ID = "mandala-proto";
export const CHAMBER_SOLVER_POSE = "pose";
export const CHAMBER_SOLVER_DEFAULT = CHAMBER_SOLVER_ID;
export const DEFECT_WORLD_SCALE = 0.25;

export function latticeDelta(defect, origin) {
  return {
    dx: (defect.x - origin.x) * DEFECT_WORLD_SCALE,
    dy: (defect.y - origin.y) * DEFECT_WORLD_SCALE,
    dz: (defect.z - origin.z) * DEFECT_WORLD_SCALE,
  };
}

export function sampleWorldline(worldline, tNorm) {
  if (!worldline?.length) return null;
  const i = Math.min(
    worldline.length - 1,
    Math.max(0, Math.round(tNorm * (worldline.length - 1))),
  );
  return worldline[i];
}

/**
 * Translate actors in world space by certified defect delta from rest.
 * Rest pose comes from the scene card (salt-atlas spawn is preserved).
 */
export function applyDefectMotionToActors(actors, defect, originDefect) {
  const d = latticeDelta(defect, originDefect);
  for (const actor of actors) {
    const rest = actor._solverRest || actor.position || [0, 0, 0, 0];
    if (!actor._solverRest) actor._solverRest = [...rest];
    actor.position = [
      actor._solverRest[0] + d.dx,
      actor._solverRest[1] + d.dy,
      actor._solverRest[2] + d.dz,
      actor._solverRest[3] || 0,
    ];
    actor.motionDriverActual = INTEGRATOR_DRIVER;
    actor.notGradV = false;
  }
  return actors;
}

/**
 * Proof helper: walk one cell on −∇φ. Flat φ stays put; offset well moves.
 */
export function walkOnGradV({ flat = false, wellAt = [22, 16, 16], defectAt = [16, 16, 16] } = {}) {
  const shape = PROTO_SHAPE;
  const phi = new Float32Array(shape.cellCount);
  const vector = new Float32Array(shape.cellCount * 3);
  const defect = {
    type: "local_rupture",
    x: defectAt[0],
    y: defectAt[1],
    z: defectAt[2],
  };
  if (!flat) {
    applyWell(phi, wellAt[0], wellAt[1], wellAt[2], 1.5, 2.5, shape, +1);
  }
  computeGradientInto(phi, vector, shape);
  let gMag = 0;
  const i = (defect.x + defect.y * shape.nx + defect.z * shape.nx * shape.ny) * 3;
  gMag = Math.hypot(vector[i], vector[i + 1], vector[i + 2]);
  const next = walkDefect(defect, vector, shape);
  return { defect, next, gMag, moved: next.x !== defect.x || next.y !== defect.y || next.z !== defect.z };
}

export function runCinematicProtoSolver({
  seed = 7,
  tEnd = 8,
  beatDuration = 3,
} = {}) {
  const universe = createUniverse({ seed });
  const origin = { ...universe.state.defect };
  const receipts = [];
  const target = Math.min(tEnd, universe.state.shape.nt - 1);
  while (universe.state.t < target) {
    const r = stepPhysics(universe);
    receipts.push({
      committed: r.committed,
      accepted: r.decision?.accepted,
      t: universe.state.t,
      hash: r.hash,
      defect: { ...universe.state.defect },
    });
    if (!r.committed) break;
  }
  const path = defaultFlythroughPath(universe.state.temporal.filled, universe.state.shape);
  setObserverPath(universe.state, path);
  const viewT = Math.max(0, universe.state.temporal.filled - 1);
  const view = observe(universe, viewT);
  const defectWorldline = (universe.state.temporal.defectWorldline || []).slice(
    0,
    universe.state.temporal.filled,
  );
  const dummy = {
    id: "defect-0",
    position: [0, 2, 0, 0],
    _solverRest: [0, 2, 0, 0],
  };
  const last = defectWorldline[defectWorldline.length - 1] || origin;
  applyDefectMotionToActors([dummy], last, origin);

  const hashBeforeProject = universe.state.hash;
  const image = createImage(8, 8);
  project(universe, image);
  const hashAfterProject = universe.state.hash;

  return {
    solver: CHAMBER_SOLVER_ID,
    status: CHAMBER_SOLVER_STATUS,
    motionDriverPhysics: INTEGRATOR_DRIVER,
    motionDriverActual: INTEGRATOR_DRIVER,
    cinematicFallback: MOTION_DRIVER_ACTUAL,
    cinematicFallbackNote:
      "Default cinematic path uses mandala-proto defect transport for actor world positions. Pass --solver pose for beat lerp / notGradV.",
    movieLaneOwnsTime: false,
    beatDuration,
    seed,
    constitutionId: universe.state.constitutionId,
    filled: universe.state.temporal.filled,
    hash: universe.state.hash,
    committedSteps: receipts.filter((x) => x.committed).length,
    receipts,
    observer: view,
    defectOrigin: origin,
    defectWorldline,
    actorSample: { id: dummy.id, rest: dummy._solverRest, position: dummy.position },
    renderDidNotMutate: hashBeforeProject === hashAfterProject,
  };
}
