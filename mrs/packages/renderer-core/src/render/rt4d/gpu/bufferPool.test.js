import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { BufferPool, StagingBuffer } from "./bufferPool.js";

globalThis.GPUBufferUsage ??= {
  MAP_READ: 1, COPY_DST: 4, COPY_SRC: 2, STORAGE: 8,
  VERTEX: 16, INDEX: 32, UNIFORM: 64, INDIRECT: 256,
};

function mockBuffer(size, usage) {
  return {
    size,
    usage,
    _destroyed: false,
    destroy() { this._destroyed = true; },
  };
}

class MockDevice {
  createBuffer({ size, usage }) {
    return mockBuffer(size, usage);
  }

  createCommandEncoder() {
    return {
      copyBufferToBuffer() {},
      finish() { return {}; },
    };
  }

  get queue() {
    return {
      submit() {},
    };
  }
}

describe("BufferPool", () => {
  it("constructor initializes empty pools", () => {
    const pool = new BufferPool(new MockDevice());
    assert.equal(pool._free.size, 0);
    assert.equal(pool._active.size, 0);
  });

  it("acquire creates buffer when pool is empty", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const buf = pool.acquire(64, 0x1);
    assert.ok(buf);
    assert.equal(buf.size, 64);
    assert.equal(pool._active.size, 1);
  });

  it("acquire reuses released buffer", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const buf1 = pool.acquire(64, 0x1);
    pool.release(buf1);
    const buf2 = pool.acquire(64, 0x1);
    assert.equal(buf1, buf2);  // same buffer reused
    assert.equal(pool._active.size, 1);
    assert.equal(pool._free.size, 1);
    assert.equal(pool._free.get("64:1").length, 0);
  });

  it("release ignores unknown buffer", () => {
    const pool = new BufferPool(new MockDevice());
    const extBuf = mockBuffer(64, 0x1);
    pool.release(extBuf);
    assert.equal(pool._free.size, 0);
  });

  it("releaseAll moves all active to free", () => {
    const pool = new BufferPool(new MockDevice());
    const buf1 = pool.acquire(64, 0x1);
    const buf2 = pool.acquire(128, 0x2);
    pool.releaseAll();
    assert.equal(pool._active.size, 0);
    assert.equal(pool._free.get("64:1").length, 1);
    assert.equal(pool._free.get("128:2").length, 1);
  });

  it("acquire creates separate buffer for different size/usage", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const buf1 = pool.acquire(64, 0x1);
    const buf2 = pool.acquire(128, 0x2);
    assert.notEqual(buf1, buf2);
    assert.equal(pool._active.size, 2);
  });

  it("destroy releases all buffers", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const buf1 = pool.acquire(64, 0x1);
    const buf2 = pool.acquire(128, 0x2);
    pool.release(buf2);
    pool.destroy();
    assert.equal(pool._active.size, 0);
    assert.equal(pool._free.size, 0);
    assert.ok(buf1._destroyed);
    assert.ok(buf2._destroyed);
  });

  it("acquire handles multiple buffers with same key", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const bufs = [];
    for (let i = 0; i < 5; i++) {
      bufs.push(pool.acquire(256, 0x4));
    }
    assert.equal(pool._active.size, 5);
    for (const b of bufs) pool.release(b);
    const key = "256:4";
    assert.equal(pool._free.get(key).length, 5);
    // Acquiring again reuses in LIFO order
    const reused = pool.acquire(256, 0x4);
    assert.equal(bufs[4], reused);
  });
});

describe("StagingBuffer", () => {
  it("ensure creates buffer on first call", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const staging = new StagingBuffer(device, pool);
    const buf = staging.ensure(128);
    assert.ok(buf);
    assert.equal(buf.size, 256); // ceil to 256
  });

  it("ensure returns same buffer for smaller size", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const staging = new StagingBuffer(device, pool);
    const buf1 = staging.ensure(512);
    const buf2 = staging.ensure(256);
    assert.equal(buf1, buf2);
  });

  it("ensure allocates new buffer when size exceeds current", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const staging = new StagingBuffer(device, pool);
    const buf1 = staging.ensure(128);
    const buf2 = staging.ensure(1024);
    assert.notEqual(buf1, buf2);
    assert.equal(buf2.size, 1024);
  });

  it("destroy releases buffer back to pool", () => {
    const device = new MockDevice();
    const pool = new BufferPool(device);
    const staging = new StagingBuffer(device, pool);
    staging.ensure(256);
    staging.destroy();
    assert.equal(staging._buffer, null);
    // MAP_READ(1) | COPY_DST(4) = 5
    assert.equal(pool._free.get("256:5").length, 1);
  });
});
