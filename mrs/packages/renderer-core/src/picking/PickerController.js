import { Ray4D } from "./Ray4D.js";
import { MeshPicker4D } from "./MeshPicker4D.js";

export class PickerController {
  constructor(camera4D, options = {}) {
    this.camera = camera4D;
    this.picker = null;
    this.onPick = options.onPick ?? null;
    this.highlightColor = options.highlightColor ?? "#ff4444";
    this._lastHit = null;
  }

  setMesh(mesh, transformFn) {
    this.picker = new MeshPicker4D(mesh, { transform: transformFn });
  }

  pick(mouseX, mouseY, width, height) {
    if (!this.picker) return null;
    const ray = Ray4D.from2DMouse(mouseX, mouseY, width, height, this.camera);
    const hit = this.picker.pick(ray);
    this._lastHit = hit;
    if (hit && this.onPick) this.onPick(hit);
    return hit;
  }

  getLastHit() {
    return this._lastHit;
  }

  getPickedVertexCoords() {
    if (!this._lastHit || !this._lastHit.face || !this.picker) return null;
    const face = this._lastHit.face;
    const verts = this.picker.mesh.vertices;
    return face.map(i => ({ index: i, coords: verts[i] }));
  }

  getPickedFaceCenter() {
    if (!this._lastHit || !this._lastHit.face || !this.picker) return null;
    const face = this._lastHit.face;
    const verts = this.picker.mesh.vertices;
    const sum = { x: 0, y: 0, z: 0, w: 0 };
    for (const i of face) {
      sum.x += verts[i].x; sum.y += verts[i].y;
      sum.z += verts[i].z; sum.w += verts[i].w;
    }
    const n = face.length;
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n, w: sum.w / n };
  }

  clearHit() {
    this._lastHit = null;
  }
}
