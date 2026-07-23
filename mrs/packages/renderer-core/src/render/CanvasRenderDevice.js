import { RenderDevice } from "./RenderDevice.js";
import { drawWireframe, drawWireframeSegments, drawVertices } from "./wireframe.js";
import { drawSolid } from "./solid.js";

export class CanvasRenderDevice extends RenderDevice {
  constructor(canvas, options = {}) {
    super("canvas", options);
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.background = options.background ?? "#0e1216";
  }

  clear(color) {
    if (!this.ctx) return;
    const c = color ?? this._hexToRgb(this.background);
    this.ctx.fillStyle = `rgb(${c.r * 255 | 0}, ${c.g * 255 | 0}, ${c.b * 255 | 0})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawMesh(mesh, transform, material) {
    if (!this.ctx || !mesh) return;
    const projected = mesh.vertices.map((v) => {
      const rotated = transform ? transform(v) : v;
      return this._project4Dto2D(rotated);
    });
    const rotated4d = mesh.vertices.map((v) => (transform ? transform(v) : v));
    const color = material?.color ?? { r: 1, g: 1, b: 1 };
    drawSolid(this.ctx, projected, mesh.faces, rotated4d, {
      ambient: material?.ambient ?? 0.35,
      diffuse: material?.diffuse ?? 0.75,
      specular: material?.specular ?? 0.18,
      shininess: material?.shininess ?? 24,
      fillColor: color,
    });
  }

  drawWireframe(mesh, transform, color) {
    if (!this.ctx || !mesh) return;
    const projected = mesh.vertices.map((v) => {
      const rotated = transform ? transform(v) : v;
      return this._project4Dto2D(rotated);
    });
    drawWireframe(this.ctx, projected, mesh.edges ?? mesh.faces?.map((f) => [f[0], f[1]]), {
      strokeStyle: color ?? "#ffffff",
      lineWidth: 1,
    });
  }

  drawVertices(mesh, transform, color) {
    if (!this.ctx || !mesh) return;
    const projected = mesh.vertices.map((v) => {
      const rotated = transform ? transform(v) : v;
      return this._project4Dto2D(rotated);
    });
    drawVertices(this.ctx, projected, { fillStyle: color ?? "#ff4444", radius: 2 });
  }

  _project4Dto2D(v) {
    const d4 = 4, d3 = 4, scale = 80;
    const wProj = d4 / (d4 + v.w);
    const perspective = v.z === 0 ? 1 : d3 / (d3 + v.z);
    return {
      x: v.x * scale * wProj * perspective + this.width / 2,
      y: v.y * scale * wProj * perspective + this.height / 2,
    };
  }

  _hexToRgb(hex) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0.055, g: 0.071, b: 0.086 };
    return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
  }
}
