/**
 * GPU Buffer Pool — allocation, recycling, staging for RT4D WebGPU pipeline.
 */
export class BufferPool {
  constructor(device) {
    this.device = device;
    this._free = new Map();
    this._active = new Set();
  }

  acquire(size, usage) {
    const key = `${size}:${usage}`;
    const pool = this._free.get(key);
    if (pool && pool.length > 0) {
      const buf = pool.pop();
      this._active.add(buf);
      return buf;
    }
    const buf = this.device.createBuffer({ size, usage });
    this._active.add(buf);
    return buf;
  }

  release(buf) {
    if (!this._active.has(buf)) return;
    this._active.delete(buf);
    const key = `${buf.size}:${buf.usage}`;
    if (!this._free.has(key)) this._free.set(key, []);
    this._free.get(key).push(buf);
  }

  releaseAll() {
    for (const buf of this._active) {
      const key = `${buf.size}:${buf.usage}`;
      if (!this._free.has(key)) this._free.set(key, []);
      this._free.get(key).push(buf);
    }
    this._active.clear();
  }

  destroy() {
    for (const bufs of this._free.values()) {
      for (const b of bufs) b.destroy();
    }
    for (const b of this._active) b.destroy();
    this._free.clear();
    this._active.clear();
  }
}

export class StagingBuffer {
  constructor(device, pool) {
    this.device = device;
    this.pool = pool;
    this._buffer = null;
    this._size = 0;
  }

  ensure(size) {
    if (this._buffer && this._size >= size) return this._buffer;
    if (this._buffer) this.pool.release(this._buffer);
    this._size = Math.max(size, 256);
    this._buffer = this.pool.acquire(
      this._size,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    );
    return this._buffer;
  }

  async readback(srcBuffer, size) {
    const staging = this.ensure(size);
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer, 0, staging, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return data;
  }

  destroy() {
    if (this._buffer) {
      this.pool.release(this._buffer);
      this._buffer = null;
    }
  }
}

export class MeshBufferCache {
  constructor(device, pool = new BufferPool(device)) {
    this.device = device;
    this.pool = pool;
    this._entries = new Map();
  }

  getOrCreate(meshKey, mesh) {
    if (!meshKey) throw new Error("MeshBufferCache requires a stable meshKey");
    const existing = this._entries.get(meshKey);
    if (existing) {
      existing.refCount++;
      return existing;
    }
    const vertexData = mesh.vertices instanceof Float32Array ? mesh.vertices : new Float32Array(mesh.vertices ?? []);
    const indexData = mesh.indices instanceof Uint32Array || mesh.indices instanceof Uint16Array ? mesh.indices : new Uint32Array(mesh.indices ?? []);
    const vertex = this._createAndUpload(vertexData, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE);
    const index = this._createAndUpload(indexData, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE);
    const entry = {
      key: meshKey,
      vertex,
      index,
      vertexCount: Math.floor(vertexData.length / 3),
      indexCount: indexData.length,
      indexFormat: indexData instanceof Uint32Array ? "uint32" : "uint16",
      refCount: 1,
    };
    this._entries.set(meshKey, entry);
    return entry;
  }

  release(meshKey) {
    const entry = this._entries.get(meshKey);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount > 0) return;
    this.pool.release(entry.vertex);
    this.pool.release(entry.index);
    this._entries.delete(meshKey);
  }

  size() {
    return this._entries.size;
  }

  clear() {
    for (const key of [...this._entries.keys()]) {
      const entry = this._entries.get(key);
      if (!entry) continue;
      entry.refCount = 1;
      this.release(key);
    }
  }

  _createAndUpload(data, usage) {
    const buffer = this.pool.acquire(Math.max(4, data.byteLength), usage);
    if (this.device.queue?.writeBuffer) this.device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
    return buffer;
  }
}
