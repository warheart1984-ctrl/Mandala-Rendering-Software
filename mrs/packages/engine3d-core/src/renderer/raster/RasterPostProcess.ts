/**
 * Soft-raster post helpers: depth fog + screen-space AO + cinematic proxies
 * (DOF, temporal motion blur, color grade, dust motes) + ACES-approx tone-map.
 *
 * Drive-G-1: CPU approximations for cinematic depth cueing — not RTX AO / SSR /
 * true volumetric lighting / optical DOF / full ACES 1.3. Status: **enforced**
 * by upgrade tests for listed posts; tone-map **partial**.
 */

export type Vec3 = readonly [number, number, number];

/** Blend beauty toward fog color using depth AOV (near=dark, far=bright). */
export function applyDepthFog(
  beauty: Uint8Array,
  depth: Uint8Array,
  width: number,
  height: number,
  fogRgb: Vec3,
  strength = 0.55,
): Uint8Array {
  const out = new Uint8Array(beauty.length);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = (depth[o]! + depth[o + 1]! + depth[o + 2]!) / (3 * 255);
    const fog = Math.min(1, Math.max(0, (d - 0.25) / 0.75)) * strength;
    out[o] = Math.round(beauty[o]! * (1 - fog) + fogRgb[0] * 255 * fog);
    out[o + 1] = Math.round(beauty[o + 1]! * (1 - fog) + fogRgb[1] * 255 * fog);
    out[o + 2] = Math.round(beauty[o + 2]! * (1 - fog) + fogRgb[2] * 255 * fog);
    out[o + 3] = 255;
  }
  return out;
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 45.164) * 43758.5453;
  return n - Math.floor(n);
}

function sampleRgb(
  buf: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const o = (yi * width + xi) * 4;
  return [buf[o]!, buf[o + 1]!, buf[o + 2]!];
}

export interface DepthOfFieldOptions {
  /** Focus plane depth code 0–1 (matches depth AOV encoding). Default 0.42. */
  focusDepth?: number;
  /** Coc scale — how fast blur grows away from focus. Default 4.5. */
  cocScale?: number;
  /** Max blur radius in pixels. Default 2. */
  maxRadius?: number;
  /** Mix amount 0–1. Default 0.85. */
  strength?: number;
}

/**
 * Cheap depth-of-field / rack-focus proxy: box-sample neighbors when depth
 * diverges from a focus plane. Not optical bokeh / CIRCLE_OF_CONFUSION physics.
 */
export function applyDepthOfFieldProxy(
  beauty: Uint8Array,
  depth: Uint8Array,
  width: number,
  height: number,
  options?: DepthOfFieldOptions,
): Uint8Array {
  const focus = options?.focusDepth ?? 0.42;
  const cocScale = options?.cocScale ?? 4.5;
  const maxRadius = Math.max(1, options?.maxRadius ?? 2);
  const strength = options?.strength ?? 0.85;
  const out = new Uint8Array(beauty.length);
  const offsets: Array<[number, number]> = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const d = depth[o]! / 255;
      const coc = Math.min(1, Math.abs(d - focus) * cocScale);
      const radius = coc * maxRadius;
      if (radius < 0.35 || strength < 0.05) {
        out[o] = beauty[o]!;
        out[o + 1] = beauty[o + 1]!;
        out[o + 2] = beauty[o + 2]!;
        out[o + 3] = 255;
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (const [ox, oy] of offsets) {
        const sx = x + ox * radius;
        const sy = y + oy * radius;
        const [sr, sg, sb] = sampleRgb(beauty, width, height, sx, sy);
        const w = ox === 0 && oy === 0 ? 1.4 : 1;
        r += sr * w;
        g += sg * w;
        b += sb * w;
        wsum += w;
      }
      r /= wsum;
      g /= wsum;
      b /= wsum;
      const mix = strength * coc;
      out[o] = Math.round(beauty[o]! * (1 - mix) + r * mix);
      out[o + 1] = Math.round(beauty[o + 1]! * (1 - mix) + g * mix);
      out[o + 2] = Math.round(beauty[o + 2]! * (1 - mix) + b * mix);
      out[o + 3] = 255;
    }
  }
  return out;
}

export interface TemporalMotionBlurOptions {
  /** Blend weight of previous frame (0–0.5 recommended). Default 0.28. */
  amount?: number;
}

/**
 * Temporal motion-blur proxy: lerp current beauty toward previous frame.
 * Host must keep a previous-frame buffer. Not shutter/vector MB.
 */
