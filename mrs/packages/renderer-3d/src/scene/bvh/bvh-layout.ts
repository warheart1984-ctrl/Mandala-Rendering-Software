import { BVHTree, PrimitiveRef, AABB } from "./bvh-spec.ts";

export function computeSceneBounds(primitives:PrimitiveRef[]):AABB{
  if(primitives.length===0) return {min:[0,0,0],max:[0,0,0]};
  const min=[...primitives[0].aabb.min] as [number,number,number];
  const max=[...primitives[0].aabb.max] as [number,number,number];
  for(const p of primitives){
    for(let i=0;i<3;i++){ min[i]=Math.min(min[i],p.aabb.min[i]); max[i]=Math.max(max[i],p.aabb.max[i]); }
  }
  return {min,max};
}
export interface CPULayout { nodes:any[]; primitives:PrimitiveRef[]; }
export interface GPULayout { nodeBuffer:Float32Array; primitiveBuffer:Uint32Array; metaBuffer:Uint32Array; }
export function toCPULayout(tree:BVHTree, primitives:PrimitiveRef[]):CPULayout { return {nodes:tree.nodes, primitives}; }
export function toGPULayout(tree:BVHTree, primitives:PrimitiveRef[]):GPULayout {
  const nodeCount=tree.nodes.length;
  const stride=11;
  const nodeBuffer=new Float32Array(nodeCount*stride);
  for(let i=0;i<nodeCount;i++){
    const n=tree.nodes[i]; const base=i*stride;
    nodeBuffer.set(n.bounds.min,base); nodeBuffer.set(n.bounds.max,base+3);
    nodeBuffer[base+6]=n.children[0]??0xffffffff;
    nodeBuffer[base+7]=n.children[1]??0xffffffff;
    nodeBuffer[base+8]=n.children[2]??0xffffffff;
    nodeBuffer[base+9]=n.children[3]??0xffffffff;
    nodeBuffer[base+10]=n.isLeaf?1:0;
  }
  const primBuf=new Uint32Array(primitives.length*4);
  for(let i=0;i<primitives.length;i++){ const base=i*4; primBuf[base+1]=0; primBuf[base+3]=i; }
  const metaBuf=new Uint32Array([tree.rootIndex,nodeCount,1,0,0]);
  return {nodeBuffer,primitiveBuffer:primBuf,metaBuffer:metaBuf};
}
