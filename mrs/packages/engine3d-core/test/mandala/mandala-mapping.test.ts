import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultMandalaMapping } from "../../src/mandala/MandalaMapping.js";
import type { ReplayRecord } from "../../src/replay/ReplayRecord.js";

describe("mandala-mapping", () => {
  it("maps replay ticks to lattice nodes/edges", () => {
    const mapping = new DefaultMandalaMapping();
    const replay: ReplayRecord[] = [
      {
        tickIndex: 0,
        time: 0,
        dt: 0.016,
        inputs: {
          time: 0,
          dt: 0.016,
          bodies: [],
          vertices: new Float32Array(),
        },
        visualMod: {
          colors: new Float32Array(),
          scales: new Float32Array(),
          shaderParams: { glyphCount: 2, glyphIntensity: 0.5 },
        },
      },
      {
        tickIndex: 1,
        time: 0.016,
        dt: 0.016,
        inputs: {
          time: 0.016,
          dt: 0.016,
          bodies: [],
          vertices: new Float32Array(),
        },
        visualMod: {
          colors: new Float32Array(),
          scales: new Float32Array(),
          shaderParams: { glyphCount: 3, glyphIntensity: 0.25 },
        },
      },
    ];
    const lattice = mapping.mapReplayToLattice(replay);
    assert.equal(lattice.nodes.length, 2);
    assert.equal(lattice.edges.length, 1);
    assert.deepEqual(lattice.edges[0], ["tick-0", "tick-1"]);
  });
});
