/**
 * PathFinalize — once after the bounce loop, never inside it.
 *
 * WRONG: finalize inside `for b in maxBounces`.
 * RIGHT: `for b in maxBounces { traceBounce() }` then PathFinalize once.
 * Writes only the last 16-byte chunk (opticalLength, pixelId, bounceId).
 * Per-bounce finalize races accumulation.
 *
 * GPU hook is partial: RT4D shade/BVH is not rewritten this pass.
 */

import {
  PATH_SAMPLE_BYTE_SIZE,
  createPathSampleView,
  writeBounceSample,
  writePathFinalize,
  readPathSample,
} from "./path-sample.js";
import { rejectUnreadyPath } from "./gate.js";

export const PATH_FINALIZE_STATUS = Object.freeze({
  cpu: "enforced",
  gpuHook: "partial",
  note:
    "PathFinalize is a post-loop write of opticalLength/pixelId/bounceId. GPU adapter may fill the whole PathSample from RT4D buffers after the loop; bounce math is not rewritten.",
});

/**
 * Bounce helper used inside the loop. Does not write finalize fields.
 * @returns {{calls: string[]}}
 */
export function traceBounce(target, bounceState = {}) {
  writeBounceSample(target, bounceState);
  return { wroteFinalize: false };
}

/**
 * Single post-loop finalize. Writes only offsets 48–63.
 */
export function pathFinalize(target, fields) {
  writePathFinalize(target, fields);
  return readPathSample(target);
}

/**
 * Canonical CPU/WGSL sketch: bounce loop then one finalize.
 * GPU hook: call this after RT4D's `for (depth) { shade }` — not inside it.
 */
export function runPathLoopThenFinalize(opts = {}) {
  const maxBounces = Math.max(1, Number(opts.maxBounces ?? 1));
  const slot = opts.target ?? createPathSampleView();
  const log = [];

  for (let b = 0; b < maxBounces; b++) {
    const bounce = typeof opts.traceBounce === "function"
      ? opts.traceBounce(b)
      : { ...(opts.bounce ?? {}), bounceId: b };
    log.push("traceBounce");
    traceBounce(slot, bounce);
  }

  log.push("pathFinalize");
  const finalized = pathFinalize(slot, {
    opticalLength: opts.opticalLength,
    pixelId: opts.pixelId,
    bounceId: opts.bounceId ?? maxBounces - 1,
  });

  return { sample: finalized, log, byteSize: PATH_SAMPLE_BYTE_SIZE, target: slot };
}

/**
 * Gate + finalize. Missing opticalLength or pixelId rejects before accumulation.
 */
export function finalizeAndGate(target, fields) {
  const sample = pathFinalize(target, fields);
  rejectUnreadyPath(sample);
  return sample;
}

/**
 * WGSL sketch: PathFinalize writes the last 16-byte chunk only.
 * Dispatched once after the host bounce loop.
 */
export const PATH_FINALIZE_WGSL_SKETCH = `fn pathFinalize(p: ptr<storage, PathSample, read_write>, opticalLength: f32, pixelId: u32, bounceId: u32) {
    (*p).opticalLength = opticalLength;
    (*p).pixelId = pixelId;
    (*p).bounceId = bounceId;
}

fn traceBounce(p: ptr<storage, PathSample, read_write>, pos: vec3f, dir: vec3f, wl: f32, radiance: vec3f, weight: f32) {
    (*p).pos = pos;
    (*p).dir = dir;
    (*p).wl = wl;
    (*p).radiance = radiance;
    (*p).weight = weight;
}

fn afterBounceLoop(p: ptr<storage, PathSample, read_write>, maxBounces: u32, opticalLength: f32, pixelId: u32) {
    for (var b = 0u; b < maxBounces; b = b + 1u) {
        traceBounce(p, (*p).pos, (*p).dir, (*p).wl, (*p).radiance, (*p).weight);
    }
    pathFinalize(p, opticalLength, pixelId, maxBounces - 1u);
}
`;
