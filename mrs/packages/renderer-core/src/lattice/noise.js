/**
 * 4D Procedural Noise — fills 4D lattices with organic density fields.
 *
 * Implements:
 *   - Simplex-like 4D noise
 *   - Fractal Brownian Motion (fBm)
 *   - Domain warping
 *   - Analytical surface functions
 */

// ── Permutation table for hashing ────────────────────────────────

const PERM = new Uint8Array(512);
const GRAD4 = [
  [1, 1, 1, 0], [-1, 1, 1, 0], [1, -1, 1, 0], [-1, -1, 1, 0],
  [1, 1, -1, 0], [-1, 1, -1, 0], [1, -1, -1, 0], [-1, -1, -1, 0],
  [1, 1, 0, 1], [-1, 1, 0, 1], [1, -1, 0, 1], [-1, -1, 0, 1],
  [1, 1, 0, -1], [-1, 1, 0, -1], [1, -1, 0, -1], [-1, -1, 0, -1],
  [1, 0, 1, 1], [-1, 0, 1, 1], [1, 0, -1, 1], [-1, 0, -1, 1],
  [1, 0, 1, -1], [-1, 0, 1, -1], [1, 0, -1, -1], [-1, 0, -1, -1],
  [0, 1, 1, 1], [0, -1, 1, 1], [0, 1, -1, 1], [0, -1, -1, 1],
  [0, 1, 1, -1], [0, -1, 1, -1], [0, 1, -1, -1], [0, -1, -1, -1],
];

// Initialize permutation table with a seed
export function seedNoise(seed = 42) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Fisher-Yates shuffle with seeded PRNG
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

// Initialize with default seed
seedNoise(42);

// ── 4D Noise ─────────────────────────────────────────────────────

function dot4(g, x, y, z, w) {
  return g[0] * x + g[1] * y + g[2] * z + g[3] * w;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

/**
 * 4D Perlin-like noise.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @returns {number} value in [-1, 1]
 */
export function noise4d(x, y, z, w) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  const W = Math.floor(w) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const wf = w - Math.floor(w);

  const u = fade(xf);
  const v = fade(yf);
  const s = fade(zf);
  const t = fade(wf);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  const AAA = PERM[AA] + W;
  const AAB = PERM[AA + 1] + W;
  const ABA = PERM[AB] + W;
  const ABB = PERM[AB + 1] + W;
  const BAA = PERM[BA] + W;
  const BAB = PERM[BA + 1] + W;
  const BBA = PERM[BB] + W;
  const BBB = PERM[BB + 1] + W;

  const g0000 = GRAD4[PERM[AAA] % 32];
  const g1000 = GRAD4[PERM[BAA] % 32];
  const g0100 = GRAD4[PERM[ABA] % 32];
  const g1100 = GRAD4[PERM[BBA] % 32];
  const g0010 = GRAD4[PERM[AAB] % 32];
  const g1010 = GRAD4[PERM[BAB] % 32];
  const g0110 = GRAD4[PERM[ABB] % 32];
  const g1110 = GRAD4[PERM[BBB] % 32];

  const g0001 = GRAD4[PERM[AAA + 1] % 32];
  const g1001 = GRAD4[PERM[BAA + 1] % 32];
  const g0101 = GRAD4[PERM[ABA + 1] % 32];
  const g1101 = GRAD4[PERM[BBA + 1] % 32];
  const g0011 = GRAD4[PERM[AAB + 1] % 32];
  const g1011 = GRAD4[PERM[BAB + 1] % 32];
  const g0111 = GRAD4[PERM[ABB + 1] % 32];
  const g1111 = GRAD4[PERM[BBB + 1] % 32];

  const n0000 = dot4(g0000, xf, yf, zf, wf);
  const n1000 = dot4(g1000, xf - 1, yf, zf, wf);
  const n0100 = dot4(g0100, xf, yf - 1, zf, wf);
  const n1100 = dot4(g1100, xf - 1, yf - 1, zf, wf);
  const n0010 = dot4(g0010, xf, yf, zf - 1, wf);
  const n1010 = dot4(g1010, xf - 1, yf, zf - 1, wf);
  const n0110 = dot4(g0110, xf, yf - 1, zf - 1, wf);
  const n1110 = dot4(g1110, xf - 1, yf - 1, zf - 1, wf);

  const n0001 = dot4(g0001, xf, yf, zf, wf - 1);
  const n1001 = dot4(g1001, xf - 1, yf, zf, wf - 1);
  const n0101 = dot4(g0101, xf, yf - 1, zf, wf - 1);
  const n1101 = dot4(g1101, xf - 1, yf - 1, zf, wf - 1);
  const n0011 = dot4(g0011, xf, yf, zf - 1, wf - 1);
  const n1011 = dot4(g1011, xf - 1, yf, zf - 1, wf - 1);
  const n0111 = dot4(g0111, xf, yf - 1, zf - 1, wf - 1);
  const n1111 = dot4(g1111, xf - 1, yf - 1, zf - 1, wf - 1);

  const nx000 = lerp(n0000, n1000, u);
  const nx100 = lerp(n0100, n1100, u);
  const nx010 = lerp(n0010, n1010, u);
  const nx110 = lerp(n0110, n1110, u);
  const nx001 = lerp(n0001, n1001, u);
  const nx101 = lerp(n0101, n1101, u);
  const nx011 = lerp(n0011, n1011, u);
  const nx111 = lerp(n0111, n1111, u);

  const nxy00 = lerp(nx000, nx100, v);
  const nxy10 = lerp(nx010, nx110, v);
  const nxy01 = lerp(nx001, nx101, v);
  const nxy11 = lerp(nx011, nx111, v);

  const nxyz0 = lerp(nxy00, nxy10, s);
  const nxyz1 = lerp(nxy01, nxy11, s);

  return lerp(nxyz0, nxyz1, t);
}

