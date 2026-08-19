import { buildRenderPipeline } from "./render-pipeline.ts";
const mesh={id:"test",vertices:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])};
const res=buildRenderPipeline(mesh,{maxLeafSize:4,maxDepth:16,binCount:8});
console.log('pipeline test PASS', res.provenance.intentId);
