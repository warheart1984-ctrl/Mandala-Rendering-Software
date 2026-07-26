import type { ReplayRecord } from "./ReplayRecord.js";

export interface ReplayTimeline {
  append(record: ReplayRecord): void;
  get(index: number): ReplayRecord | undefined;
  length(): number;
}

export class InMemoryReplayTimeline implements ReplayTimeline {
  private readonly records: ReplayRecord[] = [];

  append(record: ReplayRecord): void {
    this.records.push(record);
  }

  get(index: number): ReplayRecord | undefined {
    return this.records[index];
  }

  length(): number {
    return this.records.length;
  }
}
