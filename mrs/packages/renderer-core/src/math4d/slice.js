/**
 * Hyperplane slicing controller — modes: static / orbit / slide.
 * Status: **enforced** for mode dispatch; mesh clip via SoT `clip.js`.
 */

import { createHyperplane } from "../math/hyperplane.js";
import { clipTriangle, clipMesh } from "../math/clip.js";
import { rot4FromAngles } from "./rot4.js";
import { mat4apply } from "../math/so4.js";
import { normalize } from "../math/vec4.js";

export const SLICE_MODES = Object.freeze(["static", "orbit", "slide"]);

/**
 * @typedef {{
 *   mode: "static"|"orbit"|"slide",
 *   normal: {x,y,z,w},
 *   offset: number,
 *   orbitAngles?: import("./rot4.js").PlaneAngles,
 *   orbitSpeed?: number,
 *   slideSpeed?: number,
 *   basis?: Array,
 * }} SliceState
 */

/**
 * Evaluate slice hyperplane at time t.
 * @param {SliceState} state
 * @param {number} t
 */
export function evaluateSlice(state, t = 0) {
  const mode = state.mode ?? "static";
  let n = state.normal ?? { x: 0, y: 0, z: 0, w: 1 };
  let d = state.offset ?? 0;

  if (mode === "orbit") {
    const speed = state.orbitSpeed ?? 1;
    const angles = state.orbitAngles ?? {
      xw: t * speed * 0.7,
      yz: t * speed * 1.1,
      zw: t * speed * 1.5,
      yw: t * speed * 2.0,
    };
    const R = rot4FromAngles(angles);
    n = normalize(mat4apply(R, n));
  } else if (mode === "slide") {
    const speed = state.slideSpeed ?? 1;
    d = (state.offset ?? 0) + speed * t;
  }

  const plane = createHyperplane(n, d);
  return { normal: plane.n, offset: plane.d, plane, basis: state.basis, mode };
}

/**
 * Slice one triangle → 0–2 triangles on the inside half-space.
 */
export function sliceTriangle(plane, v0, v1, v2) {
  return clipTriangle(plane, v0, v1, v2);
}

/**
 * Slice a mesh (vertices + faces).
 */
export function sliceMesh(plane, vertices, faces) {
  return clipMesh(plane, vertices, faces);
}

/**
 * Apply Camera4D orbit/slide convenience when a camera is provided.
 * @param {import("../camera/Camera4D.js").Camera4D} camera
 * @param {"static"|"orbit"|"slide"} mode
 * @param {number} t
 * @param {number} [speed]
 */
export function applySliceModeToCamera(camera, mode, t, speed = 1) {
  if (mode === "orbit") camera.orbit(t, speed);
  else if (mode === "slide") camera.slide(speed, t);
  return camera;
}
