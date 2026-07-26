import type {
  ReplayBodyLike,
  ReplayBodySnapshot,
  ReplayRecord,
  ReplayRecordDraft,
} from "./ReplayRecord.js";

export interface ReplayTimeline {
  append(record: ReplayRecordDraft): void;
  get(index: number): ReplayRecord | undefined;
  length(): number;
}

function snapshotBody(body: ReplayBodyLike): ReplayBodySnapshot {
  return Object.freeze({
    id: body.id,
    mass: body.mass,
    position: Object.freeze({
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
    }),
    velocity: Object.freeze({
      x: body.velocity.x,
      y: body.velocity.y,
      z: body.velocity.z,
    }),
  });
}

/**
 * Deep-freeze a replay record so stored body position/velocity are scalar
 * snapshots, not shared live `Body` refs. Array `.slice()` alone is insufficient
 * because physics mutates body vectors in place after append.
 * Typed arrays (`vertices`, visualMod buffers) are left as-is.
 * Status: **partial** — Rule 5 integrity for plain body scalar fields.
 */
export function freezeReplayRecord(record: ReplayRecordDraft): ReplayRecord {
  const bodies = Object.freeze(
    record.inputs.bodies.map((body) => snapshotBody(body)),
  );
  const frozenInputs = Object.freeze({
    time: record.inputs.time,
    dt: record.inputs.dt,
    bodies,
    vertices: record.inputs.vertices,
  });
  const frozenVisualMod = Object.freeze({
    colors: record.visualMod.colors,
    scales: record.visualMod.scales,
    shaderParams: Object.freeze({ ...record.visualMod.shaderParams }),
  });
  return Object.freeze({
    tickIndex: record.tickIndex,
    time: record.time,
    dt: record.dt,
    inputs: frozenInputs,
    visualMod: frozenVisualMod,
  });
}

export class InMemoryReplayTimeline implements ReplayTimeline {
  private readonly records: ReplayRecord[] = [];

  append(record: ReplayRecordDraft): void {
    this.records.push(freezeReplayRecord(record));
  }

  get(index: number): ReplayRecord | undefined {
    return this.records[index];
  }

  length(): number {
    return this.records.length;
  }
}
