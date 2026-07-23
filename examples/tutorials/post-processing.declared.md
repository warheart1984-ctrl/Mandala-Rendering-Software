# Declared — post-processing

`mrs/packages/renderer-core/src/gpu/PostProcessor.js` defines bloom / tone-mapping / chromatic aberration
against a WebGPU `device` (`GPUTextureUsage`, WGSL pipelines).

**Not claimed in the examples suite:**

- No Canvas 2D bloom control in `web-demo.html`
- No measured GPU post-process benchmark here

To exercise later: obtain a WebGPU device, call `createPostProcessor(device)`, then
validate against a real swapchain — do not treat this markdown as a working demo.
