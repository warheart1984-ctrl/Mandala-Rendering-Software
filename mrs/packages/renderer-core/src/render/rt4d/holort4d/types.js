/**
 * HoloRT4D data structures as specified. Encode, do not invent new physics.
 */

export const TWO_PI = 2 * Math.PI;

/** Default RGB wavelengths (meters). Cannot fake RGB with one λ. */
export const LAMBDA_R = 650e-9;
export const LAMBDA_G = 530e-9;
export const LAMBDA_B = 450e-9;

export const TILE_SIZE = 16;
export const TILE_SIZE_X = 16;
export const TILE_SIZE_Y = 16;

export const POLAR_BANKS = 32;
/** SoA row stride: 16 columns + 1 pad so adjacent columns are not stride-32. */
export const POLAR_TILE_STRIDE = 16 + 1;

/**
 * @typedef {object} HoloCamera
 * @property {{x:number,y:number,z:number}} origin
 * @property {number} wOrigin
 * @property {{x:number,y:number,z:number,w:number}} u
 * @property {{x:number,y:number,z:number,w:number}} v
 * @property {{x:number,y:number,z:number,w:number}} n
 * @property {number} width
 * @property {number} height
 * @property {number} resX
 * @property {number} resY
 * @property {number} lambda
 * @property {number} k
 */

/**
 * @typedef {object} ComplexFieldPixel
 * @property {number} real
 * @property {number} imag
 */

/**
 * Frozen 64-byte PathSample — see path-sample.js. Do not change layout.
 * pixelId = py * frameWidth + px (raygen idx when 1 thread/pixel).
 * opticalLength / pixelId / bounceId are FINALIZE ONLY (offsets 48–59).
 *
 * @typedef {object} PathSample
 * @property {{x:number,y:number,z:number}} [pos]
 * @property {number} [w]
 * @property {{x:number,y:number,z:number,w?:number}} [dir]
 * @property {number} [wl]
 * @property {number|{x:number,y:number,z:number}|number[]} [radiance]
 * @property {number} [weight]
 * @property {number} [opticalLength]
 * @property {number} [pixelId]
 * @property {number} [bounceId]
 */

export function createHoloCamera(opts = {}) {
  const lambda = Number(opts.lambda ?? 550e-9);
  return {
    origin: opts.origin ?? { x: 0, y: 0, z: 0 },
    wOrigin: Number(opts.wOrigin ?? 0),
    u: opts.u ?? { x: 1, y: 0, z: 0, w: 0 },
    v: opts.v ?? { x: 0, y: 1, z: 0, w: 0 },
    n: opts.n ?? { x: 0, y: 0, z: 1, w: 0 },
    width: Number(opts.width ?? 1),
    height: Number(opts.height ?? 1),
    resX: Number(opts.resX ?? 16),
    resY: Number(opts.resY ?? 16),
    lambda,
    k: TWO_PI / lambda,
  };
}

export function createComplexField(resX, resY) {
  const n = resX * resY;
  const field = new Array(n);
  for (let i = 0; i < n; i++) field[i] = { real: 0, imag: 0 };
  return field;
}

export function createRgbFields(resX, resY) {
  return {
    fieldR: createComplexField(resX, resY),
    fieldG: createComplexField(resX, resY),
    fieldB: createComplexField(resX, resY),
  };
}

export function wavenumber(lambda) {
  return TWO_PI / lambda;
}
