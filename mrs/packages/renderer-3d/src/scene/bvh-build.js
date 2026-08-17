// BVH build/traversal stub with constitutional provenance
export const provenance = {intentId: "bvh-build-v1", worldId: null, timelineId: null, timeSeconds: 0};

export class BVHNode {
  constructor(bounds=null, left=null, right=null, prims=[]){
    this.bounds=bounds; this.left=left; this.right=right; this.prims=prims;
  }
}
export function buildBVH(meshes){ return new BVHNode(); }
export function intersectBVH(node, ray){ return {hit:false}; }
