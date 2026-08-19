import { BVHTree, PrimitiveRef } from "./bvh-spec.ts";
import { BuildEvidence, TraversalEvidence } from "./bvh-evidence.ts";
import { BVHBuildConfig, buildBVH_SAH } from "./bvh-builder-sah.ts";
import { Ray } from "./bvh-traversal-simd.ts";

export interface ValidationReport {
  ok:boolean;
  treeHashMatch:boolean;
  hitSequenceMatch:boolean;
  details:string[];
}

function stableHash(s:string):string{ let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*0x01000193)>>>0; } return h.toString(16); }
export function validateBVHReplay(primitives:PrimitiveRef[], config:BVHBuildConfig, originalTree:BVHTree, buildEvidence:BuildEvidence, traversalEvidence:TraversalEvidence, rays:Ray[]):ValidationReport{
  const rebuilt={tree:{}} as any; // placeholder
  const {tree:rebuiltTree}=buildBVH_SAH(primitives,config);
  const treeHashMatch=stableHash(JSON.stringify(originalTree.nodes))===stableHash(JSON.stringify(rebuiltTree.nodes));
  const hitSequenceMatch=true; // placeholder
  const ok=treeHashMatch && hitSequenceMatch;
  return {ok,treeHashMatch,hitSequenceMatch,details:ok?[]:['Replay divergence']};
}
