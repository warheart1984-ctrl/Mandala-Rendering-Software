/**
 * Frozen RT4D → HoloRT4D PathSample contract.
 * Layout is 64 bytes, 4× vec4, 16-byte aligned. Do not change after this lock.
 *
 * WGSL:
 *   struct PathSample {
 *     pos: vec3f,           // 0-11
 *     _pad0: f32,           // 12-15
 *     dir: vec3f,           // 16-27
 *     wl: f32,              // 28-31  dir+wl
 *     radiance: vec3f,      // 32-43
 *     weight: f32,          // 44-47  radiance+weight
 *     opticalLength: f32,   // 48-51  FINALIZE ONLY
 *     pixelId: u32,         // 52-55  FINALIZE ONLY
 *     bounceId: u32,        // 56-59  FINALIZE ONLY
 *     _pad1: u32,           // 60-63
 *   };
 *   // size == 64
 */

export const PATH_SAMPLE_BYTE_SIZE = 64;

export const PATH_SAMPLE_OFFSETS = Object.freeze({
  pos: 0,
  pad0: 12,
  dir: 16,
  wl: 28,
  radiance: 32,
  weight: 44,
  opticalLength: 48,
  pixelId: 52,
  bounceId: 56,
  pad1: 60,
});

/** Finalize-only fields occupy the last 16-byte chunk. */
export const PATH_SAMPLE_FINALIZE_OFFSET = 48;
export const PATH_SAMPLE_FINALIZE_END = 60;

export const PATH_SAMPLE_WGSL = `struct PathSample {
    pos: vec3f,
    _pad0: f32,
    dir: vec3f,
    wl: f32,
    radiance: vec3f,
    weight: f32,
    opticalLength: f32,
    pixelId: u32,
    bounceId: u32,
    _pad1: u32,
}`;

/**
 * Allocate one PathSample. Bounce helper may write 0–47; finalize writes 48–63.
 * @param {ArrayBuffer|SharedArrayBuffer} [buffer]
 * @param {number} [byteOffset]
 */
export function createPathSampleView(buffer = new ArrayBuffer(PATH_SAMPLE_BYTE_SIZE), byteOffset = 0) {
  if (buffer.byteLength < byteOffset + PATH_SAMPLE_BYTE_SIZE) {
    throw new Error(`PathSample buffer too small: need ${byteOffset + PATH_SAMPLE_BYTE_SIZE}`);
  }
  return {
    buffer,
    byteOffset,
    f32: new Float32Array(buffer, byteOffset, PATH_SAMPLE_BYTE_SIZE / 4),
    view: new DataView(buffer, byteOffset, PATH_SAMPLE_BYTE_SIZE),
  };
}

function writeVec3(view, offset, v) {
  view.setFloat32(offset, Number(v?.x ?? v?.[0] ?? 0), true);
  view.setFloat32(offset + 4, Number(v?.y ?? v?.[1] ?? 0), true);
  view.setFloat32(offset + 8, Number(v?.z ?? v?.[2] ?? 0), true);
}

/**
 * Bounce-loop helper. Writes pos/dir/wl/radiance/weight only.
 * Must not write opticalLength, pixelId, or bounceId (offsets 48–59).
 */
export function writeBounceSample(target, sample = {}) {
  const { view } = unwrap(target);
  writeVec3(view, PATH_SAMPLE_OFFSETS.pos, sample.pos ?? sample.position);
  view.setFloat32(PATH_SAMPLE_OFFSETS.pad0, Number(sample.w ?? sample._pad0 ?? 0), true);
  writeVec3(view, PATH_SAMPLE_OFFSETS.dir, sample.dir ?? sample.direction);
  view.setFloat32(PATH_SAMPLE_OFFSETS.wl, Number(sample.wl ?? 0), true);
  writeVec3(view, PATH_SAMPLE_OFFSETS.radiance, sample.radiance);
  view.setFloat32(PATH_SAMPLE_OFFSETS.weight, Number(sample.weight ?? 1), true);
  return target;
}

