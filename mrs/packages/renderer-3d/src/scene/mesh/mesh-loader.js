// Simple mesh loader and PrimitiveRef generator
// Intent: load-mesh-primitive-ref-v1
export function createCubeMesh(meshId='cube'){
  const verts = new Float32Array([
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
  ]);
  const inds = new Uint32Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    0,4,7, 0,7,3,
    1,5,6, 1,6,2,
    3,2,6, 3,6,7,
    0,1,5, 0,5,4
  ]);
  return { id: meshId, vertices: verts, indices: inds };
}
export function meshToPrimitiveRefs(mesh, materialId='mat0'){
  const refs = [];
  for(let i=0;i<mesh.indices.length;i+=3){
    const i0=mesh.indices[i], i1=mesh.indices[i+1], i2=mesh.indices[i+2];
    const v0=[mesh.vertices[i0*3],mesh.vertices[i0*3+1],mesh.vertices[i0*3+2]];
    const v1=[mesh.vertices[i1*3],mesh.vertices[i1*3+1],mesh.vertices[i1*3+2]];
    const v2=[mesh.vertices[i2*3],mesh.vertices[i2*3+1],mesh.vertices[i2*3+2]];
    const min=[Math.min(v0[0],v1[0],v2[0]),Math.min(v0[1],v1[1],v2[1]),Math.min(v0[2],v1[2],v2[2])];
    const max=[Math.max(v0[0],v1[0],v2[0]),Math.max(v0[1],v1[1],v2[1]),Math.max(v0[2],v1[2],v2[2])];
    refs.push({
      id:`${mesh.id}_tri_${i/3}`,
      meshId: mesh.id,
      indexOffset: i,
      aabb:{min, max},
      materialId
    });
  }
  return refs;
}
