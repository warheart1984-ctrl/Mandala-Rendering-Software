import { Mesh } from "../scene/mesh/mesh-types.ts";
import { meshToPrimitives } from "../scene/mesh/mesh-loader.ts";
import { buildBVH_SAH } from "../scene/bvh/bvh-builder-sah.ts";
import { toGPULayout } from "../scene/bvh/bvh-layout.ts";
import { intersectBVH } from "../scene/bvh/bvh-traversal-simd.ts";

export interface RenderPipelineResult {
  bvh;
  gpuLayout;
  provenance;
}

export function buildRenderPipeline(mesh:Mesh, config:any, device:any=null){
  const primitives=meshToPrimitives(mesh);
  const {tree,evidence}=buildBVH_SAH(primitives,{...config,intentId:"pipeline-v1"});
  const gpuLayout=toGPULayout(tree,primitives);
  return {bvh:tree,gpuLayout,provenance:evidence.provenance};
}
