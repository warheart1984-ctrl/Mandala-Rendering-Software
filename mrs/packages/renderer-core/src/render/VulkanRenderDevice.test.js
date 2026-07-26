import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VulkanRenderDevice } from "./VulkanRenderDevice.js";

const GPU_EXECUTION = {
  version: "1.0",
  capabilities: {
    persistentMeshBuffers: true,
    texturePixels: true,
    nativeWorkerHooks: true,
  },
};

describe("VulkanRenderDevice persistent mesh buffers", () => {
  it("creates and reuses native persistent mesh buffer handles when producer supports them", () => {
    const released = [];
    const uploaded = [];
    const bound = [];
    const draws = [];
    const device = new VulkanRenderDevice({ gpuExecution: GPU_EXECUTION });
    device.producer = {
      createPersistentMeshBuffer({ meshKey, vertexBytes, indexBytes }) {
        return { handle: `vk:${meshKey}`, descriptorSet: `set:${meshKey}`, vertexBytes, indexBytes };
      },
      uploadPersistentMeshBuffer(handle, payload) {
        uploaded.push({ handle, vertexBytes: payload.vertices.byteLength, indexBytes: payload.indices.byteLength });
      },
      bindPersistentMeshBufferDescriptors(command) {
        bound.push(command);
        return { descriptorSet: `bound:${command.meshKey}` };
      },
      dispatchPersistentMeshDraw(command) {
        draws.push(command);
        return { status: "submitted", command };
      },
      releasePersistentMeshBuffer(handle) {
        released.push(handle);
      },
    };
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const a = device.getOrCreatePersistentMeshBuffer("mesh:tri", mesh);
    const b = device.getOrCreatePersistentMeshBuffer("mesh:tri", mesh);
    assert.equal(a, b);
    assert.equal(a.nativeHandle, "vk:mesh:tri");
    assert.equal(a.descriptorSet, "set:mesh:tri");
    assert.equal(a.resident, true);
    assert.equal(a.indexFormat, "uint32");
    assert.equal(device.persistentMeshBufferCount(), 1);
    assert.deepEqual(uploaded, [{ handle: "vk:mesh:tri", vertexBytes: 36, indexBytes: 12 }]);
    const descriptor = device.bindPersistentMeshBufferDescriptors("mesh:tri");
    assert.equal(descriptor.descriptorSet, "bound:mesh:tri");
    const draw = device.dispatchPersistentMeshDraw("mesh:tri", { instanceCount: 2 });
    assert.equal(draw.status, "submitted");
    assert.equal(draw.command.descriptorSet, "bound:mesh:tri");
    assert.equal(draw.command.instanceCount, 2);
    assert.equal(bound.length, 1);
    assert.equal(draws.length, 1);
    device.releasePersistentMeshBuffer("mesh:tri");
    assert.equal(device.persistentMeshBufferCount(), 1);
    device.releasePersistentMeshBuffer("mesh:tri");
    assert.equal(device.persistentMeshBufferCount(), 0);
    assert.deepEqual(released, ["vk:mesh:tri"]);
  });

  it("records a declared non-resident entry when native worker hook is absent", () => {
    const device = new VulkanRenderDevice({ gpuExecution: GPU_EXECUTION });
    const entry = device.getOrCreatePersistentMeshBuffer("mesh:tri", {
      vertices: new Float32Array([0, 0, 0]),
      indices: new Uint16Array([0]),
    });
    assert.equal(entry.backend, "vulkan");
    assert.equal(entry.nativeHandle, null);
    assert.equal(entry.resident, false);
    assert.equal(entry.indexFormat, "uint16");
    const descriptor = device.bindPersistentMeshBufferDescriptors("mesh:tri");
    assert.equal(descriptor.bound, false);
    const draw = device.dispatchPersistentMeshDraw("mesh:tri");
    assert.equal(draw.status, "non-resident");
    assert.equal(device.nonResidentCommands.length, 3);
  });

  it("blocks native mesh execution without explicit constitutional GPU declaration", () => {
    const device = new VulkanRenderDevice();
    assert.throws(
      () => device.getOrCreatePersistentMeshBuffer("mesh:tri", { vertices: new Float32Array([0, 0, 0]), indices: new Uint16Array([0]) }),
      /Constitutional GPU execution declaration required/,
    );
    assert.equal(device.nonResidentCommands[0].reason, "missing-gpu-execution-declaration");
  });
});
