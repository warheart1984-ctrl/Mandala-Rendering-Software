import type { ReplayRecord } from "../replay/ReplayRecord.js";

export interface MandalaNode {
  id: string;
  position: [number, number];
  activation: number;
  channel: string;
}

export interface MandalaLattice {
  nodes: MandalaNode[];
  edges: [string, string][];
}

export interface MandalaMapping {
  mapReplayToLattice(replay: ReplayRecord[]): MandalaLattice;
}

/**
 * Pure mapping helper — **partial** (unit-tested; visualizer service is declared-only).
 */
export class DefaultMandalaMapping implements MandalaMapping {
  mapReplayToLattice(replay: ReplayRecord[]): MandalaLattice {
    const nodes: MandalaNode[] = replay.map((r) => ({
      id: `tick-${r.tickIndex}`,
      position: [r.time, r.visualMod.shaderParams["glyphIntensity"] ?? 0],
      activation: r.visualMod.shaderParams["glyphCount"] ?? 0,
      channel: "engine3d",
    }));
    const edges: [string, string][] = [];
    for (let i = 1; i < nodes.length; i++) {
      edges.push([nodes[i - 1]!.id, nodes[i]!.id]);
    }
    return { nodes, edges };
  }
}
