# Mock Factory Patterns

1. `createMockDevice()` — returns object with createBuffer, createTexture, createSampler, createShaderModule, createBindGroupLayout, createPipelineLayout, createRenderPipeline, createComputePipeline, createBindGroup, createCommandEncoder, queue.writeBuffer, queue.submit.
2. `createMockEncoder()` — returns object with beginRenderPass, beginComputePass, copyBufferToBuffer, finish.
3. Each mock method should track calls for verification.
4. Globals like `GPUTextureUsage`, `GPUBufferUsage`, `GPUShaderStage` must be defined.
