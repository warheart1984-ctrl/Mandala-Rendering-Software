export class LightingSystem {
  constructor() {
    this.ambient = { r: 0.1, g: 0.1, b: 0.1 };
    this.lights = [];
    this.enabled = true;
  }

  setAmbient(r, g, b) {
    this.ambient = { r, g, b };
    return this;
  }

  addLight(type, options = {}) {
    const light = {
      id: options.id ?? `light_${this.lights.length}`,
      type,
      enabled: options.enabled ?? true,
      position: options.position ?? { x: 0, y: 0, z: 0, w: 0 },
      direction: options.direction ? this._normalize4(options.direction) : { x: 0, y: 0, z: -1, w: 0 },
      color: options.color ?? { r: 1, g: 1, b: 1 },
      intensity: options.intensity ?? 1.0,
      attenuation: options.attenuation ?? { constant: 1, linear: 0, quadratic: 0 },
      angle: options.angle ?? Math.PI / 4,
      penumbra: options.penumbra ?? 0.2,
      shadow: options.shadow ?? false,
      metadata: options.metadata ?? {},
    };
    this.lights.push(light);
    return light;
  }

  removeLight(id) {
    this.lights = this.lights.filter((l) => l.id !== id);
    return this;
  }

  getLight(id) {
    return this.lights.find((l) => l.id === id);
  }

  getEnabledLights() {
    return this.lights.filter((l) => l.enabled);
  }

  evaluate(position4D, normal4D) {
    if (!this.enabled) return { ambient: this.ambient, diffuse: { r: 0, g: 0, b: 0 }, specular: { r: 0, g: 0, b: 0 } };

    let diffuse = { r: 0, g: 0, b: 0 };
    let specular = { r: 0, g: 0, b: 0 };

    for (const light of this.getEnabledLights()) {
      if (light.type === "directional") {
        const contribution = this._evalDirectional(light, normal4D);
        diffuse = this._addColor(diffuse, contribution.diffuse);
        specular = this._addColor(specular, contribution.specular);
      } else if (light.type === "point") {
        const contribution = this._evalPoint(light, position4D, normal4D);
        diffuse = this._addColor(diffuse, contribution.diffuse);
        specular = this._addColor(specular, contribution.specular);
      }
    }

    return { ambient: this.ambient, diffuse, specular };
  }

  _evalDirectional(light, normal4D) {
    const nx = normal4D?.x ?? 0, ny = normal4D?.y ?? 0, nz = normal4D?.z ?? 0, nw = normal4D?.w ?? 0;
    const lx = light.direction.x, ly = light.direction.y, lz = light.direction.z, lw = light.direction.w;
    const dDotN = -(lx * nx + ly * ny + lz * nz + lw * nw);
    const intensity = Math.max(0, dDotN) * light.intensity;
    return {
      diffuse: { r: light.color.r * intensity, g: light.color.g * intensity, b: light.color.b * intensity },
      specular: { r: 0, g: 0, b: 0 },
    };
  }

  _evalPoint(light, position4D, normal4D) {
    const dx = light.position.x - position4D.x;
    const dy = light.position.y - position4D.y;
    const dz = light.position.z - position4D.z;
    const dw = light.position.w - position4D.w;
    const dist2 = dx * dx + dy * dy + dz * dz + dw * dw;
    const dist = Math.sqrt(dist2);
    if (dist === 0) return { diffuse: { r: 0, g: 0, b: 0 }, specular: { r: 0, g: 0, b: 0 } };

    const attenuation = 1 / (light.attenuation.constant + light.attenuation.linear * dist + light.attenuation.quadratic * dist2);
    const nx = normal4D?.x ?? 0, ny = normal4D?.y ?? 0, nz = normal4D?.z ?? 0, nw = normal4D?.w ?? 0;
    const dDotN = (dx * nx + dy * ny + dz * nz + dw * nw) / dist;
    const intensity = Math.max(0, dDotN) * light.intensity * attenuation;
    return {
      diffuse: { r: light.color.r * intensity, g: light.color.g * intensity, b: light.color.b * intensity },
      specular: { r: 0, g: 0, b: 0 },
    };
  }

  _normalize4(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
    if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
    return { x: v.x / len, y: v.y / len, z: v.z / len, w: v.w / len };
  }

  _addColor(a, b) {
    return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b };
  }

  toJSON() {
    return {
      enabled: this.enabled,
      ambient: this.ambient,
      lights: this.lights,
    };
  }

  static fromJSON(json) {
    const sys = new LightingSystem();
    sys.enabled = json.enabled ?? true;
    sys.ambient = json.ambient ?? { r: 0.1, g: 0.1, b: 0.1 };
    sys.lights = json.lights ?? [];
    return sys;
  }
}
