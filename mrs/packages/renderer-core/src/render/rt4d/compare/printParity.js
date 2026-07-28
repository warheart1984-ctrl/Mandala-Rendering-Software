/**
 * Print-oriented CPU↔GPU parity probe helpers.
 *
 * STATUS: **partial** — receipt/metrics **enforced** in unit tests;
 * live WebGPU on Node is skipped (skip ≠ pass).
 */

/**
 * Probe whether a WebGPU adapter is available in this runtime.
 * Node without Dawn/navigator.gpu → unavailable.
 *
 * GPU host note (tao-setup-nvidia-gpu-host skill, Drive-G-1):
 *   Claiming NVIDIA CUDA print acceleration also requires a checked GPU host
 *   (nvidia-smi / container toolkit). That path remains **absent** for printer.
 *   AMD ROCm/HIP remains **absent** — use rocm-doctor/rocm-setup skills only
 *   when diagnosing a future host, not as evidence of print support.
 *
 * @returns {{ available: boolean, reason: string, statusTag: string }}
 */
export function probeWebGpuAvailability() {
  const nav =
    typeof globalThis !== "undefined" ? globalThis.navigator : undefined;
  if (!nav || !nav.gpu) {
    return {
      available: false,
      reason: "navigator.gpu missing (typical Node CI) — skip ≠ pass",
      statusTag: "partial",
    };
  }
  return {
    available: true,
    reason: "navigator.gpu present — live adapter probe still required",
    statusTag: "partial",
  };
}

/**
 * Honest vendor capability map for print SoT (Drive-G-1).
 * Does **not** probe the host GPU or claim CUDA/HIP/NVENC print acceleration.
 * Operator host checks live in `scripts/check-nvidia-gpu-host.mjs` and
 * `scripts/detect-gpu-backend.py` (check-only / diagnose; not printer SoT).
 *
 * @returns {Record<string, { statusTag: string, note: string, available?: boolean }>}
 */
export function probeVendorGpuHonesty() {
  const webgpu = probeWebGpuAvailability();
  return {
    webgpu: {
      statusTag: webgpu.statusTag,
      available: webgpu.available,
      note: webgpu.reason,
    },
    cudaPrintPath: {
      statusTag: "absent",
      note:
        "No CUDA printer kernel SoT — tao-setup-nvidia-gpu-host is host check only; " +
        "tilegym/cuTile N/A for Digital Printer beauty",
    },
    hipPrintPath: {
      statusTag: "absent",
      note:
        "No HIP/ROCm printer path — rocm-setup/rocm-doctor/hip-rocm are diagnose/scaffold only",
    },
    nvenc: {
      statusTag: "partial",
      note:
        "NVENCEncoder exists for video encode assist when ffmpeg reports nvenc; " +
        "not Digital Printer beauty SoT",
    },
    cutile: {
      statusTag: "na",
      note: "No in-repo CUDA kernel candidate for printer SoT — cuTile skill unused",
    },
    nim: {
      statusTag: "assist",
      note: "Genblaze NIM/FLUX is creative assist — never printer beauty SoT",
    },
  };
}

/**
 * Build a print-sized scene config for parity receipts (not a full GLB path).
 * Used by unit tests with synthetic RGBA plates.
 */
export function printParitySceneConfig(overrides = {}) {
  return {
    sceneId: "print-parity-tiny",
    seed: 42,
    width: 16,
    height: 16,
    spp: 8,
    glbPath: "synthetic://print-parity",
    camera: {},
    thresholds: { maxPixelDelta: 0.01, mse: 0.0001, ssim: 0.99 },
    ...overrides,
  };
}
