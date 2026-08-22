/**
 * Attach HoloRT4D to existing RT4D buffers without rewriting RT4D core.
 *
 * GPU ray buffers (RT4DGPURenderer._rayBuffers):
 *   rayOrigins, rayDirs, hits (t), pathThroughput
 *   accumBuffer = radiance
 *   no opticalLength — first-segment t is a declared approximation
 *
 * Raygen: idx = gid.x = py * width + px. No PathSample.pixelId written today.
 * Adapter sets pixelId = idx (1 thread per pixel).
 *
 * Wavefront PathState has pixelX/pixelY — convert via pixelIdFromRaygen.
 */

import { pixelIdFromRaygen } from "./aligned.js";
import { packPathSample } from "./path-sample.js";
import { runPathLoopThenFinalize } from "./path-finalize.js";

export const PATH_ADAPTER_STATUS = Object.freeze({
  pixelId: "adapter",
  opticalLength: "declared",
  pathSampleLayout: "enforced",
  pathFinalizeGpu: "partial",
  note:
    "Frozen 64-byte PathSample. pixelId is derived from raygen idx. opticalLength uses hit.t when missing. GPU hook is a post-loop adapter.",
});

export function pathSampleFromRt4dIndex(idx, buffers, frameWidth) {
  const origin = readVec4(buffers.rayOrigins, idx);
  const dir = readVec4(buffers.rayDirs, idx);
  const t = readHitT(buffers.hits, idx);
  const throughput = readVec4(buffers.pathThroughput, idx);
  const radiance = readVec4(buffers.radiance ?? buffers.accum, idx) ?? throughput;
  const opticalLength =
    buffers.opticalLength?.[idx] ?? (Number.isFinite(t) ? t : 0);
  const sample = {
    pos: origin ? { x: origin[0], y: origin[1], z: origin[2] } : { x: 0, y: 0, z: 0 },
    w: origin ? origin[3] : 0,
    dir: dir ? { x: dir[0], y: dir[1], z: dir[2], w: dir[3] } : undefined,
    radiance,
    weight: 1,
    opticalLength,
    pixelId: idx,
    bounceId: buffers.bounceId?.[idx] ?? 0,
    wl: buffers.wavelength?.[idx],
  };
  sample.packed = packPathSample(sample);
  return sample;
}

/** CPU sketch of the GPU hook: bounce loop, then one PathFinalize. */
export function adaptRt4dLoopThenFinalize(opts = {}) {
  return runPathLoopThenFinalize(opts);
}

/**
 * Flatten RT4D `onPathFinalize` payload (nested `rayBuffers`) into the
 * buffers HoloRT4DGPURenderer.dispatch expects.
 */
export function rt4dBuffersFromHandoff(rt4d) {
  if (!rt4d) return null;
  const rb = rt4d.rayBuffers ?? {};
  return {
    frameParamsBuffer: rt4d.frameParamsBuffer ?? null,
    rayOrigins: rt4d.rayOrigins ?? rb.rayOrigins ?? null,
    rayDirs: rt4d.rayDirs ?? rb.rayDirs ?? null,
    hits: rt4d.hits ?? rb.hits ?? null,
    pathThroughput: rt4d.pathThroughput ?? rb.pathThroughput ?? null,
  };
}

export function pathSamplesFromWavefrontStates(states, frameWidth) {
  return states.map((s) => ({
    pixelId: pixelIdFromRaygen(s.pixelX, s.pixelY, frameWidth),
    radiance: s.throughput,
    weight: s.terminated ? 0 : 1,
    opticalLength: s.opticalLength ?? 0,
    w: s.dimension4 ?? 0,
    bounceId: s.depth ?? 0,
  }));
}

function readVec4(arr, idx) {
  if (!arr) return null;
  if (Array.isArray(arr[idx])) return arr[idx];
  const o = idx * 4;
  if (arr.length > o + 3) return [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]];
  return null;
}

function readHitT(hits, idx) {
  if (!hits) return 0;
  if (typeof hits[idx] === "number") return hits[idx];
  if (hits[idx] && typeof hits[idx] === "object") return Number(hits[idx].t ?? 0);
  if (hits.t) return Number(hits.t[idx] ?? 0);
  return 0;
}
