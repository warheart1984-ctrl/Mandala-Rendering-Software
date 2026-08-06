// mrs/render/rt4d/scene/Scene4D.js

export class Scene4D {
  constructor() {
    this.metric = { type: 'euclidean' };
    this.camera = null;
    this.meshes = [];
    this.surfacesRegistry = null;
  }

  setMetric(metricDef) {
    this.metric = metricDef;
  }

  getMetric() {
    return this.metric;
  }

  setCamera(cameraDef) {
    this.camera = cameraDef;
  }

  addMesh(mesh) {
    this.meshes.push(mesh);
  }

  setSurfacesRegistry(registry) {
    this.surfacesRegistry = registry;
  }

  getMeshes() {
    return this.meshes;
  }

  getCamera() {
    return this.camera;
  }

  getSurfacesRegistry() {
    return this.surfacesRegistry;
  }
}