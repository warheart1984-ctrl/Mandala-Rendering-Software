/**
 * Console-free 3D render stub for the EngineHost loop.
 *
 * Status: **skeleton** — records last-frame stats only. Not WebGPU/WebGL.
 */

/**
 * @typedef {Object} Renderer3DStubFrame
 * @property {number} vertexCount
 * @property {number} visualModLength
 * @property {number} bodyCount
 * @property {number} [frameIndex]
 */

export class Renderer3DStub {
  constructor() {
    /** @type {Renderer3DStubFrame | null} */
    this.lastFrame = null;
    this.renderCount = 0;
  }

  /**
   * @param {import("./World3D.js").World3D} world
   * @param {number[]} visualMod
   * @param {{ frameIndex?: number }} [meta]
   * @returns {Renderer3DStubFrame}
   */
  render(world, visualMod = [], meta = {}) {
    const verts = world?.mesh?.vertices ?? world?.vertices ?? [];
    const frame = {
      vertexCount: verts.length,
      visualModLength: visualMod.length,
      bodyCount: world?.bodies?.length ?? 0,
      frameIndex: meta.frameIndex,
    };
    this.lastFrame = frame;
    this.renderCount += 1;
    return frame;
  }
}
