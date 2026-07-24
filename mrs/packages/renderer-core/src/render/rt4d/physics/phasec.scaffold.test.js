import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WaveField,
  CurvatureField,
  ForceField,
  fromWorldWaveConfig,
} from "./index.js";
import { MultiGpuArbitrator } from "../../rhi/MultiGpuArbitrator.js";
import { HdrCanvas } from "../gallery/HdrCanvas.js";
import { stepWaveField } from "./WaveWavefrontAdapter.js";
import { WAVE_UPDATE_WGSL } from "../gpu/wavefront/kernels/index.js";
import { bindWorld } from "../world/WorldBinding.js";
import { prepareWorld } from "../WorldOrchestrator.js";
import { FrameLoop } from "../FrameLoop.js";

function minimalWorld(overrides = {}) {
  return {
    version: "2.0",
    metadata: { name: "test" },
    lineage: { worldId: "w-test" },
    geometry: {},
    materials: {},
    render: { engineMode: "wavefront" },
    ...overrides,
  };
}

describe("Phase C scaffolding", () => {
  it("WaveField.step changes state after impulse", () => {
    const wf = new WaveField({ gridSize: { nx: 16, ny: 16, nz: 16 }, c: 1, dt: 0.05 });
    wf.impulse(8, 8, 8, 1);
    assert.ok(wf.sampleNormalized(8, 8, 8) > 0);
    wf.step();
    const center = wf.sampleNormalized(8, 8, 8);
    const neighbor = wf.sampleNormalized(9, 8, 8);
    assert.ok(center !== 0 || neighbor !== 0);
  });

  it("CurvatureField.kWithWave applies beta", () => {
    const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
    wf.impulse(2, 2, 2, 1);
    const curv = new CurvatureField({
      k0: 1,
      center: { x: 2, y: 2, z: 2 },
      sigma: 10,
      beta: 0.5,
      waveField: wf,
    });
    assert.ok(Math.abs(curv.kWithWave(2, 2, 2) - curv.baseK(2, 2, 2) * 1.5) < 1e-9);
  });

  it("ForceField gamma couples wave", () => {
    const wf = new WaveField({ gridSize: { nx: 8, ny: 8, nz: 8 } });
    wf.impulse(1, 1, 1, 2);
    const ff = new ForceField({
      g: { x: 0, y: 0, z: 0 },
      waveField: wf,
      gamma: 3,
      waveDir: { x: 1, y: 0, z: 0 },
    });
    assert.equal(ff.force({ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }, 1).fx, 6);
  });

  it("HdrCanvas.toneMapPixel without DOM", () => {
    const hdr = new HdrCanvas(null);
    const tm = hdr.toneMapPixel(1, 0, 0);
    assert.ok(tm.r > 0);
    assert.equal(hdr.presentFrame(new Float32Array(12), 2, 2), false);
  });

  it('MultiGpuArbitrator returns "single"', async () => {
    const arb = new MultiGpuArbitrator();
    assert.equal((await arb.decideDevices(null, 2)).strategy, "single");
    assert.equal((await arb.planFrame("f1", 2)).strategy, "single");
  });

  it("bindWorld with wave.enabled", () => {
    const ctx = bindWorld(
      minimalWorld({
        wave: {
          enabled: true,
          gridSize: { nx: 8, ny: 8, nz: 8 },
          c: 1,
          dt: 0.01,
          beta: 0.1,
          gamma: 0.2,
          waveDir: { x: 0, y: 1, z: 0 },
        },
      })
    );
    assert.equal(ctx.waveEnabled, true);
    assert.ok(ctx.waveField);
    ctx.waveField.impulse(4, 4, 4, 1);
    ctx.waveField.step();
  });

  it("prepareWorld rejects bad wave grid", () => {
    assert.throws(
      () =>
        prepareWorld(
          minimalWorld({
            wave: {
              enabled: true,
              gridSize: { nx: 0, ny: 8, nz: 8 },
              c: 1,
              dt: 0.01,
              waveDir: { x: 1, y: 0, z: 0 },
            },
          })
        ),
      /PlpValidator|gridSize/
    );
  });

  it("fromWorldWaveConfig + WaveWavefrontAdapter noop + WGSL loads", async () => {
    const { enabled, waveField } = fromWorldWaveConfig({
      enabled: true,
      gridSize: { nx: 4, ny: 4, nz: 4 },
    });
    assert.equal(enabled, true);
    assert.ok(waveField);
    const r = await stepWaveField({}, {}, {});
    assert.equal(r.status, "noop");
    assert.ok(WAVE_UPDATE_WGSL && WAVE_UPDATE_WGSL.includes("psiNext"));
  });

  it("FrameLoop skeleton: construct + tick without rAF/WebGPU", async () => {
    const world = minimalWorld({ wave: { enabled: false } });
    const stubRender = async (worldId, opts) => ({
      worldId,
      ok: true,
      worldContext: opts.worldContext,
    });
    const loop = new FrameLoop(world, { width: 64, height: 48 }, {
      renderFrame: stubRender,
    });
    assert.equal(loop.worldContext.waveEnabled, false);
    const start = loop.start();
    assert.equal(start.status, "noop");
    const result = await loop.tick();
    assert.equal(result.ok, true);
    assert.equal(loop.tickCount, 1);
  });
});
