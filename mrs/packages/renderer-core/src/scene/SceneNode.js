export class SceneNode {
  constructor(id, type = "group", data = {}) {
    this.id = id;
    this.type = type;
    this.data = data;
    this.parent = null;
    this.children = [];
    this.transform = {
      translate: { x: 0, y: 0, z: 0, w: 0 },
      rotate: {},
      scale: { x: 1, y: 1, z: 1, w: 1 },
    };
    this.worldMatrix = null;
    this.visible = true;
    this.tags = [];
  }

  addChild(child) {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    return this;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parent = null;
      this.children.splice(idx, 1);
    }
    return this;
  }

  setTransform(transform) {
    Object.assign(this.transform, transform);
    return this;
  }

  getWorldPath() {
    const path = [];
    let node = this;
    while (node) {
      path.unshift(node);
      node = node.parent;
    }
    return path;
  }

  findById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  findByTag(tag) {
    const results = [];
    if (this.tags.includes(tag)) results.push(this);
    for (const child of this.children) {
      results.push(...child.findByTag(tag));
    }
    return results;
  }

  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const child of this.children) {
      child.traverse(fn, depth + 1);
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      transform: this.transform,
      visible: this.visible,
      tags: this.tags,
      children: this.children.map((c) => c.toJSON()),
    };
  }

  static fromJSON(json, parent = null) {
    const node = new SceneNode(json.id, json.type, json.data);
    node.transform = json.transform;
    node.visible = json.visible ?? true;
    node.tags = json.tags ?? [];
    node.parent = parent;
    for (const childJSON of json.children) {
      node.addChild(SceneNode.fromJSON(childJSON, node));
    }
    return node;
  }
}
