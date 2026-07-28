# WebGPU Usage Rules

1. `GPUBufferUsage.COPY_DST` is for buffers; `GPUTextureUsage.COPY_DST` is for textures.
2. `storeOp` must be `"store"` — never `"multisample"`.
3. Every `createTexture` call must specify correct `usage` flags.
4. `createBindGroupLayout` entries must match shader binding declarations.
5. Adapter `requestAdapter` must handle `null` return.
6. `device.lost` must be handled to null out device references.
