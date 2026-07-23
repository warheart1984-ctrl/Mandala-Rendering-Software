/**
 * Clifford Torus — the fundamental 4D surface.
 * Parametrization: (u,v) → (cos u, sin u, cos v, sin v)
 * Lives on S¹ × S¹ embedded in ℝ⁴.
 */
export const cliffordTorus = {
  name: "Clifford Torus",
  id: "clifford-torus",
  uRange: [0, 2 * Math.PI],
  vRange: [0, 2 * Math.PI],
  defaultResolution: 64,

  parametrize(u, v) {
    return {
      x: Math.cos(u),
      y: Math.sin(u),
      z: Math.cos(v),
      w: Math.sin(v),
    };
  },
};