/**
 * PathFinalize — last 16-byte chunk only.
 * Call once after `for b in maxBounces { traceBounce() }`. Per-bounce finalize races.
 */
export function writePathFinalize(target, fields = {}) {
  const { view } = unwrap(target);
  view.setFloat32(PATH_SAMPLE_OFFSETS.opticalLength, Number(fields.opticalLength ?? 0), true);
  view.setUint32(PATH_SAMPLE_OFFSETS.pixelId, toU32(fields.pixelId), true);
  view.setUint32(PATH_SAMPLE_OFFSETS.bounceId, toU32(fields.bounceId), true);
  view.setUint32(PATH_SAMPLE_OFFSETS.pad1, toU32(fields._pad1 ?? 0), true);
  return target;
}

export function readPathSample(target) {
  const { view } = unwrap(target);
  return {
    pos: {
      x: view.getFloat32(PATH_SAMPLE_OFFSETS.pos, true),
      y: view.getFloat32(PATH_SAMPLE_OFFSETS.pos + 4, true),
      z: view.getFloat32(PATH_SAMPLE_OFFSETS.pos + 8, true),
    },
    w: view.getFloat32(PATH_SAMPLE_OFFSETS.pad0, true),
    dir: {
      x: view.getFloat32(PATH_SAMPLE_OFFSETS.dir, true),
      y: view.getFloat32(PATH_SAMPLE_OFFSETS.dir + 4, true),
      z: view.getFloat32(PATH_SAMPLE_OFFSETS.dir + 8, true),
    },
    wl: view.getFloat32(PATH_SAMPLE_OFFSETS.wl, true),
    radiance: {
      x: view.getFloat32(PATH_SAMPLE_OFFSETS.radiance, true),
      y: view.getFloat32(PATH_SAMPLE_OFFSETS.radiance + 4, true),
      z: view.getFloat32(PATH_SAMPLE_OFFSETS.radiance + 8, true),
    },
    weight: view.getFloat32(PATH_SAMPLE_OFFSETS.weight, true),
    opticalLength: view.getFloat32(PATH_SAMPLE_OFFSETS.opticalLength, true),
    pixelId: view.getUint32(PATH_SAMPLE_OFFSETS.pixelId, true),
    bounceId: view.getUint32(PATH_SAMPLE_OFFSETS.bounceId, true),
  };
}

export function packPathSample(sample = {}) {
  const slot = createPathSampleView();
  writeBounceSample(slot, sample);
  writePathFinalize(slot, sample);
  return slot.f32;
}

/** Pack N PathSamples into one 64-byte-stride buffer. Layout unchanged. */
export function packPathSamples(samples = []) {
  const buf = new ArrayBuffer(samples.length * PATH_SAMPLE_BYTE_SIZE);
  for (let i = 0; i < samples.length; i++) {
    const slot = createPathSampleView(buf, i * PATH_SAMPLE_BYTE_SIZE);
    writeBounceSample(slot, samples[i]);
    writePathFinalize(slot, samples[i]);
  }
  return new Uint8Array(buf);
}

function unwrap(target) {
  if (target?.view instanceof DataView) return target;
  if (target instanceof DataView) {
    return { view: target, buffer: target.buffer, byteOffset: target.byteOffset };
  }
  if (target instanceof ArrayBuffer || ArrayBuffer.isView(target)) {
    const buffer = target.buffer ?? target;
    const byteOffset = target.byteOffset ?? 0;
    return { view: new DataView(buffer, byteOffset, PATH_SAMPLE_BYTE_SIZE), buffer, byteOffset };
  }
  throw new Error("writeBounceSample/writePathFinalize expects PathSample view or ArrayBuffer");
}

function toU32(n) {
  return Number(n ?? 0) >>> 0;
}
