import type { VisualMod } from "../substrate/VisualMod.js";

/**
 * Scalar snapshot of a body at record time.
 * Replay records must not retain live `Body` refs — physics mutates those in place.
 */
export interface ReplayBodySnapshot {
  readonly id: string;
  readonly mass: number;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly velocity: Readonly<{ x: number; y: number; z: number }>;
}

/** Frozen tick inputs stored on the timeline (bodies are snapshots, not live Body API). */
export interface ReplayRecordInputs {
  readonly time: number;
  readonly dt: number;
  readonly bodies: readonly ReplayBodySnapshot[];
  readonly vertices: Float32Array;
}

/** Body-like input accepted by `freezeReplayRecord` / `append` before deep-copy. */
export interface ReplayBodyLike {
  readonly id: string;
  readonly mass: number;
  readonly position: { x: number; y: number; z: number };
  readonly velocity: { x: number; y: number; z: number };
}

/** Pre-freeze append payload: live Body refs are OK; freeze deep-copies scalars. */
export interface ReplayRecordDraft {
  tickIndex: number;
  time: number;
  dt: number;
  inputs: {
    time: number;
    dt: number;
    bodies: readonly ReplayBodyLike[];
    vertices: Float32Array;
  };
  visualMod: VisualMod;
}

export interface ReplayRecord {
  tickIndex: number;
  time: number;
  dt: number;
  inputs: ReplayRecordInputs;
  visualMod: VisualMod;
}
