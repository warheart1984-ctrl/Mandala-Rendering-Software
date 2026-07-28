import { BVH4D } from "../accel/BVH4D.js";
import { MaterialSystem } from "../material/MaterialSystem.js";
import { TextureRegistry } from "../material/TextureRegistry.js";
import { resolveTexturedMaterial } from "../material/TextureShading.js";
import { SkinnedMeshIntersector } from "../intersection/SkinnedMeshIntersector.js";
import { wrapPrimitiveIntersector } from "../geometry/PrimitiveIntersectors.js";
import { environmentToEmission, normalizeRt4dLight } from "../lighting/Rt4dLightAdapter.js";
import { vec4, dot, normalize, sub, length } from "../math/vec4.js";
import { TriangleMesh4D } from "../geometry/TriangleMesh4D.js";

export class Scene4D {
  constructor() {
    this.primitives = [];
    this.volumes = [];
    this.lights = [];
    this.rt4dLights = [];
    this.materials = new MaterialSystem();
    this.textures = new TextureRegistry();
    this.bvh = null;
    this.envLight = null;
    this.environment = null;
  }

  addPrimitive(prim, materialId) {
    prim.materialId = materialId;
    if ((prim.kind === "skinned-mesh" || prim.kind === "poly") && typeof prim.intersect !== "function") {
      const intersector = new SkinnedMeshIntersector({ ...prim, materialId });
      prim.intersect = (ray) => intersector.intersect(ray);
    }
    wrapPrimitiveIntersector(prim, materialId);
    this.primitives.push(prim);
    return this;
  }

  addTriangleMesh(mesh, materialId) {
    if (mesh.kind !== "triangle-mesh") {
      mesh = new TriangleMesh4D(mesh);
    }
    mesh.materialId = materialId;
    const intersector = new SkinnedMeshIntersector(mesh);
    mesh.intersect = (ray) => intersector.intersect(ray);
    wrapPrimitiveIntersector(mesh, materialId);
    this.primitives.push(mesh);
    if (mesh.materialSlots) {
      for (const slotId of new Set(Object.values(mesh.materialSlots))) {
        if (!this.materials.get(slotId)) {
          this.materials.createMaterial(slotId, "lambertian", { albedo: [0.8, 0.8, 0.8, 1] });
        }
      }
    }
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

  setRt4dEnvironment(environment) {
    this.environment = environment;
    this.envLight = environmentToEmission(environment);
    return this;
  }

  setLightRig(lightRig = []) {
    this.rt4dLights = lightRig.map(normalizeRt4dLight);
    return this;
  }

  consumeBridgeLighting(bridgeScene) {
    if (Array.isArray(bridgeScene?.lightRig)) this.setLightRig(bridgeScene.lightRig);
    if (bridgeScene?.environment) this.setRt4dEnvironment(bridgeScene.environment);
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

  getShadedMaterial(id, hit) {
    return resolveTexturedMaterial(this.getMaterial(id), hit, this.textures);
  }

  getLights() {
    return this.lights;
  }

  getRt4dLights() {
    return this.rt4dLights;
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
