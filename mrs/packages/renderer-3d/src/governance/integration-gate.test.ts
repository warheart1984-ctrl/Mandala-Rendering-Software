import { meshToPrimitives } from "../scene/mesh/mesh-loader";
import { buildBVH_SAH } from "../scene/bvh/bvh-builder-sah";
import { toGPULayout } from "../scene/bvh/bvh-layout";
import { intersectBVH } from "../scene/bvh/bvh-traversal-simd";

type InvariantCheck = {name:string, pass:boolean, evidence:any};

export function runIntegrationGate(mesh:any){
  const checks:InvariantCheck[]=[];
  // mesh identity invariant
  const meshIdStable = typeof mesh.id === 'string' && mesh.id.length>0;
  checks.push({name:'mesh identity invariant', pass:meshIdStable, evidence:{meshId:mesh.id}});
  // primitive identity invariant
  const prims = meshToPrimitives(mesh);
  const primIdsUnique = new Set(prims.map(p=>p.id)).size === prims.length;
  checks.push({name:'primitive identity invariant', pass:primIdsUnique, evidence:{count:prims.length}});
  // BVH determinism invariant
  const config={maxLeafSize:4,maxDepth:16,binCount:8,heuristicVersion:'sah-v1',intentId:'gate-test'};
  const {tree:tree1}=buildBVH_SAH(prims,config);
  const {tree:tree2}=buildBVH_SAH(prims,config);
  const deterministic = JSON.stringify(tree1.nodes)===JSON.stringify(tree2.nodes);
  checks.push({name:'BVH determinism invariant', pass:deterministic, evidence:{configHash:tree1.configHash}});
  // GPU-layout invariant
  const layout = toGPULayout(tree1,prims);
  const layoutOk = layout.nodeBuffer.byteLength >0 && layout.primitiveBuffer.byteLength>0;
  checks.push({name:'GPU-layout invariant', pass:layoutOk, evidence:{nodeBytes:layout.nodeBuffer.byteLength}});
  // traversal invariant
  const ray={origin:[0,0,0] as [number,number,number],direction:[0,0,1] as [number,number,number]};
  const {result}=intersectBVH(tree1,prims,ray,new Map([[mesh.id,{vertices:mesh.vertices,indices:mesh.indices}]]));
  const traversalOk = typeof result.hit === 'boolean';
  checks.push({name:'traversal invariant', pass:traversalOk, evidence:{hit:result.hit}});
  // provenance continuity invariant
  const provOk = !!tree1.provenance.intentId && !!tree1.provenance.createdAt;
  checks.push({name:'provenance continuity invariant', pass:provOk, evidence:{provenance:tree1.provenance}});
  return checks;
}

// Negative cases
export function runNegativeCases(){
  const results:any[]=[];
  // malformed mesh
  try{ meshToPrimitives({id:'',vertices:null,indices:null}); results.push({case:'malformed mesh',rejected:false}); }catch{ results.push({case:'malformed mesh',rejected:true});}
  // missing provenance
  const badTree:any={nodes:[],rootIndex:0,provenance:{},configHash:''};
  const provMissing = !badTree.provenance.intentId;
  results.push({case:'missing provenance',rejected:provMissing});
  return results;
}
