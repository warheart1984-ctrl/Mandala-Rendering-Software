import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";
import { createComputeQueue, GPU_QUEUE_ABI } from "../gpu/async-queue.mjs";

describe("GPU async queue", () => {
  it("flushes grad-phi on CPU fallback without claiming Vulkan-everywhere", () => {
    const state = createInitialCertifiedState({ seed: 1 });
    const q = createComputeQueue();
    q.enqueue("grad-phi", { scalar: state.scalar, shape: state.shape });
    assert.equal(q.size(), 1);
    const flushed = q.flush({ tryGpu: false });
    assert.equal(flushed.abiId, GPU_QUEUE_ABI);
    assert.equal(flushed.results[0].backend, "cpu");
    assert.equal(flushed.results[0].cpuFallback, true);
    assert.equal(q.size(), 0);
  });
});
