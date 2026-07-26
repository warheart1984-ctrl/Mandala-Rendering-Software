const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const gradient = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

function nextSeed(state) {
  let value = state.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

/** Deterministic seeded improved Perlin noise in three dimensions. */
export class Perlin3 {
  constructor(seed = 0) {
    const values = Array.from({ length: 256 }, (_, index) => index);
    const state = { value: (Number(seed) >>> 0) || 0x9e3779b9 };
    for (let index = values.length - 1; index > 0; index--) {
      const swapIndex = nextSeed(state) % (index + 1);
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    this.permutation = [...values, ...values];
  }

  noise(x, y, z) {
    const xFloor = Math.floor(x), yFloor = Math.floor(y), zFloor = Math.floor(z);
    const xi = xFloor & 255, yi = yFloor & 255, zi = zFloor & 255;
    const xf = x - xFloor, yf = y - yFloor, zf = z - zFloor;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const p = this.permutation;
    const aaa = p[p[p[xi] + yi] + zi];
    const aba = p[p[p[xi] + yi + 1] + zi];
    const aab = p[p[p[xi] + yi] + zi + 1];
    const abb = p[p[p[xi] + yi + 1] + zi + 1];
    const baa = p[p[p[xi + 1] + yi] + zi];
    const bba = p[p[p[xi + 1] + yi + 1] + zi];
    const bab = p[p[p[xi + 1] + yi] + zi + 1];
    const bbb = p[p[p[xi + 1] + yi + 1] + zi + 1];
    const x00 = lerp(gradient(aaa, xf, yf, zf), gradient(baa, xf - 1, yf, zf), u);
    const x10 = lerp(gradient(aba, xf, yf - 1, zf), gradient(bba, xf - 1, yf - 1, zf), u);
    const x01 = lerp(gradient(aab, xf, yf, zf - 1), gradient(bab, xf - 1, yf, zf - 1), u);
    const x11 = lerp(gradient(abb, xf, yf - 1, zf - 1), gradient(bbb, xf - 1, yf - 1, zf - 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }
}

export const perlin3 = (x, y, z, seed = 0) => new Perlin3(seed).noise(x, y, z);
