export class PresetLibrary {
  constructor(options = {}) {
    this.presets = new Map();
    this.categories = new Map();
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? "4d-renderer-presets";
    this._loaded = false;
  }

  addPreset(name, data, category = "default", metadata = {}) {
    const preset = {
      name,
      category,
      data: this.normalizeData(data),
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        ...metadata,
      },
    };
    this.presets.set(name, preset);

    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    const catList = this.categories.get(category);
    if (!catList.includes(name)) {
      catList.push(name);
    }

    return this;
  }

  getPreset(name) {
    return this.presets.get(name) ?? null;
  }

  getData(name) {
    const preset = this.presets.get(name);
    return preset ? { ...preset.data } : null;
  }

  removePreset(name) {
    const preset = this.presets.get(name);
    if (!preset) return false;
    const cat = this.categories.get(preset.category);
    if (cat) {
      const idx = cat.indexOf(name);
      if (idx >= 0) cat.splice(idx, 1);
      if (cat.length === 0) this.categories.delete(preset.category);
    }
    this.presets.delete(name);
    return true;
  }

  listPresets(category = null) {
    if (category) {
      const names = this.categories.get(category) ?? [];
      return names.map((n) => ({ name: n, ...this.presets.get(n) }));
    }
    return Array.from(this.presets.values());
  }

  listCategories() {
    return Array.from(this.categories.keys());
  }

  updatePreset(name, data, metadata = {}) {
    const preset = this.presets.get(name);
    if (!preset) return false;
    preset.data = this.normalizeData(data);
    preset.metadata.updatedAt = Date.now();
    preset.metadata.version = (preset.metadata.version ?? 1) + 1;
    Object.assign(preset.metadata, metadata);
    return true;
  }

  renamePreset(oldName, newName) {
    const preset = this.presets.get(oldName);
    if (!preset) return false;
    this.presets.delete(oldName);
    preset.name = newName;
    this.presets.set(newName, preset);
    const cat = this.categories.get(preset.category);
    if (cat) {
      const idx = cat.indexOf(oldName);
      if (idx >= 0) cat.splice(idx, 1, newName);
    }
    return true;
  }

  normalizeData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  saveCameraPreset(name, camera, category = "camera", metadata = {}) {
    const data = {
      type: "camera",
      position: camera.position ? { ...camera.position } : undefined,
      orientation: camera.orientation ? Array.from(camera.orientation) : undefined,
      hyperplane: camera.hyperplane ? { n: { ...camera.hyperplane.n }, d: camera.hyperplane.d } : undefined,
      projectionMode: camera.projectionMode,
      d4: camera.d4,
      d3: camera.d3,
      scale: camera.scale,
      temporalParam: camera.temporalParam,
    };
    this.addPreset(name, data, category, { presetType: "camera", ...metadata });
    return this;
  }

  loadCameraPreset(name, camera) {
    const data = this.getData(name);
    if (!data || data.type !== "camera") return null;
    if (data.position && camera.position) Object.assign(camera.position, data.position);
    if (data.orientation && camera.orientation) {
      for (let i = 0; i < 16; i++) camera.orientation[i] = data.orientation[i];
    }
    if (data.hyperplane && camera.hyperplane) {
      camera.hyperplane = { n: { ...data.hyperplane.n }, d: data.hyperplane.d };
    }
    if (data.projectionMode) camera.projectionMode = data.projectionMode;
    if (data.d4 !== undefined) camera.d4 = data.d4;
    if (data.d3 !== undefined) camera.d3 = data.d3;
    if (data.scale !== undefined) camera.scale = data.scale;
    if (data.temporalParam !== undefined) camera.temporalParam = data.temporalParam;
    return camera;
  }

  saveRenderPreset(name, renderOptions, category = "render", metadata = {}) {
    const data = {
      type: "render",
      ...this.normalizeData(renderOptions),
    };
    this.addPreset(name, data, category, { presetType: "render", ...metadata });
    return this;
  }

  loadRenderPreset(name, targetOptions = {}) {
    const data = this.getData(name);
    if (!data || data.type !== "render") return null;
    const filtered = { ...data };
    delete filtered.type;
    Object.assign(targetOptions, filtered);
    return targetOptions;
  }

  saveScenePreset(name, sceneConfig, category = "scene", metadata = {}) {
    const data = {
      type: "scene",
      ...this.normalizeData(sceneConfig),
    };
    this.addPreset(name, data, category, { presetType: "scene", ...metadata });
    return this;
  }

  loadScenePreset(name) {
    const data = this.getData(name);
    if (!data || data.type !== "scene") return null;
    const result = { ...data };
    delete result.type;
    return result;
  }

  async saveToStorage() {
    if (!this.storage) return false;
    try {
      const serialized = this.serialize();
      this.storage.setItem(this.storageKey, serialized);
      return true;
    } catch {
      return false;
    }
  }

  async loadFromStorage() {
    if (!this.storage) return false;
    try {
      const serialized = this.storage.getItem(this.storageKey);
      if (!serialized) return false;
      this.deserialize(serialized);
      this._loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  serialize() {
    const obj = {
      version: 2,
      presets: {},
      categories: {},
    };
    for (const [name, preset] of this.presets) {
      obj.presets[name] = preset;
    }
    for (const [cat, names] of this.categories) {
      obj.categories[cat] = names;
    }
    return JSON.stringify(obj, null, 2);
  }

  deserialize(json) {
    const obj = JSON.parse(json);
    if (!obj.presets) return;
    this.presets.clear();
    this.categories.clear();
    for (const [name, preset] of Object.entries(obj.presets)) {
      this.presets.set(name, preset);
    }
    for (const [cat, names] of Object.entries(obj.categories ?? {})) {
      this.categories.set(cat, names);
    }
    this._loaded = true;
  }

  exportPreset(name) {
    const preset = this.presets.get(name);
    if (!preset) return null;
    return JSON.stringify(preset, null, 2);
  }

  importPreset(json) {
    try {
      const preset = JSON.parse(json);
      if (!preset.name || !preset.data) return false;
      this.addPreset(preset.name, preset.data, preset.category, preset.metadata);
      return true;
    } catch {
      return false;
    }
  }

  getStats() {
    return {
      totalPresets: this.presets.size,
      categories: this.categories.size,
      categoryList: this.listCategories(),
      loaded: this._loaded,
    };
  }
}

export function createPresetLibrary(options = {}) {
  return new PresetLibrary(options);
}
