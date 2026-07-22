import { HyperBox } from "./HyperBox.js";

export class BVH4D {
  constructor(primitives, options = {}) {
    this.primitives = primitives;
    this.nodes = [];
    this.leafThreshold = options.leafThreshold ?? 4;
    if (primitives.length > 0) this._build(0, primitives.length);
  }

  _build(start, end) {
    const nodeIdx = this.nodes.length;
    this.nodes.push({ box: new HyperBox(), left: -1, right: -1, start: -1, end: -1 });

    const box = new HyperBox();
    for (let i = start; i < end; i++) {
      const prim = this.primitives[i];
      if (prim.getBounds) {
        const b = prim.getBounds();
        box.expandBox(b);
      }
    }
    this.nodes[nodeIdx].box = box;

    const count = end - start;
    if (count <= this.leafThreshold) {
      this.nodes[nodeIdx].start = start;
      this.nodes[nodeIdx].end = end;
      return nodeIdx;
    }

    const bestSplit = this._findBestSplit(start, end);
    if (!bestSplit) {
      this.nodes[nodeIdx].start = start;
      this.nodes[nodeIdx].end = end;
      return nodeIdx;
    }

    const mid = this._partition(start, end, bestSplit);
    const leftIdx = this._build(start, mid);
    const rightIdx = this._build(mid, end);
    this.nodes[nodeIdx].left = leftIdx;
    this.nodes[nodeIdx].right = rightIdx;
    return nodeIdx;
  }

  _findBestSplit(start, end) {
    const count = end - start;
    if (count <= this.leafThreshold) return null;

    let bestCost = Infinity;
    let bestAxis = 0;

    for (let axis = 0; axis < 4; axis++) {
      const sorted = this.primitives.slice(start, end).sort((a, b) => {
        const ca = a.getCenter ? a.getCenter()[axis] : 0;
        const cb = b.getCenter ? b.getCenter()[axis] : 0;
        return ca - cb;
      });

      const leftBoxes = [];
      const rightBoxes = [];

      let leftBox = new HyperBox();
      for (let i = 0; i < count; i++) {
        const prim = sorted[i];
        if (prim.getBounds) leftBox.expandBox(prim.getBounds());
        leftBoxes[i] = leftBox;
      }
      let rightBox = new HyperBox();
      for (let i = count - 1; i >= 0; i--) {
        const prim = sorted[i];
        if (prim.getBounds) rightBox.expandBox(prim.getBounds());
        rightBoxes[i] = rightBox;
      }

      for (let i = 1; i < count; i++) {
        const saLeft = leftBoxes[i - 1].surfaceArea();
        const saRight = rightBoxes[i].surfaceArea();
        const cost = 0.5 + (saLeft * i + saRight * (count - i)) / this.nodes[0].box.surfaceArea();
        if (cost < bestCost) {
          bestCost = cost;
          bestAxis = axis;
        }
      }
    }

    return bestAxis;
  }

  _partition(start, end, axis) {
    const mid = Math.floor((start + end) / 2);
    this.primitives.sort((a, b) => {
      const ca = a.getCenter ? a.getCenter()[axis] : 0;
      const cb = b.getCenter ? b.getCenter()[axis] : 0;
      return ca - cb;
    });
    return mid;
  }

  traverse(ray, hitFn) {
    return this._traverseNode(0, ray, hitFn);
  }

  _traverseNode(nodeIdx, ray, hitFn) {
    const node = this.nodes[nodeIdx];
    if (!node.box.intersect(ray)) return null;

    if (node.left < 0 && node.right < 0) {
      let closestHit = null;
      for (let i = node.start; i < node.end; i++) {
        const prim = this.primitives[i];
        if (prim.intersect) {
          const hit = prim.intersect(ray);
          if (hit && (!closestHit || hit.t < closestHit.t)) closestHit = hit;
        }
      }
      return closestHit;
    }

    const leftHit = node.left >= 0 ? this._traverseNode(node.left, ray, hitFn) : null;
    const rightHit = node.right >= 0 ? this._traverseNode(node.right, ray, hitFn) : null;

    if (!leftHit) return rightHit;
    if (!rightHit) return leftHit;
    return leftHit.t < rightHit.t ? leftHit : rightHit;
  }
}
