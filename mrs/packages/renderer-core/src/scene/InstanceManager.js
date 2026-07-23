export class InstanceManager {
  constructor() {
    this.instances = new Map();
    this._nextId = 0;
  }

  registerInstance(meshData, instanceData = {}) {
    const id = instanceData.id ?? `instance_${this._nextId++}`;
    this.instances.set(id, {
      id,
      meshData,
      transform: instanceData.transform ?? { translate: { x: 0, y: 0, z: 0, w: 0 }, rotate: {}, scale: { x: 1, y: 1, z: 1, w: 1 } },
      material: instanceData.material ?? null,
      visible: instanceData.visible ?? true,
      metadata: instanceData.metadata ?? {},
    });
    return id;
  }

  updateInstance(id, updates) {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`Instance "${id}" not found`);
    Object.assign(inst, updates);
    return this;
  }

  getInstance(id) {
    return this.instances.get(id);
  }

  removeInstance(id) {
    this.instances.delete(id);
    return this;
  }

  setInstanceTransform(id, transform) {
    const inst = this.instances.get(id);
    if (inst) inst.transform = { ...inst.transform, ...transform };
    return this;
  }

  getVisibleInstances() {
    return Array.from(this.instances.values()).filter((i) => i.visible);
  }

  getInstanceCount() {
    return this.instances.size;
  }

  clear() {
    this.instances.clear();
    return this;
  }

  toJSON() {
    return Array.from(this.instances.values()).map((i) => ({
      id: i.id,
      transform: i.transform,
      material: i.material,
      visible: i.visible,
      metadata: i.metadata,
    }));
  }

  static fromJSON(data, meshResolver) {
    const mgr = new InstanceManager();
    for (const entry of data) {
      const meshData = meshResolver ? meshResolver(entry.id) : null;
      mgr.registerInstance(meshData, entry);
    }
    return mgr;
  }
}