export function applyTemporalMotionBlur(
  current: Uint8Array,
  previous: Uint8Array | null | undefined,
  options?: TemporalMotionBlurOptions,
): Uint8Array {
  if (!previous || previous.length !== current.length) {
    return new Uint8Array(current);
  }
  const amount = Math.max(0, Math.min(0.5, options?.amount ?? 0.28));
  const out = new Uint8Array(current.length);
  const a = 1 - amount;
  for (let i = 0; i < current.length; i += 4) {
    out[i] = Math.round(current[i]! * a + previous[i]! * amount);
    out[i + 1] = Math.round(current[i + 1]! * a + previous[i + 1]! * amount);
    out[i + 2] = Math.round(current[i + 2]! * a + previous[i + 2]! * amount);
    out[i + 3] = 255;
  }
  return out;
}

export interface CinematicGradeOptions {
  /** Contrast around mid-gray. Default 1.12. */
  contrast?: number;
  /** Brightness offset in linear 0–1. Default -0.015. */
  brightness?: number;
  /** Saturation multiplier. Default 0.88. */
  saturation?: number;
  /** Warm/amber lift toward shadows→highlights. Default 0.06. */
  amberLift?: number;
  /** Cool/teal bias in midtones. Default 0.04. */
  tealBias?: number;
  /** Soft vignette strength 0–1. Default 0.35. */
  vignette?: number;
}

/**
 * Archive-of-Consent mood grade: muted teal/amber, gentle vignette.
 * Not ACES / CDL / Resolve — soft-raster display transform only.
 */
export function applyCinematicColorGrade(
  beauty: Uint8Array,
  width: number,
  height: number,
  options?: CinematicGradeOptions,
): Uint8Array {
  const contrast = options?.contrast ?? 1.12;
  const brightness = options?.brightness ?? -0.015;
  const saturation = options?.saturation ?? 0.88;
  const amberLift = options?.amberLift ?? 0.06;
  const tealBias = options?.tealBias ?? 0.04;
  const vignette = options?.vignette ?? 0.35;
  const out = new Uint8Array(beauty.length);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxR = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = beauty[o]! / 255;
      let g = beauty[o + 1]! / 255;
      let b = beauty[o + 2]! / 255;
      r = (r - 0.5) * contrast + 0.5 + brightness;
      g = (g - 0.5) * contrast + 0.5 + brightness;
      b = (b - 0.5) * contrast + 0.5 + brightness;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
      // Teal mid / amber highlight split
      const mid = 1 - Math.abs(luma - 0.45) * 2;
      r += amberLift * luma * 0.7;
      g += amberLift * luma * 0.35 - tealBias * mid * 0.15;
      b += tealBias * mid - amberLift * luma * 0.2;
      const vr = Math.hypot(x - cx, y - cy) / maxR;
      const vig = 1 - vignette * Math.pow(Math.min(1, vr), 1.6);
      r *= vig;
      g *= vig;
      b *= vig;
      out[o] = Math.max(0, Math.min(255, Math.round(r * 255)));
      out[o + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      out[o + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      out[o + 3] = 255;
    }
  }
  return out;
}

export interface VolumetricDustOptions {
  /** Particle density 0–1. Default 0.45. */
  density?: number;
  /** Brightness of motes. Default 0.55. */
  brightness?: number;
  /** Deterministic seed. Default 7. */
  seed?: number;
  /** Prefer mid/far depth. Default true. */
  depthBias?: boolean;
}

/**
 * Screen-space dust / volumetric mote approximation (seeded hash sparkles).
 * Not participating media / god-rays.
 */
export function applyVolumetricDust(
  beauty: Uint8Array,
  depth: Uint8Array | undefined,
  width: number,
  height: number,
  options?: VolumetricDustOptions,
): Uint8Array {
  const density = options?.density ?? 0.45;
  const brightness = options?.brightness ?? 0.55;
  const seed = options?.seed ?? 7;
  const depthBias = options?.depthBias !== false;
  const out = new Uint8Array(beauty);
  const threshold = 1 - density * 0.018;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = hash2(x, y, seed);
      if (h < threshold) continue;
      const o = (y * width + x) * 4;
      let atten = brightness * (0.4 + 0.6 * ((h - threshold) / (1 - threshold + 1e-6)));
      if (depthBias && depth) {
        const d = depth[o]! / 255;
        atten *= 0.35 + 0.65 * Math.min(1, Math.max(0, (d - 0.2) / 0.6));
      }
      // Warm dust mote
      out[o] = Math.min(255, Math.round(out[o]! + 55 * atten));
      out[o + 1] = Math.min(255, Math.round(out[o + 1]! + 42 * atten));
      out[o + 2] = Math.min(255, Math.round(out[o + 2]! + 28 * atten));
    }
  }
  return out;
}

