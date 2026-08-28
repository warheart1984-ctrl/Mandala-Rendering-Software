/**
 * Hyperplane projection: 4D → 3D coords in (e1,e2,e3).
 * Pipeline stage 3 (infographic): H: n·x = d; clip & project onto (e1,e2,e3) → x_3D.
 * Status: **enforced** — uses SoT hyperplaneBasis / projectOntoHyperplane.
 * Mesh clip is `clipTriangle` / `sliceMesh`, not this point projector.
 */

import {
  createHyperplane,
  signedDistance,
  projectOntoHyperplane,
  hyperplaneBasis,
} from "../math/hyperplane.js";
import { dot } from "../math/vec4.js";

/**
 * Project point onto hyperplane then express in orthonormal basis (e1,e2,e3).
 * @param {{ n: {x,y,z,w}, d: number } | { normal: {x,y,z,w}, offset: number }} slice
 * @param {{x,y,z,w}} point
 * @returns {{ p3: {x,y,z}, onPlane: {x,y,z,w}, basis: Array, signedDistance: number }}
 */
export function projectToSlice3D(slice, point) {
  const plane =
    slice.n != null
      ? { n: slice.n, d: slice.d ?? 0 }
      : createHyperplane(slice.normal ?? slice.n, slice.offset ?? slice.d ?? 0);
  const dist = signedDistance(plane, point);
  const onPlane = projectOntoHyperplane(plane, point);
  const basis = slice.basis ?? hyperplaneBasis(plane.n);
  const p3 = {
    x: dot(basis[0], onPlane),
    y: dot(basis[1], onPlane),
    z: dot(basis[2], onPlane),
  };
  return { p3, onPlane, basis, signedDistance: dist };
}

export {
  createHyperplane,
  signedDistance,
  projectOntoHyperplane,
  hyperplaneBasis,
};
