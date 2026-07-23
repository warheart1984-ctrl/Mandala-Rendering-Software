import assert from "node:assert/strict";
import { createCanvas } from "../4d-renderer/node_modules/canvas/index.js";
import { CanvasRenderer, getRenderProfile, getSurface, sampleSurface } from "../mrs/packages/renderer-core/src/index.js";
import { isWebGPUSupported, createRendererWithFallback } from "../mrs/packages/renderer-core/src/gpu/WebGPURenderer.js";
import { createGovernedRenderer, createSovereignXNativeDispatch, discoverBrowserRenderAdapters, routeSovereignXRenderer } from "../mrs/packages/renderer-core/src/gpu/SovereignXRenderAdapter.js";
import { TesseractRenderer } from "../js/renderer.js";
import fs from "node:fs";
import { parseSharedFrame, SHARED_FRAME_HEADER_BYTES, SHARED_FRAME_MAGIC } from "../mrs/packages/renderer-core/src/gpu/SharedFramePreview.js";

function imageMetrics(surfaceId, profile, t) {
  const width = 320, height = 240;
  const canvas = createCanvas(width, height);
  const style = getRenderProfile(profile);
  const renderer = new CanvasRenderer(canvas, { profile, scaleMode: "fit", frameSmoothing: 1 });
  renderer.renderFrame(sampleSurface(getSurface(surfaceId), 18), t, { temporalFraming: false });
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  let occupied = 0, minX=width, minY=height, maxX=-1, maxY=-1;
  const bg = style.background.match(/[0-9a-f]{2}/gi).map((v)=>parseInt(v,16));
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    if (Math.abs(data[i]-bg[0])+Math.abs(data[i+1]-bg[1])+Math.abs(data[i+2]-bg[2]) > 18) {
      occupied++; minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    }
  }
  return { coverage: occupied/(width*height), width:maxX-minX+1, height:maxY-minY+1 };
}

for (const [surface, profile] of [["tesseract","technical"],["clifford-torus","cinematic"],["hopf-surface","solid-copper"]]) {
  const m=imageMetrics(surface,profile,0.37);
  assert.ok(m.coverage > 0.002 && m.coverage < 0.8, `${surface} visible coverage`);
  assert.ok(m.width > 60 && m.height > 45, `${surface} adaptively framed`);
}

assert.equal(isWebGPUSupported({ navigator: {} }), false);
const fallback = await createRendererWithFallback({ scope:{navigator:{}}, fallbackFactory: async()=>({ kind:"canvas" }) });
assert.equal(fallback.kind,"canvas");
const browserAdapters = await discoverBrowserRenderAdapters({ navigator: {} });
assert.deepEqual(browserAdapters.map((a)=>a.backend), ["canvas"]);
const routed = await routeSovereignXRenderer({
  router: { name:"fake" }, request:{id:"r1"}, runtime:{}, limits:{}, adapters:browserAdapters,
  routeRender: (_router,_request,_runtime,_limits,adapters)=>({ action:"dispatch",backend:"canvas",adapter:adapters[0],reason:"test" }),
});
const governed = await createGovernedRenderer(routed.decision,{canvasFactory:async()=>({kind:"governed-canvas"})});
assert.equal(governed.kind,"governed-canvas");
const nativeDispatch=createSovereignXNativeDispatch({sceneId:"scene",scenePath:"scene.json",outputDir:"out",width:320,height:240,frames:1,fps:30,worker:{executable:"worker"},createJob:(v)=>({version:"1.0",jobId:"job",...v}),dispatchJob:async()=>({status:"completed"})});
const native=await nativeDispatch({backend:"vulkan",adapter:{id:"gpu-1"},evidenceRefs:["e-1"]});
assert.equal(native.kind,"sovereignx-native-render"); assert.equal(native.job.adapterId,"gpu-1");
const daemonNative=createSovereignXNativeDispatch({sceneId:"scene",scenePath:"scene.json",outputDir:"out",width:320,height:240,frames:2,fps:30,createJob:(v)=>({version:"1.0",jobId:"daemon-job",...v}),daemon:{dispatch:async(job)=>({status:"completed",jobId:job.jobId})}});
assert.equal((await daemonNative({backend:"vulkan",evidenceRefs:[]})).receipt.jobId,"daemon-job");
const hostCanvas=createCanvas(320,240); const host=new TesseractRenderer(hostCanvas,{adaptiveQuality:false});host.setSurface("clifford-torus");host.setQuality("performance");
assert.equal(host.quality,"performance");assert.equal(host.vertices4D.length,19*19);host.setProfile("cinematic");assert.equal(host.renderMode,"solid");host.resetView();assert.equal(host.theta,0);
const shaderSource=fs.readFileSync(new URL("../mrs/packages/renderer-core/src/gpu/WebGPURenderer.js",import.meta.url),"utf8");
assert.match(shaderSource,/let time = uniforms\[32\]/);assert.match(shaderSource,/fn normal4/);assert.doesNotMatch(shaderSource,/let time = uniforms\[48\]/);
const both=imageMetrics("clifford-torus","lattice",0.2);assert.ok(both.coverage>0.002,"combined solid + wireframe mode renders");
const shared=new ArrayBuffer(SHARED_FRAME_HEADER_BYTES+16*2),sharedView=new DataView(shared);[SHARED_FRAME_MAGIC,1,2,2,8,7,1,16].forEach((value,index)=>sharedView.setUint32(index*4,value,true));new Uint8Array(shared,SHARED_FRAME_HEADER_BYTES+16).fill(127);
const parsedShared=parseSharedFrame(shared);assert.equal(parsedShared.frameIndex,7);assert.equal(parsedShared.activeSlot,1);assert.equal(parsedShared.pixels[0],127);
console.log("visual regression ok — adaptive coverage, solid lighting, WebGPU fallback");