export interface AcesToneMapOptions {
  /** Linear exposure multiplier before ACES fit. Default 1.0. */
  exposure?: number;
  /**
   * When true, input bytes are treated as linear 0–1 encoded in 0–255
   * (soft-raster path). Default true.
   */
  inputIsEncodedLinear?: boolean;
}

/**
 * ACES-ish filmic tone-map (Narkowicz approx) + sRGB encode.
 * Status: **partial** — not a full ACES RRT/ODT or OpenColorIO config.
 * Distinct from {@link applyCinematicColorGrade} (mood grade).
 */
export function applyAcesApproxToneMap(
  beauty: Uint8Array,
  width: number,
  height: number,
  options?: AcesToneMapOptions,
): Uint8Array {
  const exposure = options?.exposure ?? 1.0;
  const out = new Uint8Array(beauty.length);
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  const tone = (x: number): number => {
    const v = Math.max(0, x * exposure);
    const num = v * (a * v + b);
    const den = v * (c * v + d) + e;
    return Math.max(0, Math.min(1, num / den));
  };
  const toSrgb = (lin: number): number => {
    if (lin <= 0.0031308) return 12.92 * lin;
    return 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  };

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = beauty[o]! / 255;
    const g = beauty[o + 1]! / 255;
    const bch = beauty[o + 2]! / 255;
    out[o] = Math.max(0, Math.min(255, Math.round(toSrgb(tone(r)) * 255)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round(toSrgb(tone(g)) * 255)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round(toSrgb(tone(bch)) * 255)));
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Extra contact-shadow punch: deepen already-dark pixels near depth discontinuities.
 * Soft-raster GI stand-in — not shadow maps.
 */
export function applyContactShadowBoost(
  beauty: Uint8Array,
  depth: Uint8Array,
  width: number,
  height: number,
  strength = 0.22,
): Uint8Array {
  const out = new Uint8Array(beauty.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const d = depth[o]! / 255;
      let edge = 0;
      if (x + 1 < width) edge += Math.abs(d - depth[o + 4]! / 255);
      if (y + 1 < height) edge += Math.abs(d - depth[o + width * 4]! / 255);
      const darken = Math.min(0.45, edge * 4) * strength;
      const f = 1 - darken;
      out[o] = Math.round(beauty[o]! * f);
      out[o + 1] = Math.round(beauty[o + 1]! * f);
      out[o + 2] = Math.round(beauty[o + 2]! * f);
      out[o + 3] = 255;
    }
  }
  return out;
}

export interface ScreenSpaceAoOptions {
  /** Darken amount 0–1 (default 0.45). */
  strength?: number;
  /** Neighbor radius in pixels (default 2). */
  radius?: number;
  /** Depth contrast scale (default 18). */
  depthScale?: number;
}

/**
 * Cheap contact AO from depth (and optional normal) AOVs.
 * Darkens creases / silhouettes where nearby pixels are nearer than center.
 */
export function applyScreenSpaceAo(
  beauty: Uint8Array,
  depth: Uint8Array,
  width: number,
  height: number,
  options?: ScreenSpaceAoOptions,
  normal?: Uint8Array,
): Uint8Array {
  const strength = options?.strength ?? 0.45;
  const radius = Math.max(1, options?.radius ?? 2);
  const depthScale = options?.depthScale ?? 18;
  const out = new Uint8Array(beauty.length);
  const offsets: Array<[number, number]> = [
    [-radius, 0],
    [radius, 0],
    [0, -radius],
    [0, radius],
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const centerD = depth[o]! / 255;
      let occ = 0;
      let samples = 0;
      for (const [ox, oy] of offsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const no = (ny * width + nx) * 4;
        const nd = depth[no]! / 255;
        // Nearer neighbor (smaller depth code) → occlusion
        const delta = (centerD - nd) * depthScale;
        if (delta > 0) occ += Math.min(1, delta);
        samples += 1;
        if (normal) {
          // Extra crease when normals diverge
          const dx = (normal[o]! - normal[no]!) / 255;
          const dy = (normal[o + 1]! - normal[no + 1]!) / 255;
          const dz = (normal[o + 2]! - normal[no + 2]!) / 255;
          const diverge = Math.hypot(dx, dy, dz);
          if (diverge > 0.12 && delta > -0.02) occ += diverge * 0.35;
        }
      }
      const ao = 1 - strength * (samples ? occ / samples : 0);
      const factor = Math.max(0.35, Math.min(1, ao));
      out[o] = Math.round(beauty[o]! * factor);
      out[o + 1] = Math.round(beauty[o + 1]! * factor);
      out[o + 2] = Math.round(beauty[o + 2]! * factor);
      out[o + 3] = 255;
    }
  }
  return out;
}
