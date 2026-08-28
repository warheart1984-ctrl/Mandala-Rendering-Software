/**
 * Chamber Rosetta — shared-state adapters (partial).
 *
 * Projection compose lives in math4d/contract.js (do not rewrite).
 * This file maps chamber clock / actors / camera / provenance / outDir
 * between that contract and mandala/holography. It does not share Π.
 *
 * Canonical: docs/math4d/ROSETTA.md
 */

import {
  JOBS,
  ROSETTA_CLAIM,
  ROSETTA_HOLO_GPU_STATUS,
  ROSETTA_ID,
  ROSETTA_STATUS,
  SHARED_STATE_KEYS,
  buildSharedState,
  compareSharedState,
} from "../../../mrs/packages/renderer-core/src/math4d/rosetta.js";

export {
  JOBS,
  ROSETTA_CLAIM,
  ROSETTA_HOLO_GPU_STATUS,
  ROSETTA_ID,
  ROSETTA_STATUS,
  SHARED_STATE_KEYS,
  buildSharedState,
  compareSharedState,
};

export const ROSETTA_WIRE_STATUS = "partial";

/**
 * Map one holographic chamber frame onto the shared envelope.
 *
 * Observer / defect coordinates are lattice values, not Camera4D.
 * t is BulkSpacetimeEngine's clock. Copying t onto X.w is a clock
 * stamp — not temporal extrusion and not Π_{4→3}.
 *
 * @param {object} [input]
 * @param {number} [input.frame]
 * @param {object} [input.bulk]
 * @param {object|null} [input.observer] observerAt(...) or { observer, t }
 * @param {object|null} [input.sceneCard]
 * @param {string|null} [input.outDir]
 * @param {number} [input.width]
 * @param {number} [input.height]
 * @param {object} [input.provenance]
 */
export function mapHoloFrameToSharedState(input = {}) {
  const bulk = input.bulk ?? null;
  const t = Number(bulk?.state?.t ?? bulk?.t ?? input.t ?? 0);
  const obsWrap = input.observer ?? null;
  const obs = obsWrap?.observer ?? (obsWrap?.x != null ? obsWrap : null);
  const defect = obsWrap?.defect ?? null;

  const X = {
    x: Number(obs?.x ?? defect?.x ?? 0),
    y: Number(obs?.y ?? defect?.y ?? 0),
    z: Number(obs?.z ?? defect?.z ?? 0),
    w: t,
  };

  return buildSharedState({
    X,
    t,
    timeAsW: {
      value: t,
      usedBy: "holo-clock-only",
      extrusion: false,
    },
    camera: {
      kind: "movie-lane-observer",
      observer: obs,
      defect,
      width: input.width ?? null,
      height: input.height ?? null,
      notCamera4D: true,
    },
    provenance: {
      renderIdentity: `chamber-${input.frame ?? 0}`,
      worldId: input.sceneCard?.id ?? input.sceneCard?.name ?? null,
      timelineId: input.sceneCard?.id ?? null,
      frameIndex: input.frame ?? 0,
      timeSeconds: t,
      ...(input.provenance && typeof input.provenance === "object"
        ? input.provenance
        : {}),
    },
    outDir: input.outDir ?? null,
    source: "holography",
  });
}

/**
 * Map a projection-chamber frame onto the same envelope.
 * Does not call transformPipeline.
 */
export function mapProjectionFrameToSharedState(input = {}) {
  const X = input.X ?? input.worldPoint ?? { x: 0, y: 0, z: 0, w: 0 };
  const t = Number(input.t ?? X.w ?? 0);
  const cam = input.camera ?? null;

  return buildSharedState({
    X,
    t,
    timeAsW: {
      value: Number(X.w ?? t),
      usedBy: "projection",
      extrusion: input.extrusion === true,
    },
    camera: cam
      ? {
          kind: "camera4d",
          position: cam.position ?? cam.C ?? null,
          notMovieLane: true,
        }
      : { kind: "camera4d", position: null, notMovieLane: true },
    provenance: input.provenance ?? {},
    outDir: input.outDir ?? null,
    source: "projection",
  });
}
