/**
 * 4D Trefoil Knot Surface — knotted surface in 4D space.
 * Parametrization creates a surface that wraps around a trefoil knot
 * with 4D variation.
 *
 * (u,v) → (
 *   (1 + 0.5 cos(3v)) cos(2u),
 *   (1 + 0.5 cos(3v)) sin(2u),
 *   0.5 sin(3v) cos(u),
 *   0.5 sin(3v) sin(u)
 * )
 */
export const trefoil4d = {
  name: "4D Trefoil Knot",
  id: "trefoil-4d",
  uRange: [0, 2 * Math.PI],
  vRange: [0, 2 * Math.PI],
  defaultResolution: 64,

  parametrize(u, v) {
    const r = 1 + 0.5 * Math.cos(3 * v);
    return {
      x: r * Math.cos(2 * u),
      y: r * Math.sin(2 * u),
      z: 0.5 * Math.sin(3 * v) * Math.cos(u),
      w: 0.5 * Math.sin(3 * v) * Math.sin(u),
    };
  },
};
