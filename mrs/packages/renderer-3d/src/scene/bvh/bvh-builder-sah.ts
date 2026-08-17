import { BVHTree, PrimitiveRef, BVHNode, AABB } from "./bvh-spec";
import { BuildEvidence, recordBuildStart, recordSplitDecision, recordBuildEnd } from "./bvh-evidence";

export interface BVHBuildConfig {
  maxLeafSize: number;
  maxDepth: number;
  binCount: number;
  heuristicVersion: string;
  intentId: string;
}

export interface BVHBuildResult {
  tree: BVHTree;
  evidence: BuildEvidence;
}

function makeProvenance(intentId:string){ return {intentId, createdAt:new Date().toISOString(), version:"v3"}; }
function computeBounds(prims:PrimitiveRef[]):AABB{
  if(prims.length===0) return {min:[0,0,0],max:[0,0,0]};
  const min=[...prims[0].aabb.min] as [number,number,number];
  const max=[...prims[0].aabb.max] as [number,number,number];
  for(const p of prims){
    for(let i=0;i<3;i++){ min[i]=Math.min(min[i],p.aabb.min[i]); max[i]=Math.max(max[i],p.aabb.max[i]); }
  }
  return {min,max};
}
function chooseSplit(prims:PrimitiveRef[], bounds:AABB, binCount:number){
  const ext=[bounds.max[0]-bounds.min[0], bounds.max[1]-bounds.min[1], bounds.max[2]-bounds.min[2]];
  let axis=0 as 0|1|2;
  if(ext[1]>ext[axis]) axis=1;
  if(ext[2]>ext[axis]) axis=2;
  const min=bounds.min[axis], max=bounds.max[axis];
  const pos=min+(max-min)*0.5;
  return {axis,position:pos};
}
export function buildBVH_SAH(primitives:PrimitiveRef[], config:BVHBuildConfig):BVHBuildResult{
  const provenance=makeProvenance(config.intentId);
  const evidence=recordBuildStart(primitives,config,provenance);
  const nodes:BVHNode[]=[];
  function buildRecursive(prims:PrimitiveRef[], level:number):number{
    const bounds=computeBounds(prims);
    const idx=nodes.length;
    if(prims.length<=config.maxLeafSize || level>=config.maxDepth){
      nodes.push({bounds,children:[],primitiveRange:{start:0,count:prims.length},isLeaf:true,level});
      return idx;
    }
    const {axis,position}=chooseSplit(prims,bounds,config.binCount);
    recordSplitDecision(evidence,{nodeIndex:idx,axis,position,cost:0,chosen:true});
    const left=[], right=[];
    for(const p of prims){ const c=(p.aabb.min[axis]+p.aabb.max[axis])*0.5; (c<=position?left:right).push(p); }
    if(left.length===0||right.length===0){
      nodes.push({bounds,children:[],primitiveRange:{start:0,count:prims.length},isLeaf:true,level});
      return idx;
    }
    const leftIdx=buildRecursive(left,level+1);
    const rightIdx=buildRecursive(right,level+1);
    nodes[idx]={bounds,children:[leftIdx,rightIdx],isLeaf:false,level};
    return idx;
  }
  const rootIdx=buildRecursive(primitives,0);
  const tree:BVHTree={nodes,rootIndex:rootIdx,provenance,configHash:JSON.stringify(config)};
  recordBuildEnd(evidence,tree);
  return {tree,evidence};
}
