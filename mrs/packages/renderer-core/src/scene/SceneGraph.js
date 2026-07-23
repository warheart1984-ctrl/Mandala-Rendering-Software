import { SceneNode } from "./SceneNode.js";

export class SceneGraph {
  constructor() {
    this.root = new SceneNode("root", "group");
  }

  addNode(node, parentId = "root") {
    const parent = parentId === "root" ? this.root : this.root.findById(parentId);
    if (!parent) throw new Error(`Parent node "${parentId}" not found`);
    parent.addChild(node);
    return this;
  }

  removeNode(id) {
    const node = this.root.findById(id);
    if (node && node.parent) {
      node.parent.removeChild(node);
    }
    return this;
  }

  findById(id) {
    return this.root.findById(id);
  }

  findByTag(tag) {
    return this.root.findByTag(tag);
  }

  traverse(fn) {
    this.root.traverse(fn);
  }

  getTransformMatrix(id) {
    const node = this.root.findById(id);
    if (!node) return null;
    const path = node.getWorldPath();
    let matrix = identity4x4();
    for (const n of path) {
      matrix = mul4x4(matrix, buildLocalMatrix(n.transform));
    }
    return matrix;
  }

  toJSON() {
    return this.root.toJSON();
  }

  static fromJSON(json) {
    const sg = new SceneGraph();
    sg.root = SceneNode.fromJSON(json);
    return sg;
  }
}

function identity4x4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mul4x4(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = a[i * 4 + 0] * b[0 * 4 + j] + a[i * 4 + 1] * b[1 * 4 + j] + a[i * 4 + 2] * b[2 * 4 + j] + a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return r;
}

function buildLocalMatrix(t) {
  const tx = t.translate?.x ?? 0, ty = t.translate?.y ?? 0, tz = t.translate?.z ?? 0, tw = t.translate?.w ?? 0;
  const sx = t.scale?.x ?? 1, sy = t.scale?.y ?? 1, sz = t.scale?.z ?? 1, sw = t.scale?.w ?? 1;
  return [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, sw,
  ];
}
