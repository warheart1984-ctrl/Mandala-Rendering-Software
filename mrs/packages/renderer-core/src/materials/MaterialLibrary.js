import { Material } from "./Material.js";

export class MaterialLibrary {
  constructor() {
    this._materials = new Map();
    this._default = null;
    this._initDefaults();
  }

  _initDefaults() {
    const defaultMat = new Material("default", "standard");
    this._materials.set("default", defaultMat);
    this._default = defaultMat;

    this._materials.set("wireframe", new Material("wireframe", "standard").setColor(0.8, 0.8, 0.9, 1).setPhong(0.3, 0.6, 0.2, 16));
    this._materials.set("emissive", new Material("emissive", "standard").setColor(1, 0.5, 0.2, 1).setEmissive(1, 0.5, 0.2));
    this._materials.set("glass", new Material("glass", "standard").setColor(0.9, 0.95, 1, 0.3).setPBR(0.1, 0.0).setTransparency(0.3, "alpha"));
    this._materials.set("metal", new Material("metal", "standard").setColor(0.8, 0.8, 0.9, 1).setPBR(0.3, 0.9));
    this._materials.set("flat", new Material("flat", "standard").setPhong(1, 0, 0, 1));
  }

  register(material) {
    this._materials.set(material.id, material);
    return this;
  }

  get(id) {
    return this._materials.get(id) ?? this._default;
  }

  has(id) {
    return this._materials.has(id);
  }

  remove(id) {
    this._materials.delete(id);
    return this;
  }

  list() {
    return Array.from(this._materials.keys());
  }

  create(id, baseId) {
    const base = baseId ? this.get(baseId) : this._default;
    const mat = base.clone(id);
    this.register(mat);
    return mat;
  }

  toJSON() {
    return this.list().map((id) => this._materials.get(id).toJSON());
  }

  static fromJSON(json) {
    const lib = new MaterialLibrary();
    for (const entry of json) {
      lib.register(Material.fromJSON(entry));
    }
    return lib;
  }
}
