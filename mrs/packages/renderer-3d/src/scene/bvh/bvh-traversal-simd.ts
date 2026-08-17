import { BVHTree, PrimitiveRef } from "./bvh-spec";
import { TraversalEvidence, recordTraversalStart, recordNodeVisit, recordTraversalEnd } from "./bvh-evidence";

export interface Ray { origin:[number,number,number]; direction:[number,number,number]; }
export interface HitRecord { hit:true; t:number; primitiveId:string; barycentric:[number,number,number]; nodeIndex:number; }
export interface MissRecord { hit:false; }
export type RayResult = HitRecord | MissRecord;
export interface RaysPacket { rays:Ray[]; }
export interface PacketResult { results:RayResult[]; }

function rayAABB(ray:Ray, bounds:{min:[number,number,number];max:[number,number,number]}):boolean{
  let tmin=-Infinity,tmax=Infinity;
  for(let i=0;i<3;i++){
    const invD=1.0/(ray.direction[i]||1e-9);
    let t0=(bounds.min[i]-ray.origin[i])*invD;
    let t1=(bounds.max[i]-ray.origin[i])*invD;
    if(invD<0){const tmp=t0;t0=t1;t1=tmp;}
    tmin=Math.max(tmin,t0); tmax=Math.min(tmax,t1);
    if(tmax<=tmin) return false;
  }
  return true;
}

export function intersectBVH(tree:BVHTree, primitives:PrimitiveRef[], ray:Ray):{result:RayResult;evidence:TraversalEvidence}{
  const evidence=recordTraversalStart(ray,tree);
  const result=traverseScalar(tree,primitives,ray,evidence);
  recordTraversalEnd(evidence,result);
  return {result,evidence};
}
export function intersectBVH_Packet(tree:BVHTree, primitives:PrimitiveRef[], packet:RaysPacket):{results:PacketResult;evidence:TraversalEvidence}{
  const evidence=recordTraversalStart(packet,tree);
  const results=packet.rays.map(r=>traverseScalar(tree,primitives,r,evidence));
  recordTraversalEnd(evidence,{results});
  return {results:{results},evidence};
}
function traverseScalar(tree:BVHTree, primitives:PrimitiveRef[], ray:Ray, evidence:TraversalEvidence):RayResult{
  const stack:[number][]=[[tree.rootIndex]];
  let bestT=Infinity, bestHit:HitRecord|null=null;
  while(stack.length>0){
    const nodeIndex=stack.pop()!;
    const node=tree.nodes[nodeIndex];
    recordNodeVisit(evidence,{nodeIndex});
    if(!rayAABB(ray,node.bounds)) continue;
    if(node.isLeaf){
      const range=node.primitiveRange||{start:0,count:0};
      for(let i=range.start;i<range.start+range.count;i++){
        const prim=primitives[i];
        // placeholder hit
        if(prim){
          bestHit={hit:true,t:1,primitiveId:prim.id,barycentric:[1,0,0],nodeIndex};
          bestT=1;
        }
      }
    }else{
      for(let i=node.children.length-1;i>=0;i--) stack.push(node.children[i]);
    }
  }
  return bestHit??{hit:false};
}
