import { BVHTree, PrimitiveRef, BVHNode, AABB } from "./bvh-spec.ts";
import { BuildEvidence, recordBuildStart, recordSplitDecision, recordBuildEnd } from "./bvh-evidence.ts";

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
function surfaceArea(aabb:AABB){ const e=[aabb.max[0]-aabb.min[0], aabb.max[1]-aabb.min[1], aabb.max[2]-aabb.min[2]]; return 2*(e[0]*e[1]+e[1]*e[2]+e[2]*e[0]); }
function chooseSplit(prims:PrimitiveRef[], bounds:AABB, binCount:number){
  const ext=[bounds.max[0]-bounds.min[0], bounds.max[1]-bounds.min[1], bounds.max[2]-bounds.min[2]];
  let bestAxis=0 as 0|1|2; let bestPos=bounds.min[0]; let bestCost=Infinity;
  for(let axis=0;axis<3;axis++){
    if(ext[axis]<=0) continue;
    const min=bounds.min[axis], max=bounds.max[axis], range=max-min;
    const binSize=range/binCount;
    const bins=Array.from({length:binCount},()=>({count:0,bounds:{min:[Infinity,Infinity,Infinity] as [number,number,number],max:[-Infinity,-Infinity,-Infinity] as [number,number,number]}}));
    for(const p of prims){
      const c=(p.aabb.min[axis]+p.aabb.max[axis])*0.5;
      let b=Math.floor((c-min)/binSize); if(b<0) b=0; if(b>=binCount) b=binCount-1;
      const bin=bins[b]; bin.count++; for(let i=0;i<3;i++){ bin.bounds.min[i]=Math.min(bin.bounds.min[i],p.aabb.min[i]); bin.bounds.max[i]=Math.max(bin.bounds.max[i],p.aabb.max[i]); }
    }
    let leftCount=0, leftBounds:{min:[number,number,number];max:[number,number,number]}={min:[Infinity,Infinity,Infinity] as any,max:[-Infinity,-Infinity,-Infinity] as any};
    for(let i=0;i<binCount-1;i++){
      const bin=bins[i]; leftCount+=bin.count;
      for(let k=0;k<3;k++){ leftBounds.min[k]=Math.min(leftBounds.min[k],bin.bounds.min[k]); leftBounds.max[k]=Math.max(leftBounds.max[k],bin.bounds.max[k]); }
      const rightCount=prims.length-leftCount;
      if(leftCount===0||rightCount===0) continue;
      const leftArea=surfaceArea({min:leftBounds.min,max:leftBounds.max});
      // compute right bounds quickly by accumulating from i+1
      const rightBounds:{min:[number,number,number];max:[number,number,number]}={min:[Infinity,Infinity,Infinity] as any,max:[-Infinity,-Infinity,-Infinity] as any};
      for(let j=i+1;j<binCount;j++){ const b2=bins[j]; for(let k=0;k<3;k++){ rightBounds.min[k]=Math.min(rightBounds.min[k],b2.bounds.min[k]); rightBounds.max[k]=Math.max(rightBounds.max[k],b2.bounds.max[k]); } }
      const rightArea=surfaceArea({min:rightBounds.min,max:rightBounds.max});
      const cost=leftCount*leftArea+rightCount*rightArea;
      if(cost<bestCost){
        bestCost=cost; bestAxis=axis as 0|1|2; bestPos=min+(i+1)*binSize;
      }
    }
  }
  return {axis:bestAxis,position:bestPos};
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
    const splitInfo=chooseSplit(prims,bounds,config.binCount);
    recordSplitDecision(evidence,{nodeIndex:idx,axis:splitInfo.axis,position:splitInfo.position,cost:0,chosen:true});
    const left=[], right=[];
    for(const p of prims){ const c=(p.aabb.min[splitInfo.axis]+p.aabb.max[splitInfo.axis])*0.5; (c<=splitInfo.position?left:right).push(p); }
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
