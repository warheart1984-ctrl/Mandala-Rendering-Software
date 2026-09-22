/**
 * Vulkan backend probe wrapper.
 * Full Vulkan-everything is **declared** (independence path).
 * This proto only dispatches one ∇φ compute kernel when the machine can.
 */

export { probeAndCompareGradient, GPU_NUMERIC_CONTRACT } from "./gpu-contract.mjs";

export const VULKAN_BACKEND_STATUS = "partial-or-declared";
export const INDEPENDENCE_PATH = Object.freeze([
  { item: "Vulkan backend", status: "declared", proto: "one ∇φ kernel is partial when any Vulkan device matches CPU; full backend declared. RADV preferred when present." },
  { item: "GLB→lattice compiler", status: "declared" },
  { item: "4D scene graph", status: "declared" },
  { item: "Mandala IDE", status: "declared" },
  { item: "SDK", status: "declared" },
]);
