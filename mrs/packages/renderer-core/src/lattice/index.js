/**
 * Lattice module — 4D voxel fields, noise, and isosurface extraction.
 */
export {
  createLattice,
  gridToWorld,
  worldToGrid,
  getDensity,
  setDensity,
  fillLattice,
  sampleLattice,
  latticeGradient,
  sliceLatticeAtW,
  latticeBounds,
  latticeStats,
} from "./lattice4d.js";

export {
  noise4d,
  fbm4d,
  ridged4d,
  turbulence4d,
  seedNoise,
  hypersphereDensity,
  torus4dDensity,
  gyroid4dDensity,
  sphereGrid4d,
  warp4d,
} from "./noise.js";

export { marchingCubes4D } from "./marching-cubes-4d.js";
