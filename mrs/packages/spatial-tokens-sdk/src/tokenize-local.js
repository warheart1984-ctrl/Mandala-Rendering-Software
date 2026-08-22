/**
 * Local tokenize alias — enforced math path.
 */

import { tokenizeFromDepthGrid } from "../../../renderer-core/src/render/rt4d/holort4d/spatial-tokens/index.js";

/**
 * @param {Float32Array|number[]} depthF32
 * @param {object} opts
 */
export function tokenize(depthF32, opts) {
  return tokenizeFromDepthGrid(depthF32, opts);
}
