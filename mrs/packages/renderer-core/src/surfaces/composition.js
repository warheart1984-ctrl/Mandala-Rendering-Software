import { getSurface, sampleSurface } from "./index.js";
import { add, sub, scale } from "../math/vec4.js";

export const OP_UNION = "union";
export const OP_INTERSECT = "intersect";
export const OP_SUBTRACT = "subtract";
export const OP_BLEND = "blend";

export class SurfaceComposition {
  constructor(options = {}) {
    this.operations = options.operations ?? [];
    this.blendRadius = options.blendRadius ?? 0.2;
    this.mergeWeld = options.mergeWeld ?? true;
    this.weldThreshold = options.weldThreshold ?? 0.001;
  }

  addOperation(op, surfaceId, params = {}) {
    this.operations.push({ op, surfaceId, params, enabled: true });
    return this;
  }

  removeOperation(index) {
    if (index >= 0 && index < this.operations.length) {
      this.operations.splice(index, 1);
    }
    return this;
  }

  setEnabled(index, enabled) {
    if (this.operations[index]) this.operations[index].enabled = enabled;
    return this;
  }

  clear() {
    this.operations = [];
    return this;
  }

  combineSDF(values) {
    if (values.length === 0) return 1e9;

    let result = values[0].d;
    const history = [{ id: values[0].id, d: result }];

    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      const prev = result;
      const op = this.operations[i]?.op ?? OP_UNION;

      switch (op) {
        case OP_UNION:
          result = Math.min(result, v.d);
          break;
        case OP_INTERSECT:
          result = Math.max(result, v.d);
          break;
        case OP_SUBTRACT:
          result = Math.max(result, -v.d);
          break;
        case OP_BLEND: {
          const t = Math.max(0, Math.min(1, 0.5 + (v.d - result) / (this.blendRadius * 2)));
          result = (1 - t) * result + t * v.d - this.blendRadius * t * (1 - t);
          break;
        }
      }
      history.push({ id: v.id, d: result, prev });
    }

    return result;
  }

  sampleSurface(surfaceId, resolution) {
    const surface = getSurface(surfaceId);
    return sampleSurface(surface, resolution);
  }

  evaluateDensity(point, surfaces, resolution) {
    const values = [];
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const opIdx = Math.min(i, this.operations.length - 1);
      if (this.operations[opIdx] && !this.operations[opIdx].enabled) continue;
      const surface = getSurface(s.id || s.surfaceId);
      const d = this.sampleDensity(surface, point, s.params || {});
      values.push({ id: surface.id, d });
    }
    return this.combineSDF(values);
  }

  sampleDensity(surface, point, params = {}) {
    if (typeof surface.density === "function") {
      return surface.density(point, params);
    }
    const center = params.center ?? { x: 0, y: 0, z: 0, w: 0 };
    const offset = sub(point, center);
    const r = Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2 + offset.w ** 2);
    const radius = params.radius ?? 1.0;
    return r - radius;
  }

  sampleAll(resolution) {
    const meshes = [];
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      if (!op.enabled) continue;
      const mesh = this.sampleSurface(op.surfaceId, resolution);
      meshes.push({ op: op.op, mesh, params: op.params });
    }
    return this.mergeMeshes(meshes);
  }

  mergeMeshes(composedMeshes) {
    if (composedMeshes.length === 0) {
      return { vertices: [], faces: [], edges: [] };
    }
    if (composedMeshes.length === 1) {
      return composedMeshes[0].mesh;
    }

    const vertexMap = new Map();
    const vertices = [];
    const faces = [];
    const edgeSet = new Set();

    for (const { op, mesh } of composedMeshes) {
      const offset = vertices.length;
      for (const v of mesh.vertices) {
        const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)},${v.w.toFixed(6)}`;
        if (this.mergeWeld && vertexMap.has(key)) {
          const idx = vertexMap.get(key);
          if (idx !== vertices.length - 1) continue;
        }
        vertexMap.set(key, vertices.length);
        vertices.push(v);
      }

      if (op !== OP_SUBTRACT) {
        for (const face of mesh.faces) {
          faces.push(face.map((i) => i + offset));
        }
        for (const edge of mesh.edges) {
          const key = `${edge[0] + offset},${edge[1] + offset}`;
          const sortedKey = edge[0] < edge[1] ? key : `${edge[1] + offset},${edge[0] + offset}`;
          if (!edgeSet.has(sortedKey)) {
            edgeSet.add(sortedKey);
          }
        }
      }
    }

    return {
      vertices,
      faces,
      edges: [...edgeSet].map((s) => {
        const [i, j] = s.split(",").map(Number);
        return [i, j];
      }),
    };
  }

  toJSON() {
    return {
      type: "SurfaceComposition",
      operations: this.operations.map((op) => ({
        op: op.op,
        surfaceId: op.surfaceId,
        params: op.params,
        enabled: op.enabled,
      })),
      blendRadius: this.blendRadius,
      mergeWeld: this.mergeWeld,
    };
  }

  static fromJSON(json) {
    const comp = new SurfaceComposition({
      blendRadius: json.blendRadius,
      mergeWeld: json.mergeWeld,
    });
    for (const op of json.operations) {
      comp.operations.push({ ...op });
    }
    return comp;
  }
}

export function createComposition(options = {}) {
  return new SurfaceComposition(options);
}
