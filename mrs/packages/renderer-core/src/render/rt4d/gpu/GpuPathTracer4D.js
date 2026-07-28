/**
 * GpuPathTracer4D — GPU path tracer with emissive triangle area light support.
 *
 * Uploads emissive triangle data as a storage buffer for the shade compute
 * pass to sample directly (NEE without hypersphere approximations).
 *
 * Status: **implemented**
 *   - Emissive triangle buffer packing and upload
 *   - Scene serialization with emissive data
 *   - Integration with RT4DGPURenderer
 */

const EMISSIVE_STRIDE = 16;

function materialIdToIndex(scene, materialId) {
  const ids = scene.materials?.listIds?.() ?? [];
  const idx = ids.indexOf(materialId);
  return idx >= 0 ? idx : 0;
}

function packEmissiveTriangles(emissiveTriangles, scene) {
  const count = emissiveTriangles.length;
  if (count === 0) return new Float32Array(4);

  const data = new Float32Array(count * EMISSIVE_STRIDE);
  for (let i = 0; i < count; i++) {
    const tri = emissiveTriangles[i];
    const o = i * EMISSIVE_STRIDE;

    data[o + 0] = tri.v0.x;
    data[o + 1] = tri.v0.y;
    data[o + 2] = tri.v0.z;
    data[o + 3] = tri.v0.w;

    data[o + 4] = tri.v1.x;
    data[o + 5] = tri.v1.y;
    data[o + 6] = tri.v1.z;
    data[o + 7] = tri.v1.w;

    data[o + 8] = tri.v2.x;
    data[o + 9] = tri.v2.y;
    data[o + 10] = tri.v2.z;
    data[o + 11] = tri.v2.w;

    data[o + 12] = tri.area;
    data[o + 13] = materialIdToIndex(scene, tri.materialId);

    const n = tri.geometricNormal;
    data[o + 14] = n.x;
    data[o + 15] = n.y;
  }
  return data;
}

export class GpuPathTracer4D {
  constructor(renderer) {
    this._renderer = renderer;
    this._emissiveBuffer = null;
    this._emissiveCount = 0;
  }

  uploadScene(scene) {
    this._renderer.serializeScene(scene, this._renderer._lastCamera);

    const emissive = scene.getEmissiveTriangles?.() ?? [];
    this._emissiveCount = emissive.length;

    if (emissive.length > 0) {
      const data = packEmissiveTriangles(emissive, scene);
      this._emissiveBuffer = this._renderer.device.createBuffer({
        size: Math.max(4, data.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(this._emissiveBuffer.getMappedRange()).set(data);
      this._emissiveBuffer.unmap();
    } else {
      this._emissiveBuffer = this._renderer.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      this._emissiveBuffer.unmap();
    }

    return this;
  }

  async render(config) {
    const result = await this._renderer.render(config.scene ?? null, config.camera ?? null, {
      width: config.width,
      height: config.height,
      seed: config.seed,
      engineMode: config.engineMode,
    });

    return {
      ...result,
      emissiveTriangleCount: this._emissiveCount,
    };
  }

  destroy() {
    if (this._emissiveBuffer) {
      this._emissiveBuffer.destroy();
      this._emissiveBuffer = null;
    }
  }
}

export { packEmissiveTriangles, EMISSIVE_STRIDE };
