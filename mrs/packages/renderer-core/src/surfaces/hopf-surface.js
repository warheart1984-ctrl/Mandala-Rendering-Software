/**
 * Hopf Surface — a 2D surface on S³ derived from the Hopf fibration.
 * Parametrization creates a twisted torus that fills 4D space.
 * (u,v) → (cos u cos v, cos u sin v, sin u cos(v+π/4), sin u sin(v+π/4))
 */
export const hopfSurface = {
  name: "Hopf Surface",
  id: "hopf-surface",
  uRange: [0, 2 * Math.PI],
  vRange: [0, 2 * Math.PI],
  defaultResolution: 64,

  parametrize(u, v) {
    const phase = Math.PI / 4;
    return {
      x: Math.cos(u) * Math.cos(v),
      y: Math.cos(u) * Math.sin(v),
      z: Math.sin(u) * Math.cos(v + phase),
      w: Math.sin(u) * Math.sin(v + phase),
    };
  },
};
