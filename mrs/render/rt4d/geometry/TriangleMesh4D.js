// mrs/render/rt4d/geometry/TriangleMesh4D.js

export class TriangleMesh4D {
  constructor({ id, vertices4D, indices, materialId }) {
    this.id = id;
    this.vertices4D = vertices4D || [];
    this.indices = indices || [];
    this.materialId = materialId || null;
  }

  getId() {
    return this.id;
  }

  getVertices4D() {
    return this.vertices4D;
  }

  getIndices() {
    return this.indices;
  }

  getMaterialId() {
    return this.materialId;
  }
}