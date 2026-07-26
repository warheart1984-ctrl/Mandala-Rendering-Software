export interface WorldMesh {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export class DefaultWorldMesh implements WorldMesh {
  constructor(
    public vertices: Float32Array,
    public normals: Float32Array,
    public indices: Uint32Array,
  ) {}
}
