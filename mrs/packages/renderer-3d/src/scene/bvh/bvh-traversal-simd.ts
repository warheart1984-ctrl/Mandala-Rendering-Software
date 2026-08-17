import { BVHTree, PrimitiveRef } from "./bvh-spec.ts";
import { TraversalEvidence, recordTraversalStart, recordNodeVisit, recordTraversalEnd } from "./bvh-evidence.ts";
import { Mesh } from "../mesh/mesh-types.ts";

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

export function intersectBVH(tree:BVHTree, primitives:PrimitiveRef[], ray:Ray, meshById:Map<string,Mesh>={new Map()}):{result:RayResult;evidence:TraversalEvidence}{
  const evidence=recordTraversalStart(ray,tree);
  const result=traverseScalar(tree,primitives,ray,evidence,meshById);
  recordTraversalEnd(evidence,result);
  return {result,evidence};
}
export function intersectBVH_Packet(tree:BVHTree, primitives:PrimitiveRef[], packet:RaysPacket, meshById:Map<string,Mesh>={new Map()}):{results:PacketResult;evidence:TraversalEvidence}{
  const evidence=recordTraversalStart(packet,tree);
  const results=packet.rays.map(r=>traverseScalar(tree,primitives,r,evidence,meshById));
  recordTraversalEnd(evidence,{results});
  return {results:{results},evidence};
}
function traverseScalar(tree:BVHTree, primitives:PrimitiveRef[], ray:Ray, evidence:TraversalEvidence, meshById:Map<string,Mesh>):RayResult{
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
        const mesh=meshById.get(prim.meshId);
        if(!mesh) continue;
        const hit=rayTriangle(ray,prim,mesh);
        if(hit && hit.t<bestT){
          bestT=hit.t;
          bestHit={hit:true,t:hit.t,primitiveId:prim.id,barycentric:hit.barycentric,nodeIndex};
        }
      }
    }else{
      for(let i=node.children.length-1;i>=0;i--) stack.push(node.children[i]);
    }
  }
  return bestHit??{hit:false};
}

function getVertex(buf:Float32Array, idx:number):[number,number,number]{
  const b=idx*3; return [buf[b],buf[b+1],buf[b+2]];
}
function sub(a:[number,number,number],b:[number,number,number]):[number,number,number]{return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot(a:[number,number,number],b:[number,number,number]):number{return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a:[number,number,number],b:[number,number,number]):[number,number,number]{return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function rayTriangle(ray:Ray, prim:PrimitiveRef, mesh:Mesh){ 
  const i0=mesh.indices[prim.indexOffset]; const i1=mesh.indices[prim.indexOffset+1]; const i2=mesh.indices[prim.indexOffset+2];
  const v0=getVertex(mesh.vertices,i0); const v1=getVertex(mesh.vertices,i1); const v2=getVertex(mesh.vertices,i2);
  const edge1=sub(v1,v0); const edge2=sub(v2,v0);
  const pvec=cross(ray.direction,edge2);
  const det=dot(edge1,pvec); const eps=1e-6; if(Math.abs(det)<eps) return null;
  const invDet=1/det;
  const tvec=sub(ray.origin,v0);
  const u=dot(tvec,pvec)*invDet; if(u<0||u>1) return null;
  const qvec=cross(tvec,edge1);
  const v=dot(ray.direction,qvec)*invDet; if(v<0||u+v>1) return null;
  const t=dot(edge2,qvec)*invDet; if(t<=eps) return null;
  return {t,barycentric:[1-u-v,u,v]};
}
