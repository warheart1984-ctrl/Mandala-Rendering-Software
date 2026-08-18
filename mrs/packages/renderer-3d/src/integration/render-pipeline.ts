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
  
  // Constitutional material dispatch for Disney PBR
  const materialType = config.material?.typeAndParams?.x ?? 1;
  const materialShader = config.material?.intent_id ?? 'material-disney-v1';
  
  const materialDispatch = {
    type: materialType,
    shader: materialShader,
    provenance: evidence.provenance,
    constitutional: {
      gpu_assist_only: true,
      replayable: true,
      material_dispatch: 'mat.typeAndParams.x'
    }
  };
  
  return {bvh:tree,gpuLayout,provenance:evidence.provenance,materialDispatch};
}
