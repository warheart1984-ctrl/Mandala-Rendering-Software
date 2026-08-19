import { buildBVH_SAH } from "./bvh-builder-sah.ts";
import { intersectBVH } from "./bvh-traversal-simd.ts";

describe("BVH v3", ()=>{
  test("build tree",()=>{
    const primitives=[{id:"t1",aabb:{min:[0,0,0],max:[1,1,1]}}];
    const {tree}=buildBVH_SAH(primitives,{maxLeafSize:2,maxDepth:8,binCount:8,heuristicVersion:"sah-v1",intentId:"bvh-v3-sah-simd"});
    expect(tree.nodes.length).toBeGreaterThan(0);
  });
  test("intersect",()=>{
    const primitives=[{id:"t1",aabb:{min:[0,0,0],max:[1,1,1]}}];
    const {tree}=buildBVH_SAH(primitives,{maxLeafSize:2,maxDepth:8,binCount:8,heuristicVersion:"sah-v1",intentId:"bvh-v3-sah-simd"});
    const {result}=intersectBVH(tree,primitives,{origin:[0.5,0.5,-1],direction:[0,0,1]});
    expect(result.hit).toBe(true);
  });
});
