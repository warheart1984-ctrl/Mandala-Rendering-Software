export class MeshStreamer {
  constructor(options = {}) {
    this.compression = options.compression ?? false;
    this.maxVerts = options.maxVerts ?? Infinity;
  }

  serialize(mesh, transform, options = {}) {
    const verts = mesh.vertices.slice(0, this.maxVerts);
    const numVerts = verts.length;
    const numFaces = mesh.faces.length;

    const positions = new Float32Array(numVerts * 3);
    for (let i = 0; i < numVerts; i++) {
      positions[i * 3] = verts[i].x;
      positions[i * 3 + 1] = verts[i].y;
      positions[i * 3 + 2] = verts[i].z;
    }

    const indices = new Uint32Array(numFaces * 3);
    for (let i = 0; i < numFaces; i++) {
      indices[i * 3] = mesh.faces[i][0];
      indices[i * 3 + 1] = mesh.faces[i][1];
      indices[i * 3 + 2] = mesh.faces[i][2];
    }

    const posBase64 = Buffer.from(positions.buffer).toString("base64");
    const idxBase64 = Buffer.from(indices.buffer).toString("base64");

    const payload = {
      type: "mesh_update",
      version: 1,
      timestamp: Date.now(),
      vertexCount: numVerts,
      faceCount: numFaces,
      positions: posBase64,
      indices: idxBase64,
      transform: transform ?? null,
      metadata: options.metadata ?? {},
      frame: options.frame ?? 0,
    };

    return payload;
  }

  serializeCompact(mesh) {
    const verts = mesh.vertices.slice(0, this.maxVerts);
    const data = {
      v: verts.map((v) => [v.x, v.y, v.z]),
      f: mesh.faces.map((f) => [f[0], f[1], f[2]]),
    };
    return JSON.stringify(data);
  }
}
