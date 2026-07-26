import type { ReplayRecord } from "./ReplayRecord.js";

export interface ReplayTimeline {
  append(record: ReplayRecord): void;
  get(index: number): ReplayRecord | undefined;
  length(): number;
}

/**
 * Shallow-freeze a replay record (and nested plain objects/arrays) so
 * post-append mutation throws in strict mode. Typed arrays are left as-is
 * (Object.freeze does not make their contents immutable).
 * Status: **partial** — Rule 5 integrity for plain fields.
 */
export function freezeReplayRecord(record: ReplayRecord): ReplayRecord {
  const frozenInputs = Object.freeze({
    time: record.inputs.time,
    dt: record.inputs.dt,
    bodies: Object.freeze(record.inputs.bodies.slice()) as ReplayRecord["inputs"]["bodies"],
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
  }) as ReplayRecord;
}

export class InMemoryReplayTimeline implements ReplayTimeline {
  private readonly records: ReplayRecord[] = [];

  append(record: ReplayRecord): void {
    this.records.push(freezeReplayRecord(record));
  }

  get(index: number): ReplayRecord | undefined {
    return this.records[index];
  }

  length(): number {
    return this.records.length;
  }
}
