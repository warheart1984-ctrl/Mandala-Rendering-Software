import { Scene4D } from "./Scene4D.js";
import { Hypersphere, Hyperplane, ImplicitHypersurface } from "../geometry/hypersurface.js";
import { ExponentialFog } from "../geometry/volume.js";
import { Camera4D } from "../camera/Camera4D.js";
import { vec4, length, sub } from "../math/vec4.js";

export function createHyperCausticLens(options = {}) {
  const scene = new Scene4D();

  const width = options.width ?? 640;
  const height = options.height ?? 480;

  // === 1. Hyper-Lens (refractive hypersphere with w-dependent behavior) ===
  const lensRadius = options.lensRadius ?? 1.2;
  const lens = new Hypersphere(vec4(0, 0, 0, 0), lensRadius);
  scene.materials.createMaterial("hyperlens_inner", "ggx", {
    albedo: vec4(0.02, 0.02, 0.02, 1),
    roughness: 0.01,
    f0: vec4(1.4, 1.4, 1.4, 1),
  });
  lens.materialId = "hyperlens_inner";
  scene.addPrimitive(lens, "hyperlens_inner");

  // === 2. Back wall (hyperplane at z = +1.8) ===
  const wall = new Hyperplane(vec4(0, 0, 1, 0), 1.8);
  scene.materials.createMaterial("wall", "lambertian", {
    albedo: vec4(0.9, 0.9, 0.95, 1),
  });
  wall.materialId = "wall";
  scene.addPrimitive(wall, "wall");

  // === 3. Hyper-area light (w = +0.5 slice) ===
  const light = new Hypersphere(vec4(0, 0, -1, 0.5), 0.15);
  scene.materials.createMaterial("lgt", "light", {
    albedo: vec4(1, 1, 1, 1),
    emission: vec4(8, 8, 8, 8),
  });
  light.materialId = "lgt";
  scene.addLight(light, "lgt");

  // === 4. 4D volumetric fog (density varies with w) ===
  const fog = new ExponentialFog({
    baseSigmaT: 0.15,
    falloff: 1.5,
    densityScale: 1.0,
    asymmetry: 0.1,
    bounds: {
      min: vec4(-2.5, -2.5, -2, -2),
      max: vec4(2.5, 2.5, 2, 2),
    },
  });
  scene.materials.createMaterial("fog_medium", "volume", {
    phase: "hg",
    asymmetry: 0.1,
    sigmaT: 0.15,
    sigmaS: 0.12,
    emit: vec4(0, 0, 0, 0),
  });
  fog.materialId = "fog_medium";
  scene.addVolume(fog, "fog_medium");

  // === 5. Camera ===
  const camera = new Camera4D({
    x: options.camX ?? 0, y: options.camY ?? 0, z: options.camZ ?? -2.5, w: options.camW ?? 0,
    lx: 0, ly: 0, lz: 0, lw: 0,
    fovX: 50, fovY: 50, fovZ: 50, fovW: 35,
    width, height,
  });

  scene.build();

  return { scene, camera, projector: null };
}
