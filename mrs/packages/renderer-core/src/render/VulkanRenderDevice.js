import { RenderDevice } from "./RenderDevice.js";

export class VulkanRenderDevice extends RenderDevice {
  constructor(options = {}) {
    super("vulkan", options);
    this.gpuExecution = options.gpuExecution ?? null;
    this.producer = null;
    this.previewClient = null;
    this._fallback = null;
    this._meshBuffers = new Map();
    this.nonResidentCommands = [];
  }

  declareGpuExecution(gpuExecution) {
    this.gpuExecution = gpuExecution;
    return this;
  }

  hasConstitutionalGpuExecution() {
    return this.gpuExecution?.version === "1.0"
      && this.gpuExecution?.capabilities?.persistentMeshBuffers === true
      && this.gpuExecution?.capabilities?.texturePixels === true
      && this.gpuExecution?.capabilities?.nativeWorkerHooks === true;
  }

  _requireGpuExecution(operation) {
    if (!this.hasConstitutionalGpuExecution()) {
      const record = {
        status: "blocked",
        backend: "vulkan",
        operation,
        reason: "missing-gpu-execution-declaration",
      };
      this.nonResidentCommands.push(record);
      throw new Error(`Constitutional GPU execution declaration required for ${operation}`);
    }
  }

  _recordNonResident(operation, command, reason) {
    const record = { status: "non-resident", backend: "vulkan", operation, reason, command };
    this.nonResidentCommands.push(record);
    return record;
  }

  async init() {
    const { createSovereignXGPUPreviewDispatch } = await import("../gpu/SovereignXRenderAdapter.js");
    const dispatch = createSovereignXGPUPreviewDispatch();
    this.producer = dispatch;
    this._initialized = true;
    return this;
  }

  async beginFrame() {}

  async endFrame() {}

  clear(color) {}

  drawMesh(mesh, transform, material) {}

  getOrCreatePersistentMeshBuffer(meshKey, mesh) {
    this._requireGpuExecution("createPersistentMeshBuffer");
    if (!meshKey) throw new Error("VulkanRenderDevice requires a stable meshKey for persistent mesh buffers");
    const existing = this._meshBuffers.get(meshKey);
    if (existing) {
      existing.refCount++;
      return existing;
    }
    const vertexBytes = mesh.vertices?.byteLength ?? 0;
    const indexBytes = mesh.indices?.byteLength ?? 0;
    const createCommand = { meshKey, vertexBytes, indexBytes, vertexCount: Math.floor((mesh.vertices?.length ?? 0) / 3), indexCount: mesh.indices?.length ?? 0 };
    const native = this.producer?.createPersistentMeshBuffer
      ? this.producer.createPersistentMeshBuffer(createCommand)
      : this._recordNonResident("createPersistentMeshBuffer", createCommand, "missing-createPersistentMeshBuffer-hook");
    if (native?.handle && this.producer?.uploadPersistentMeshBuffer) {
      this.producer.uploadPersistentMeshBuffer(native.handle, { vertices: mesh.vertices, indices: mesh.indices });
    } else if (native?.handle) {
      this._recordNonResident("uploadPersistentMeshBuffer", { handle: native.handle, vertexBytes, indexBytes }, "missing-uploadPersistentMeshBuffer-hook");
    }
    const entry = {
      key: meshKey,
      backend: "vulkan",
      nativeHandle: native?.handle ?? null,
      descriptorSet: native?.descriptorSet ?? null,
      vertexBytes,
      indexBytes,
      vertexCount: Math.floor((mesh.vertices?.length ?? 0) / 3),
      indexCount: mesh.indices?.length ?? 0,
      indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
      refCount: 1,
      resident: Boolean(native?.handle),
    };
    this._meshBuffers.set(meshKey, entry);
    return entry;
  }

  bindPersistentMeshBufferDescriptors(meshKey, pipelineLayout = "rt4d-static-mesh") {
    this._requireGpuExecution("bindPersistentMeshBuffer");
    const entry = this._meshBuffers.get(meshKey);
    if (!entry) throw new Error(`Persistent mesh buffer ${meshKey} is not allocated`);
    const bindHook = this.producer?.bindPersistentMeshBuffer ?? this.producer?.bindPersistentMeshBufferDescriptors;
    if (bindHook) {
      const descriptor = bindHook.call(this.producer, {
        meshKey,
        handle: entry.nativeHandle,
        descriptorSet: entry.descriptorSet,
        pipelineLayout,
      });
      entry.descriptorSet = descriptor?.descriptorSet ?? entry.descriptorSet;
      entry.bound = true;
    } else {
      entry.bound = false;
      this._recordNonResident("bindPersistentMeshBuffer", { meshKey, handle: entry.nativeHandle, descriptorSet: entry.descriptorSet, pipelineLayout }, "missing-bindPersistentMeshBufferDescriptors-hook");
    }
    return entry;
  }

  dispatchPersistentMeshDraw(meshKey, draw = {}) {
    this._requireGpuExecution("drawPersistentMeshBuffer");
    const entry = this._meshBuffers.get(meshKey);
    if (!entry) throw new Error(`Persistent mesh buffer ${meshKey} is not allocated`);
    const command = {
      meshKey,
      handle: entry.nativeHandle,
      descriptorSet: entry.descriptorSet,
      indexCount: draw.indexCount ?? entry.indexCount,
      instanceCount: draw.instanceCount ?? 1,
      firstIndex: draw.firstIndex ?? 0,
      vertexOffset: draw.vertexOffset ?? 0,
      firstInstance: draw.firstInstance ?? 0,
    };
    const drawHook = this.producer?.drawPersistentMeshBuffer ?? this.producer?.dispatchPersistentMeshDraw;
    if (drawHook) {
      return drawHook.call(this.producer, command);
    }
    return this._recordNonResident("drawPersistentMeshBuffer", command, "missing-drawPersistentMeshBuffer-hook");
  }

  releasePersistentMeshBuffer(meshKey) {
    const entry = this._meshBuffers.get(meshKey);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount > 0) return;
    if (entry.nativeHandle && this.producer?.releasePersistentMeshBuffer) {
      this.producer.releasePersistentMeshBuffer(entry.nativeHandle);
    }
    this._meshBuffers.delete(meshKey);
  }

  persistentMeshBufferCount() {
    return this._meshBuffers.size;
  }

  drawWireframe(mesh, transform, color) {}

  drawVertices(mesh, transform, color) {}

  async present() {
    if (this.producer && this.producer.sendFrame) {
      return this.producer.sendFrame(null);
    }
  }

  readPixels() {
    return null;
  }

  useFallback(fallbackDevice) {
    this._fallback = fallbackDevice;
  }

  release() {
    super.release();
    for (const key of [...this._meshBuffers.keys()]) {
      const entry = this._meshBuffers.get(key);
      if (!entry) continue;
      entry.refCount = 1;
      this.releasePersistentMeshBuffer(key);
    }
    this.producer = null;
    if (this._fallback) this._fallback.release();
  }
}
