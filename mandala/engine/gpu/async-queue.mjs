/**
 * Documented async compute queue + CPU fallback.
 * Reuses proto Vulkan ∇φ when live; otherwise CPU computeGradientInto.
 * Status: **partial** — not a mature substrate, not Vulkan-everywhere.
 */

import { computeGradientInto } from "../../proto/cpu-reference.mjs";
import { probeAndCompareGradient } from "../../proto/backend/gpu-contract.mjs";

export const GPU_QUEUE_STATUS = "partial";
export const GPU_QUEUE_ABI = "mandala-engine-gpu-queue.v0";

export function createComputeQueue() {
  const jobs = [];
  return {
    abiId: GPU_QUEUE_ABI,
    status: GPU_QUEUE_STATUS,
    backendDefault: "cpu",
    enqueue(name, payload) {
      jobs.push({ name, payload, enqueuedAt: jobs.length });
      return jobs.length;
    },
    size() {
      return jobs.length;
    },
    /**
     * Flush queued kernels. Certified evolution is NOT scheduled here —
     * this queue is observation/compute only (Axiom-X: math above GPU).
     */
    flush({ outDir, tryGpu = false } = {}) {
      const results = [];
      while (jobs.length) {
        const job = jobs.shift();
        if (job.name === "grad-phi") {
          const { scalar, shape } = job.payload;
          const vector = new Float32Array(scalar.length * 3);
          computeGradientInto(scalar, vector, shape);
          let gpu = { status: "skipped", reason: "tryGpu=false" };
          if (tryGpu) {
            gpu = probeAndCompareGradient({ scalar, shape, outDir });
          }
          results.push({
            name: job.name,
            backend: gpu.gpuLive ? "vulkan" : "cpu",
            cpuFallback: !gpu.gpuLive,
            gpu,
            vectorLength: vector.length,
          });
        } else {
          results.push({
            name: job.name,
            backend: "cpu",
            status: "declared",
            reason: "unknown kernel — CPU no-op",
          });
        }
      }
      return { abiId: GPU_QUEUE_ABI, status: GPU_QUEUE_STATUS, results };
    },
  };
}
