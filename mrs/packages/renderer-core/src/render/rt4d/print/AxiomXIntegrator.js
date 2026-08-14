const Q = 65536n;
const PI_Q = 205887n;
const PI2_Q = 647911n;
const PLANE_Z = -262144n;
const LIGHT_R = 98304n;
const ALBEDO_Q = 45875n;
const EMISSION_Q = 2097152n;
const M32_ADD = 0x6d2b79f5n;
const MIX_X = 0x9e3779b9n;
const MIX_Y = 0x85ebca77n;
const MASK32 = 0xffffffffn;

function m32step(s) {
  s = (s + M32_ADD) & MASK32;
  let t = s;
  t = ((t ^ (t >> 15n)) * (t | 1n)) & MASK32;
  t = (t ^ ((t + (((t ^ (t >> 7n)) * (t | 61n)) & MASK32)) & MASK32)) & MASK32;
  return (t ^ (t >> 14n)) & MASK32;
}

function isqrt64(n) {
  if (n === 0n) return 0n;
  let x = 1n << 31n;
  for (let i = 0; i < 32; i++) x = (x + n / x) >> 1n;
  while ((x + 1n) * (x + 1n) <= n) x++;
  while (x * x > n) x--;
  return x;
}

function s3Uniform(s) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const v = new Array(4);
    let r2 = 0n;
    for (let k = 0; k < 4; k++) {
      s = m32step(s);
      v[k] = (s & 0xffffn) * 2n - Q;
      r2 += v[k] * v[k];
    }
    r2 >>= 16n;
    if (r2 > 0n && r2 <= Q) {
      const r = isqrt64(r2 << 16n);
      if (r > 0n) {
        const n = new Array(4);
        for (let k = 0; k < 4; k++) n[k] = (v[k] << 16n) / r;
        return { n, s };
      }
    }
  }
  return { n: [Q, 0n, 0n, 0n], s };
}

export function renderPixel(seed, spp, width, height, gx, gy) {
  let s = (BigInt(seed >>> 0) ^ ((BigInt(gx) * MIX_X) & MASK32) ^ ((BigInt(gy) * MIX_Y) & MASK32)) & MASK32;
  const cx = BigInt(gx) - BigInt(Math.floor((width - 1) / 2));
  const cy = BigInt(gy) - BigInt(Math.floor((height - 1) / 2));
  const d0 = (2n * cx * Q) / BigInt(width);
  const d1 = (2n * cy * Q) / BigInt(height);
  const d2 = -Q;
  const len2 = (d0 * d0 + d1 * d1 + d2 * d2) >> 16n;
  const len = isqrt64(len2 << 16n);
  const nd0 = (d0 << 16n) / len;
  const nd1 = (d1 << 16n) / len;
  const nd2 = (d2 << 16n) / len;
  const t = (PLANE_Z << 16n) / nd2;
  const px = (t * nd0) >> 16n;
  const py = (t * nd1) >> 16n;
  const pz = (t * nd2) >> 16n;
  const R3 = (LIGHT_R * LIGHT_R * LIGHT_R) >> 32n;
  const A = (2n * PI2_Q * R3) >> 16n;
  const pdfArea = (1n << 32n) / A;
  const f = (3n * ALBEDO_Q * Q) / (4n * PI_Q);
  let acc0 = 0n, acc1 = 0n, acc2 = 0n;
  for (let i = 0; i < spp; i++) {
    const { n, s: sNext } = s3Uniform(s);
    s = sNext;
    const lp0 = (LIGHT_R * n[0]) >> 16n;
    const lp1 = (LIGHT_R * n[1]) >> 16n;
    const lp2 = (LIGHT_R * n[2]) >> 16n;
    const lp3 = (LIGHT_R * n[3]) >> 16n;
    const toL0 = lp0 - px;
    const toL1 = lp1 - py;
    const toL2 = lp2 - pz;
    const toL3 = lp3;
    const dist2 = (toL0 * toL0 + toL1 * toL1 + toL2 * toL2 + toL3 * toL3) >> 16n;
    if (dist2 === 0n) continue;
    const dist = isqrt64(dist2 << 16n);
    const wo0 = (toL0 << 16n) / dist;
    const wo1 = (toL1 << 16n) / dist;
    const wo2 = (toL2 << 16n) / dist;
    const wo3 = (toL3 << 16n) / dist;
    const dotN = (wo0 * n[0] + wo1 * n[1] + wo2 * n[2] + wo3 * n[3]) >> 16n;
    const cosLight = dotN < 0n ? -dotN : 0n;
    if (cosLight <= 0n) continue;
    const cosTheta = wo2;
    if (cosTheta <= 0n) continue;
    const d3 = (dist * dist * dist) >> 32n;
    const num = (pdfArea * d3) >> 16n;
    const pdf = (num << 16n) / cosLight;
    const n1 = (EMISSION_Q * f) >> 16n;
    const n2 = (n1 * cosTheta) >> 16n;
    const c = (n2 << 16n) / pdf;
    acc0 += c; acc1 += c; acc2 += c;
  }
  let b0 = (acc0 * 255n) / (BigInt(spp) * Q);
  let b1 = (acc1 * 255n) / (BigInt(spp) * Q);
  let b2 = (acc2 * 255n) / (BigInt(spp) * Q);
  if (b0 > 255n) b0 = 255n; if (b0 < 0n) b0 = 0n;
  if (b1 > 255n) b1 = 255n; if (b1 < 0n) b1 = 0n;
  if (b2 > 255n) b2 = 255n; if (b2 < 0n) b2 = 0n;
  return [Number(b0), Number(b1), Number(b2), 255];
}

export function renderAxiomXIntegrator(seed, spp, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = renderPixel(seed, spp, width, height, x, y);
      const o = (y * width + x) * 4;
      out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = p[3];
    }
  }
  return out;
}

export { m32step, isqrt64, s3Uniform, Q, PI_Q, PI2_Q, PLANE_Z, LIGHT_R, ALBEDO_Q, EMISSION_Q, M32_ADD, MIX_X, MIX_Y };