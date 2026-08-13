/**
 * Axiom Vision — Sovereign X Workload Adapter.
 *
 * Integrates vision as a workload class in the Sovereign X router.
 * Vision workloads run through the same capability ABI as render/evolve.
 */

import { getVisionKernelEntries } from "./kernelRegistry.js";

/**
 * Vision workload descriptor.
 */
export class VisionWorkload {
  constructor(imageBuffer, options = {}) {
    this.type = "vision";
    this.imageBuffer = imageBuffer;
    this.options = options;
    this.id = options.id || `vision_${Date.now()}`;
  }
}

/**
 * Create a Sovereign X vision handler.
 * Plugs into GpuAssistModule or equivalent router.
 *
 * @param {Object} deps
 * @param {Object} deps.kernelRegistry - Existing KernelRegistry instance
 * @param {Function} deps.cpuBackend - CPU execution function
 * @param {Function} [deps.gpuBackend] - GPU execution function (optional)
 * @returns {Object} Vision handler with execute() method
 */
export function createVisionHandler({ kernelRegistry, cpuBackend, gpuBackend }) {
  // Register vision kernels if not already present
  const visionKernels = getVisionKernelEntries();
  for (const entry of visionKernels) {
    if (!kernelRegistry.get(entry.kernelId)) {
      kernelRegistry.register(entry);
    }
  }

  return {
    /**
     * Execute a vision workload.
     * @param {VisionWorkload} workload
     * @returns {Promise<Object>} Vision IR
     */
    async execute(workload) {
      const { imageBuffer, options } = workload;

      // Select kernels based on requested features
      const kernels = selectVisionKernels(kernelRegistry, options);

      // Always run CPU reference for conformance
      const cpuResult = await cpuBackend.execute({
        type: "vision",
        imageBuffer,
        options,
        kernels,
      });

      if (gpuBackend) {
        try {
          const gpuResult = await gpuBackend.execute({
            type: "vision",
            imageBuffer,
            options,
            kernels,
          });

          // Conformance: CPU vs GPU parity check for L1-L2
          const parityCheck = verifyParity(cpuResult, gpuResult, options);

          if (!parityCheck.pass && options.strictParity) {
            // CPU is authoritative — return CPU result
            return cpuResult;
          }

          return gpuResult;
        } catch (e) {
          // GPU failed — fall back to CPU (authority)
          cpuResult._gpuFallback = true;
          cpuResult._gpuError = e.message;
          return cpuResult;
        }
      }

      return cpuBackend.execute({
        type: "vision",
        imageBuffer,
        options,
        kernels,
      });
    },
  };
}

function selectVisionKernels(registry, options) {
  const kernels = [];
  const always = ["vision_edge_sobel_3x3"];

  const optional = [
    { flag: "includeHistogram", kernel: "vision_histogram_perchannel" },
    { flag: "includeGradientField", kernel: "vision_gradient_sobel_field" },
    { flag: "includeRegions", kernel: "vision_connected_components_8way" },
    { flag: "includeContours", kernel: "vision_contours_suzuki_abe" },
  ];

  kernels.push(...always);
  for (const { flag, kernel } of optional) {
    if (options[flag] !== false) {
      kernels.push(kernel);
    }
  }

  return kernels.filter(k => registry.get(k) != null);
}

function verifyParity(cpuResult, gpuResult, options) {
  const tolerance = options.tolerance || 1e-6;
  const cpuGraph = cpuResult.evidence_graph || {};
  const gpuGraph = gpuResult.evidence_graph || {};

  // L1-L2 must match for deterministic kernels
  const l1Match = (cpuGraph.L1?.length || 0) === (gpuGraph.L1?.length || 0);
  const l2Match = (cpuGraph.L2?.length || 0) === (gpuGraph.L2?.length || 0);

  return {
    pass: l1Match && l2Match,
    detail: `L1: ${cpuGraph.L1?.length || 0}/${gpuGraph.L1?.length || 0}, L2: ${cpuGraph.L2?.length || 0}/${gpuGraph.L2?.length || 0}`,
  };
}
