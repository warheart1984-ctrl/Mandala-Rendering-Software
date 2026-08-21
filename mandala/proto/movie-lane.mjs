/**
 * Movie Lane — observation path, editing, temporal projection.
 *
 * Movie Lane does NOT own time. Simulation Chamber owns temporal evolution.
 * Movie Lane chooses how an observer travels through certified spacetime.
 *
 * Status: **partial**
 */

export const MOVIE_LANE_STATUS = "partial";

export function observerAt(state, t) {
  if (t < 0 || t >= state.temporal.filled) {
    throw new Error(`Movie Lane: no certified history at t=${t}`);
  }
  const path = state.temporal.observerPath[t];
  const defect = state.temporal.defectWorldline[t];
  return {
    organ: "MovieLane",
    ownsTime: false,
    t,
    observer: { ...path },
    defect: { ...defect },
    reconstructed: true,
    reSimulatedFromZero: false,
  };
}

/**
 * Author an observer path through already-certified slices.
 * Does not call Chamber. Writes only observerPath / live observer when t matches.
 */
export function setObserverPath(state, points) {
  for (const p of points) {
    if (p.t < 0 || p.t >= state.temporal.filled) {
      throw new Error(`cannot place observer at uncertified t=${p.t}`);
    }
    state.temporal.observerPath[p.t] = {
      x: p.x | 0,
      y: p.y | 0,
      z: p.z | 0,
      t: p.t | 0,
    };
  }
  const cur = state.temporal.observerPath[state.t];
  if (cur) state.observer = { ...cur };
  return { organ: "MovieLane", wrote: points.length, ownsTime: false };
}

export function defaultFlythroughPath(nt, shape) {
  const pts = [];
  for (let t = 0; t < nt; t++) {
    const a = (t / Math.max(1, nt - 1)) * Math.PI * 2;
    pts.push({
      t,
      x: Math.round(shape.nx * 0.5 + Math.cos(a) * (shape.nx * 0.25)),
      y: Math.round(shape.ny * 0.5 + Math.sin(a) * (shape.ny * 0.25)),
      z: Math.round(shape.nz * 0.55 + Math.sin(a * 0.5) * (shape.nz * 0.15)),
    });
  }
  return pts;
}
