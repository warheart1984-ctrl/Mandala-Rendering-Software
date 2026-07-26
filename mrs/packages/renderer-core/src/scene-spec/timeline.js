/**
 * AnimationTimeline sampling — linear keyframe interpolation.
 * Cubic / easing: declared (not implemented).
 */

import { convertSceneSpecification } from "./convert.js";

/**
 * Deep clone via JSON (deterministic plain data only).
 * @template T
 * @param {T} v
 * @returns {T}
 */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec4(a, b, t) {
  if (!a) return b ? [...b] : undefined;
  if (!b) return [...a];
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t),
  ];
}

function lerpRotate(a = {}, b = {}, t) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const k of keys) {
    out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
  }
  return out;
}

function lerpTransform(a, b, t) {
  if (!a && !b) return undefined;
  a = a ?? {};
  b = b ?? {};
  return {
    translate: lerpVec4(a.translate, b.translate, t) ?? a.translate ?? b.translate,
    rotate: lerpRotate(a.rotate, b.rotate, t),
    scale: lerpVec4(a.scale, b.scale, t) ?? a.scale ?? b.scale,
  };
}

function lerpCamera(a, b, t) {
  if (!a && !b) return undefined;
  a = a ?? {};
  b = b ?? {};
  return {
    position4d: lerpVec4(a.position4d, b.position4d, t) ?? a.position4d ?? b.position4d,
    target4d: lerpVec4(a.target4d, b.target4d, t) ?? a.target4d ?? b.target4d,
    fovX: a.fovX != null || b.fovX != null ? lerp(a.fovX ?? 52, b.fovX ?? 52, t) : undefined,
    fovY: a.fovY != null || b.fovY != null ? lerp(a.fovY ?? 52, b.fovY ?? 52, t) : undefined,
    fovZ: a.fovZ != null || b.fovZ != null ? lerp(a.fovZ ?? 45, b.fovZ ?? 45, t) : undefined,
    fovW: a.fovW != null || b.fovW != null ? lerp(a.fovW ?? 28, b.fovW ?? 28, t) : undefined,
  };
}

/**
 * Find surrounding keyframes for time t.
 * @param {Array<{time: number}>} keyframes sorted by time
 * @param {number} t
 */
function surrounding(keyframes, t) {
  if (keyframes.length === 1) return { a: keyframes[0], b: keyframes[0], u: 0 };
  if (t <= keyframes[0].time) return { a: keyframes[0], b: keyframes[0], u: 0 };
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return { a: last, b: last, u: 0 };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const u = span <= 0 ? 0 : (t - a.time) / span;
      return { a, b, u };
    }
  }
  return { a: last, b: last, u: 0 };
}

/**
 * Apply interpolated keyframe patches onto a base spec.
 * @param {object} baseSpec
 * @param {object} a keyframe
 * @param {object} b keyframe
 * @param {number} u blend 0..1
 */
export function applyKeyframeBlend(baseSpec, a, b, u) {
  const spec = clone(baseSpec);
  delete spec.animation;

  if (a.camera || b.camera) {
    const baseCam = spec.camera ?? {};
    const ca = { ...baseCam, ...(a.camera ?? {}) };
    const cb = { ...baseCam, ...(b.camera ?? {}) };
    spec.camera = lerpCamera(ca, cb, u);
  }

  const entityPatchesA = a.entities ?? {};
  const entityPatchesB = b.entities ?? {};
  const ids = new Set([
    ...Object.keys(entityPatchesA),
    ...Object.keys(entityPatchesB),
  ]);
  if (ids.size > 0 && Array.isArray(spec.entities)) {
    spec.entities = spec.entities.map((ent) => {
      if (!ids.has(ent.id)) return ent;
      const pa = entityPatchesA[ent.id] ?? {};
      const pb = entityPatchesB[ent.id] ?? {};
      const ta = pa.transform4d ?? ent.transform4d;
      const tb = pb.transform4d ?? ent.transform4d;
      return {
        ...ent,
        transform4d: lerpTransform(ta, tb, u) ?? ent.transform4d,
      };
    });
  }

  return spec;
}

/**
 * Sample an AnimationTimeline at fps → per-frame SceneSpecifications.
 * @param {object} spec — full SceneSpecification with animation
 * @param {{ fps?: number, includeEnd?: boolean }} [options]
 * @returns {{ frames: Array<{ frameIndex: number, time: number, spec: object }>, frameCount: number }}
 */
export function sampleTimeline(spec, options = {}) {
  const anim = spec.animation;
  if (!anim) {
    return {
      frames: [{ frameIndex: 0, time: 0, spec: clone(spec) }],
      frameCount: 1,
    };
  }

  const fps = options.fps ?? anim.fps ?? 12;
  const duration = Math.max(0, Number(anim.duration) || 0);
  const keyframes = [...(anim.keyframes ?? [])].sort((x, y) => x.time - y.time);
  if (keyframes.length === 0) {
    return {
      frames: [{ frameIndex: 0, time: 0, spec: clone(spec) }],
      frameCount: 1,
    };
  }

  const includeEnd = options.includeEnd !== false;
  const n = Math.max(1, Math.floor(duration * fps) + (includeEnd ? 1 : 0));
  const frames = [];

  for (let i = 0; i < n; i++) {
    const time = duration === 0 ? 0 : Math.min(duration, i / fps);
    const { a, b, u } = surrounding(keyframes, time);
    const frameSpec = applyKeyframeBlend(spec, a, b, u);
    // Keep per-frame seed stable from base output.seed / id
    if (spec.output) {
      frameSpec.output = { ...spec.output, ...(frameSpec.output ?? {}) };
    }
    frames.push({ frameIndex: i, time, spec: frameSpec });
  }

  return { frames, frameCount: frames.length };
}

/**
 * Sample one frame by index or time.
 * @param {object} spec
 * @param {{ frame?: number, time?: number }} sel
 */
export function sampleFrame(spec, sel = {}) {
  if (!spec.animation) {
    return { frameIndex: 0, time: 0, spec: clone(spec) };
  }
  const { frames } = sampleTimeline(spec);
  if (sel.time != null && Number.isFinite(Number(sel.time))) {
    const t = Number(sel.time);
    const anim = spec.animation;
    const keyframes = [...anim.keyframes].sort((x, y) => x.time - y.time);
    const { a, b, u } = surrounding(keyframes, t);
    const frameSpec = applyKeyframeBlend(spec, a, b, u);
    if (spec.output) frameSpec.output = { ...spec.output };
    const approxIndex = Math.round(t * (anim.fps || 12));
    return { frameIndex: approxIndex, time: t, spec: frameSpec };
  }
  const idx = Math.max(0, Math.min(frames.length - 1, Math.floor(Number(sel.frame) || 0)));
  return frames[idx];
}

/**
 * Convert a sampled frame to RT4D descriptor (convenience).
 */
export function convertSampledFrame(spec, sel = {}) {
  const sampled = sampleFrame(spec, sel);
  const converted = convertSceneSpecification(sampled.spec);
  return { ...sampled, ...converted };
}
