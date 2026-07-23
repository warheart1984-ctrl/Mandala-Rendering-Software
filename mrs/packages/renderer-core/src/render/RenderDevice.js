export class RenderDevice {
  constructor(type, options = {}) {
    this.type = type;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this._initialized = false;
    this._releaseFns = [];
  }

  get initialized() {
    return this._initialized;
  }

  async init() {
    this._initialized = true;
    return this;
  }

  async beginFrame() {
    throw new Error("beginFrame() must be implemented by subclass");
  }

  async endFrame() {
    throw new Error("endFrame() must be implemented by subclass");
  }

  clear(color = { r: 0, g: 0, b: 0, a: 1 }) {
    throw new Error("clear() must be implemented by subclass");
  }

  drawMesh(mesh, transform, material) {
    throw new Error("drawMesh() must be implemented by subclass");
  }

  drawWireframe(mesh, transform, color) {
    throw new Error("drawWireframe() must be implemented by subclass");
  }

  drawVertices(mesh, transform, color) {
    throw new Error("drawVertices() must be implemented by subclass");
  }

  present() {
    throw new Error("present() must be implemented by subclass");
  }

  readPixels() {
    throw new Error("readPixels() must be implemented by subclass");
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  onRelease(fn) {
    this._releaseFns.push(fn);
    return this;
  }

  release() {
    for (const fn of this._releaseFns) fn();
    this._releaseFns = [];
    this._initialized = false;
  }
}
