import { buildBVH_SAH } from "./bvh-builder-sah.ts";
import { intersectBVH } from "./bvh-traversal-simd.ts";

export function benchmark(primitives, rays){
  const t0=performance.now();
  const {tree}=buildBVH_SAH(primitives,{maxLeafSize:4,maxDepth:32,binCount:8,heuristicVersion:"sah-v1",intentId:"bench"});
  const buildTime=performance.now()-t0;
  let hits=0;
  const t1=performance.now();
  for(const r of rays){ const {result}=intersectBVH(tree,primitives,r); if(result.hit) hits++; }
  const travTime=performance.now()-t1;
  return {buildTime,travTime,hits};
}
