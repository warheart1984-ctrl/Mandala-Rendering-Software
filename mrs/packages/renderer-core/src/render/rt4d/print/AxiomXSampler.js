const M32_ADD = 0x6d2b79f5;
const MIX_X = 0x9e3779b9;
const MIX_Y = 0x85ebca77;
const ALPHA = 0xff000000;

function mulberry32Step(v) {
  let s = (v + M32_ADD) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  const oldT = t;
  const a = Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
  t = (oldT ^ ((oldT + a) >>> 0)) >>> 0;
  return (t ^ (t >>> 14)) >>> 0;
}

export function samplePixel(seed, x, y, spp) {
  let s = ((seed ^ Math.imul(x, MIX_X) ^ Math.imul(y, MIX_Y)) >>> 0);
  for (let i = 0; i < spp; i++) s = mulberry32Step(s);
  return (s | ALPHA) >>> 0;
}

export function renderAxiomX(seed, spp, width, height) {
  const n = width * height;
  const out = Buffer.alloc(n * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out.writeUInt32LE(samplePixel(seed, x, y, spp), (y * width + x) * 4);
    }
  }
  return out;
}

export { mulberry32Step, M32_ADD, MIX_X, MIX_Y, ALPHA };