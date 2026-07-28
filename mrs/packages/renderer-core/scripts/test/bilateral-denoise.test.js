/**
 * BilateralDenoiser determinism smoke — same buffer twice → same filterHash.
 */
import assert from "node:assert/strict";
import { bilateralFilter } from "../../src/render/rt4d/denoiser/BilateralDenoiser.js";

const width = 8;
const height = 8;
const rgba = new Uint8Array(width * height * 4);
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i] = (i * 17) % 256;
  rgba[i + 1] = (i * 29) % 256;
  rgba[i + 2] = (i * 43) % 256;
  rgba[i + 3] = 255;
}

const a = bilateralFilter(Uint8Array.from(rgba), width, height, { iterations: 1 });
const b = bilateralFilter(Uint8Array.from(rgba), width, height, { iterations: 1 });
assert.equal(a.filterHash, b.filterHash);
assert.equal(a.denoised.length, rgba.length);
console.log("bilateral-denoise.test.js: PASS");
