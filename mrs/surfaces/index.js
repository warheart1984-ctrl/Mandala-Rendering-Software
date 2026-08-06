// mrs/surfaces/index.js

export class SurfacesRegistry {
  constructor() {
    this.surfaces = new Map();
  }

  register(id, surfaceDef) {
    this.surfaces.set(id, surfaceDef);
  }

  get(id) {
    return this.surfaces.get(id);
  }
}