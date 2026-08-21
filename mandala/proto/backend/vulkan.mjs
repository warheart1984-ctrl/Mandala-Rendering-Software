/**
 * Vulkan backend probe wrapper.
 * Full Vulkan-everything is **declared** (independence path).
 * This proto only dispatches one ∇φ compute kernel when the machine can.
 */

export { probeAndCompareGradient, GPU_NUMERIC_CONTRACT } from "./gpu-contract.mjs";

export const VULKAN_BACKEND_STATUS = "partial-or-declared";
export const INDEPENDENCE_PATH = Object.freeze([
  { item: "Vulkan backend", status: "declared", proto: "one compute kernel if RADV is live" },
  { item: "GLB→lattice compiler", status: "declared" },
  { item: "4D scene graph", status: "declared" },
  { item: "Mandala IDE", status: "declared" },
  { item: "SDK", status: "declared" },
]);
