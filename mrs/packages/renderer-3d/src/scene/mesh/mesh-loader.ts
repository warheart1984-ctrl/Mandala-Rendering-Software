import { Mesh } from "./mesh-types.ts";
import { PrimitiveRef, AABB } from "../bvh/bvh-spec.ts";

function computeAABB(mesh:Mesh):AABB{
  let min:[number,number,number]=[Infinity,Infinity,Infinity];
  let max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.vertices.length;i+=3){
    for(let j=0;j<3;j++){
      min[j]=Math.min(min[j],mesh.vertices[i+j]);
      max[j]=Math.max(max[j],mesh.vertices[i+j]);
    }
  }
  return {min,max};
}

export function meshToPrimitives(mesh:Mesh):PrimitiveRef[]{
  const aabb=computeAABB(mesh);
  const count=mesh.indices.length/3;
  const prims:PrimitiveRef[]=[];
  for(let i=0;i<count;i++){
    prims.push({id:`${mesh.id}-tri-${i}`,meshId:mesh.id,indexOffset:i*3,aabb});
  }
  return prims;
}
