import { identityMat4, multiplyMat4, scaleMat4, translationMat4 } from "./mat4.js";
import { identityQuat, quatToMat4 } from "./quat.js";
import { vec3 } from "./vec3.js";

export function composeTransform3D(position, rotation, scale) {
  return multiplyMat4(
    translationMat4(position),
    multiplyMat4(quatToMat4(rotation), scaleMat4(scale)),
  );
}

export class Transform3D {
  constructor(options = {}) {
    this.position = options.position ?? vec3();
    this.rotation = options.rotation ?? identityQuat();
    this.scale = options.scale ?? vec3(1, 1, 1);
  }

  toMatrix() {
    return composeTransform3D(this.position, this.rotation, this.scale);
  }
}

export class Node3D {
  constructor(options = {}) {
    this.transform = options.transform ?? new Transform3D(options);
    this.parent = null;
    this.children = [];
    this.userData = options.userData ?? {};
  }

  add(child) {
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
    }
    return child;
  }

  getLocalMatrix() {
    return this.transform?.toMatrix?.() ?? identityMat4();
  }

  getWorldMatrix() {
    const local = this.getLocalMatrix();
    return this.parent ? multiplyMat4(this.parent.getWorldMatrix(), local) : local;
  }
}
