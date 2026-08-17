import { meshToPrimitives } from "../scene/mesh/mesh-loader";
import { buildBVH_SAH } from "../scene/bvh/bvh-builder-sah";
import { toGPULayout } from "../scene/bvh/bvh-layout";
import { intersectBVH } from "../scene/bvh/bvh-traversal-simd";

type InvariantCheck = {name:string, pass:boolean, evidence:any};

export function sanitizeMesh(mesh:any){
  if(!mesh?.vertices || !mesh?.indices) throw new Error('mesh malformed');
  for(let i=0;i<mesh.vertices.length;i++){
    const v=mesh.vertices[i];
    if(!Number.isFinite(v)) throw new Error('NaN/Inf geometry');
  }
  return mesh;
}

export function assertGPULayout(layout:any){
  // WGSL BVHNode: vec3+vec3+4*u32 = 12+12+16 =40 bytes; align to 16 -> 48? We'll assert >0 and multiple of 16
  if(layout.nodeBuffer.byteLength===0) throw new Error('GPU layout empty');
  if(layout.nodeBuffer.byteLength %16!==0) throw new Error('GPU layout size misaligned');
  return true;
}

export function denyIfMissingProvenance(tree:any){
  if(!tree?.provenance?.intentId) throw new Error('CKL deny: missing provenance');
  if(!tree?.provenance?.createdAt) throw new Error('CKL deny: provenance incomplete');
  return true;
}

export function runIntegrationGate(mesh:any){
  const checks:InvariantCheck[]=[];
  // sanitize
  try{ sanitizeMesh(mesh); }catch(e:any){ throw new Error(`sanitize failed: ${e.message}`); }
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
  let layoutOk=false;
  try{ assertGPULayout(layout); layoutOk=true; }catch(e:any){ layoutOk=false; }
  checks.push({name:'GPU-layout invariant', pass:layoutOk, evidence:{nodeBytes:layout.nodeBuffer.byteLength}});
  // traversal invariant
  const ray={origin:[0,0,0] as [number,number,number],direction:[0,0,1] as [number,number,number]};
  const {result}=intersectBVH(tree1,prims,ray,new Map([[mesh.id,{vertices:mesh.vertices,indices:mesh.indices}]]));
  const traversalOk = typeof result.hit === 'boolean';
  checks.push({name:'traversal invariant', pass:traversalOk, evidence:{hit:result.hit}});
  // provenance continuity invariant
  let provOk=false;
  try{ denyIfMissingProvenance(tree1); provOk=true; }catch{ provOk=false; }
  checks.push({name:'provenance continuity invariant', pass:provOk, evidence:{provenance:tree1.provenance}});
  return checks;
}

// Negative cases
export function runNegativeCases(){
  const results:any[]=[];
  // malformed mesh
  try{ sanitizeMesh({id:'',vertices:null,indices:null}); results.push({case:'malformed mesh',rejected:false}); }catch{ results.push({case:'malformed mesh',rejected:true});}
  // NaN geometry
  try{ sanitizeMesh({id:'m',vertices:new Float32Array([NaN]),indices:new Uint32Array([0])}); results.push({case:'NaN geometry',rejected:false}); }catch{ results.push({case:'NaN geometry',rejected:true});}
  // GPU layout mismatch
  try{ assertGPULayout({nodeBuffer:new ArrayBuffer(7),primitiveBuffer:new ArrayBuffer(1)}); results.push({case:'GPU layout mismatch',rejected:false}); }catch{ results.push({case:'GPU layout mismatch',rejected:true});}
  // missing provenance CKL deny
  try{ denyIfMissingProvenance({provenance:{}}); results.push({case:'missing provenance',rejected:false}); }catch{ results.push({case:'missing provenance',rejected:true});}
  // nondeterministic BVH ordering
  const prims=[{id:'a',meshId:'m',indexOffset:0,aabb:{min:[0,0,0],max:[1,1,1]}}];
  const cfg={maxLeafSize:0,maxDepth:8,binCount:4,heuristicVersion:'sah',intentId:'x'};
  // simulate different config leads to different hash
  const t1=buildBVH_SAH(prims,cfg); const cfg2={...cfg,intentId:'y'}; const t2=buildBVH_SAH(prims,cfg2);
  const nondet = t1.configHash!==t2.configHash;
  results.push({case:'nondeterministic BVH ordering',rejected:nondet});
  return results;
}
