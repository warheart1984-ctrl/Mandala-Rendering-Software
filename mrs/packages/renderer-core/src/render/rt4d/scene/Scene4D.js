import { BVH4D } from "../accel/BVH4D.js";
import { MaterialSystem } from "../material/MaterialSystem.js";
import { vec4, dot, normalize, sub, length } from "../math/vec4.js";

export class Scene4D {
  constructor() {
    this.primitives = [];
    this.volumes = [];
    this.lights = [];
    this.materials = new MaterialSystem();
    this.bvh = null;
    this.envLight = null;
  }

  addPrimitive(prim, materialId) {
    prim.materialId = materialId;
    this.primitives.push(prim);
    return this;
  }

  addVolume(vol, materialId) {
    vol.materialId = materialId;
    this.volumes.push(vol);
    return this;
  }

  addLight(prim, materialId) {
    prim.materialId = materialId;
    this.primitives.push(prim);
    this.lights.push(prim);
    return this;
  }

  setEnvironment(emission) {
    this.envLight = emission;
    return this;
  }

  build() {
    const allBounded = this.primitives.length > 0 &&
      this.primitives.every((p) => typeof p.getBounds === "function");
    this.bvh = allBounded ? new BVH4D(this.primitives) : null;
    return this;
  }

  getMaterial(id) {
    return this.materials.get(id);
  }

  getLights() {
    return this.lights;
  }

  intersect(ray) {
    let closestHit = null;

    if (this.bvh) {
      closestHit = this.bvh.traverse(ray);
    } else {
      for (const prim of this.primitives) {
        const hit = prim.intersect(ray);
        if (hit && (!closestHit || hit.t < closestHit.t)) closestHit = hit;
      }
    }

    for (const vol of this.volumes) {
      const mat = this.materials.get(vol.materialId);
      if (mat && mat.sigmaT > 0) {
        const volHit = vol.intersect?.(ray);
        if (volHit && (!closestHit || volHit.t < closestHit.t)) {
          volHit.isVolume = true;
          closestHit = volHit;
        }
      }
    }

    return closestHit;
  }

  getEnvironment(ray) {
    if (!this.envLight) return vec4(0, 0, 0, 0);
    return this.envLight;
  }
}
