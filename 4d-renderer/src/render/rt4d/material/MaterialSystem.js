import { Lambertian4D } from "./bsdf4d.js";
import { GGX4D } from "./ggx4d.js";
import { Isotropic4D, HenyeyGreenstein4D } from "./phase4d.js";
import { vec4 } from "../math/vec4.js";

export class MaterialSystem {
  constructor() {
    this._materials = new Map();
    this._default = null;
    this._initDefaults();
  }

  _initDefaults() {
    const def = this.createMaterial("default", "lambertian", { albedo: vec4(0.8, 0.8, 0.8, 1) });
    this._default = def;
    this.createMaterial("hyperlens", "ggx", { albedo: vec4(0.1, 0.1, 0.1, 1), roughness: 0.05, f0: vec4(1.5, 1.5, 1.5, 1) });
    this.createMaterial("light", "lambertian", { albedo: vec4(1, 1, 1, 1) });
    this.createMaterial("fog", "volume", { phase: "hg", asymmetry: 0.3, sigmaT: 1, sigmaS: 0.8, emit: vec4(0, 0, 0, 0) });
  }

  createMaterial(id, type, params = {}) {
    let bsdf;
    let phase;
    let emission = vec4(0, 0, 0, 0);

    switch (type) {
      case "lambertian":
        bsdf = new Lambertian4D(params.albedo);
        break;
      case "ggx":
        bsdf = new GGX4D(params.albedo, params.roughness, params.f0);
        break;
      case "light":
        bsdf = new Lambertian4D(params.albedo ?? vec4(1, 1, 1, 1));
        emission = params.emission ?? vec4(10, 10, 10, 10);
        break;
      case "volume":
        phase = params.asymmetry != null ? new HenyeyGreenstein4D(params.asymmetry) : new Isotropic4D();
        emission = params.emit ?? vec4(0, 0, 0, 0);
        break;
      default:
        bsdf = new Lambertian4D(vec4(0.8, 0.8, 0.8, 1));
    }

    const mat = {
      id,
      type,
      bsdf,
      phase: phase ?? null,
      emission,
      sigmaT: params.sigmaT ?? 0,
      sigmaS: params.sigmaS ?? 0,
      isVolume: type === "volume",
      isLight: type === "light",
      params,
    };

    this._materials.set(id, mat);
    return mat;
  }

  get(id) {
    return this._materials.get(id) ?? this._default;
  }

  has(id) {
    return this._materials.has(id);
  }

  listIds() {
    return Array.from(this._materials.keys());
  }
}
