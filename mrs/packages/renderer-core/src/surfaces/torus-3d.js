/**
 * 3D Torus embedded in 4D — standard torus with a w-axis oscillation.
 * Parametrization:
 *   x = (2 + cos v) cos u
 *   y = (2 + cos v) sin u
 *   z = sin v
 *   w = 0.5 sin(2u) sin(v)
 */
export const torus3d = {
  name: "3D Torus in 4D",
  id: "torus-3d",
  uRange: [0, 2 * Math.PI],
  vRange: [0, 2 * Math.PI],
  defaultResolution: 64,

  parametrize(u, v) {
    const R = 2;
    const r = 1;
    return {
      x: (R + r * Math.cos(v)) * Math.cos(u),
      y: (R + r * Math.cos(v)) * Math.sin(u),
      z: r * Math.sin(v),
      w: 0.5 * Math.sin(2 * u) * Math.sin(v),
    };
  },
};
