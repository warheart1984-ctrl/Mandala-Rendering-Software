import { BVHTree, PrimitiveRef } from "./bvh-spec.ts";
import { toGPULayout } from "./bvh-layout.ts";

export function uploadBVH(device:any, tree:BVHTree, primitives:PrimitiveRef[]){
  const {nodeBuffer, primitiveBuffer, metaBuffer}=toGPULayout(tree, primitives);
  const nodeBuf=device.createBuffer({size:nodeBuffer.byteLength, usage:1});
  device.queue.writeBuffer(nodeBuf,0,nodeBuffer);
  const primBuf=device.createBuffer({size:primitiveBuffer.byteLength, usage:1});
  device.queue.writeBuffer(primBuf,0,primitiveBuffer);
  const metaBuf=device.createBuffer({size:metaBuffer.byteLength, usage:2});
  device.queue.writeBuffer(metaBuf,0,metaBuffer);
  return {nodeBuf, primBuf, metaBuf};
}