// ── Fractal Brownian Motion (fBm) ────────────────────────────────

/**
 * 4D fBm — layered noise at different frequencies.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @param {object} options
 * @param {number} options.octaves - number of noise layers
 * @param {number} options.persistence - amplitude decay per octave
 * @param {number} options.lacunarity - frequency multiplier per octave
 * @param {number} options.scale - base frequency
 * @returns {number} value, roughly in [-1, 1]
 */
export function fbm4d(x, y, z, w, options = {}) {
  const {
    octaves = 6,
    persistence = 0.5,
    lacunarity = 2.0,
    scale = 1.0,
  } = options;

  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise4d(x * frequency, y * frequency, z * frequency, w * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * 4D Ridged noise — absolute value of fBm, creates sharp features.
 */
export function ridged4d(x, y, z, w, options = {}) {
  const { octaves = 6, persistence = 0.5, lacunarity = 2.0, scale = 1.0, gain = 2.0 } = options;

  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let weight = 1;

  for (let i = 0; i < octaves; i++) {
    let signal = Math.abs(noise4d(x * frequency, y * frequency, z * frequency, w * frequency));
    signal = 1 - signal; // invert for ridges
    signal *= signal; // square for sharpness
    signal *= weight;
    weight = Math.min(1, Math.max(0, signal * gain));
    value += amplitude * signal;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value;
}

/**
 * 4D Turbulence — absolute value of fBm (no inversion).
 */
export function turbulence4d(x, y, z, w, options = {}) {
  const { octaves = 6, persistence = 0.5, lacunarity = 2.0, scale = 1.0 } = options;

  let value = 0;
  let amplitude = 1;
  let frequency = scale;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * Math.abs(noise4d(x * frequency, y * frequency, z * frequency, w * frequency));
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value;
}

// ── Analytical Surface Functions ──────────────────────────────────

/**
 * 4D Hypersphere density function.
 * Returns density at point (x,y,z,w) for a hypersphere of given radius.
 */
export function hypersphereDensity(cx, cy, cz, cw, radius) {
  return (x, y, z, w) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const dw = w - cw;
    const r2 = dx * dx + dy * dy + dz * dz + dw * dw;
    return Math.max(0, 1 - r2 / (radius * radius));
  };
}

/**
 * 4D Torus density (Clifford torus).
 */
export function torus4dDensity(R, r) {
  return (x, y, z, w) => {
    const d1 = Math.sqrt(x * x + y * y) - R;
    const d2 = Math.sqrt(z * z + w * w) - r;
    const d2_total = d1 * d1 + d2 * d2;
    return Math.max(0, 1 - d2_total / 0.5);
  };
}

/**
 * 4D Gyroid density (triply periodic surface extended to 4D).
 */
export function gyroid4dDensity(scale = 1.0) {
  return (x, y, z, w) => {
    const s = scale;
    const gx = Math.cos(x * s) * Math.sin(y * s) + Math.cos(y * s) * Math.sin(z * s);
    const gy = Math.cos(y * s) * Math.sin(z * s) + Math.cos(z * s) * Math.sin(w * s);
    const gz = Math.cos(z * s) * Math.sin(w * s) + Math.cos(w * s) * Math.sin(x * s);
    const gw = Math.cos(w * s) * Math.sin(x * s) + Math.cos(x * s) * Math.sin(y * s);
    return Math.max(0, 0.3 - Math.sqrt(gx * gx + gy * gy + gz * gz + gw * gw));
  };
}

/**
 * 4D Sphere grid — multiple hyperspheres in a grid pattern.
 */
export function sphereGrid4d(count, radius, spacing) {
  return (x, y, z, w) => {
    let density = 0;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        for (let k = 0; k < count; k++) {
          for (let l = 0; l < count; l++) {
            const cx = (i - (count - 1) / 2) * spacing;
            const cy = (j - (count - 1) / 2) * spacing;
            const cz = (k - (count - 1) / 2) * spacing;
            const cw = (l - (count - 1) / 2) * spacing;
            const dx = x - cx;
            const dy = y - cy;
            const dz = z - cz;
            const dw = w - cw;
            const d2 = dx * dx + dy * dy + dz * dz + dw * dw;
            density += Math.max(0, 1 - d2 / (radius * radius));
          }
        }
      }
    }
    return Math.min(1, density);
  };
}

// ── Domain Warping ───────────────────────────────────────────────

/**
 * Apply 4D domain warping to any density function.
 * Warps the input coordinates using noise before evaluating.
 */
export function warp4d(fn, warpStrength = 0.5, warpScale = 0.3) {
  return (x, y, z, w) => {
    const wx = x + warpStrength * noise4d(x * warpScale, y * warpScale, z * warpScale, w * warpScale);
    const wy = y + warpStrength * noise4d(x * warpScale + 100, y * warpScale + 100, z * warpScale + 100, w * warpScale + 100);
    const wz = z + warpStrength * noise4d(x * warpScale + 200, y * warpScale + 200, z * warpScale + 200, w * warpScale + 200);
    const ww = w + warpStrength * noise4d(x * warpScale + 300, y * warpScale + 300, z * warpScale + 300, w * warpScale + 300);
    return fn(wx, wy, wz, ww);
  };
}
