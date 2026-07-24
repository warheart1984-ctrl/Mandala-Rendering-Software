/**
 * Browser-oriented frame loop — Phase C **skeleton** (Drive-G-1).
 * Node tests must not require requestAnimationFrame / live WebGPU.
 *
 * Paths are relative to this file under `src/render/rt4d/`.
 */
import { createRhi } from "../rhi/RhiFactory.js";
import { prepareWorld } from "./WorldOrchestrator.js";
import { renderWavefrontFrame } from "./pipeline/WavefrontPipelineAdapter.js";

export class FrameLoop {
  /**
   * @param {object} worldDoc WorldDocument v2
   * @param {{ width?: number, height?: number }|null} [canvas]
   * @param {object} [options]
   * @param {typeof renderWavefrontFrame} [options.renderFrame]
   * @param {(backend: string, opts?: object) => object} [options.createRhiFn]
   */
  constructor(worldDoc, canvas = null, options = {}) {
    this.worldDoc = worldDoc;
    this.canvas = canvas;
    this.width = canvas?.width ?? 320;
    this.height = canvas?.height ?? 240;
    this.worldContext = prepareWorld(worldDoc);
    const create = options.createRhiFn ?? createRhi;
    this.rhi = create("webgpu", { allowLiveGpu: false });
    this._renderFrame = options.renderFrame ?? renderWavefrontFrame;
    this._running = false;
    this._rafId = null;
    this.tickCount = 0;
  }

  /**
   * Start rAF loop. In Node (no requestAnimationFrame): returns status message, does not hang.
   * @returns {{ status: "started"|"noop"; reason?: string }}
   */
  start() {
    const raf =
      typeof globalThis !== "undefined"
        ? globalThis.requestAnimationFrame
        : undefined;
    if (typeof raf !== "function") {
      return {
        status: "noop",
        reason:
          "FrameLoop.start: requestAnimationFrame unavailable (Node/headless). Call tick() manually — browser skeleton only.",
      };
    }
    if (typeof this.rhi.init === "function") {
      // optional; WebGpuRhi stub may not define init
      Promise.resolve(this.rhi.init()).catch(() => {});
    }
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this.tick().catch(() => {});
      this._rafId = raf(loop);
    };
    this._rafId = raf(loop);
    return { status: "started" };
  }

  stop() {
    this._running = false;
    const caf =
      typeof globalThis !== "undefined"
        ? globalThis.cancelAnimationFrame
        : undefined;
    if (typeof caf === "function" && this._rafId != null) {
      caf(this._rafId);
    }
    this._rafId = null;
  }

  /**
   * One frame: CPU wave step (skeleton) + wavefront stub render.
   * ForceField particle integrate is left as a host hook (commented intent).
   */
  async tick() {
    this.tickCount += 1;
    if (this.worldContext.waveField) {
      this.worldContext.waveField.step();
    }
    // Optional: host may call this.worldContext.force.integrate(state, dt) per particle.

    const worldId =
      this.worldContext.worldDoc?.lineage?.worldId ||
      this.worldContext.worldDoc?.metadata?.name ||
      "world";

    return this._renderFrame(worldId, {
      quality: "baseline",
      host: "browser",
      worldDoc: this.worldDoc,
      worldContext: this.worldContext,
      stepWave: false,
      width: this.width,
      height: this.height,
      rhi: this.rhi,
    });
  }
}
