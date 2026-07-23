export class Material {
  constructor(id, type = "standard") {
    this.id = id;
    this.type = type;
    this.color = { r: 1, g: 1, b: 1, a: 1 };
    this.emissive = { r: 0, g: 0, b: 0 };
    this.roughness = 0.5;
    this.metalness = 0.0;
    this.ambient = 0.35;
    this.diffuse = 0.75;
    this.specular = 0.18;
    this.shininess = 24;
    this.transparency = 1.0;
    this.wireframeColor = null;
    this.wireframeWidth = 1.0;
    this.blendMode = "normal";
    this.depthWrite = true;
    this.depthTest = true;
    this.cullMode = "back";
    this.frontFace = "ccw";
  }

  setColor(r, g, b, a = 1) {
    this.color = { r, g, b, a };
    return this;
  }

  setEmissive(r, g, b) {
    this.emissive = { r, g, b };
    return this;
  }

  setPBR(roughness, metalness) {
    this.roughness = roughness;
    this.metalness = metalness;
    return this;
  }

  setPhong(ambient, diffuse, specular, shininess) {
    this.ambient = ambient;
    this.diffuse = diffuse;
    this.specular = specular;
    this.shininess = shininess;
    return this;
  }

  setTransparency(alpha, mode = "normal") {
    this.transparency = alpha;
    this.blendMode = mode;
    return this;
  }

  clone(newId) {
    const m = new Material(newId ?? this.id + "_copy", this.type);
    Object.assign(m, {
      color: { ...this.color },
      emissive: { ...this.emissive },
      roughness: this.roughness,
      metalness: this.metalness,
      ambient: this.ambient,
      diffuse: this.diffuse,
      specular: this.specular,
      shininess: this.shininess,
      transparency: this.transparency,
      wireframeColor: this.wireframeColor ? { ...this.wireframeColor } : null,
      wireframeWidth: this.wireframeWidth,
      blendMode: this.blendMode,
      depthWrite: this.depthWrite,
      depthTest: this.depthTest,
      cullMode: this.cullMode,
      frontFace: this.frontFace,
    });
    return m;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      color: this.color,
      emissive: this.emissive,
      roughness: this.roughness,
      metalness: this.metalness,
      ambient: this.ambient,
      diffuse: this.diffuse,
      specular: this.specular,
      shininess: this.shininess,
      transparency: this.transparency,
      wireframeColor: this.wireframeColor,
      wireframeWidth: this.wireframeWidth,
      blendMode: this.blendMode,
      depthWrite: this.depthWrite,
      depthTest: this.depthTest,
      cullMode: this.cullMode,
      frontFace: this.frontFace,
    };
  }

  static fromJSON(json) {
    const m = new Material(json.id, json.type);
    Object.assign(m, json);
    return m;
  }
}
