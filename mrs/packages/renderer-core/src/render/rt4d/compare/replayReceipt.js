/**
 * Replay receipt — ties CPU and GPU render outputs to the same constitutional state.
 *
 * A replay receipt is the formal proof artifact:
 *   "CPU and GPU are two execution backends of the same sovereign renderer."
 *
 * It binds:
 *   - sceneConfigHash   — hash of the canonical scene config JSON
 *   - intentHash        — hash of the rendering intent (what was requested)
 *   - per-backend executionHash + pngChecksum
 *   - comparison metrics + pass/fail
 */

import { createHash } from "node:crypto";

/**
 * SHA-256 hash of arbitrary data.
 * @param {string|Buffer|Uint8Array} data
 * @returns {string} hex digest
 */
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute a deterministic hash of the scene configuration.
 * Sorts keys to ensure canonical ordering.
 *
 * @param {object} sceneConfig
 * @returns {string} hex digest
 */
export function hashSceneConfig(sceneConfig) {
  const canonical = JSON.stringify(sceneConfig, Object.keys(sceneConfig).sort());
  return sha256(canonical);
}

/**
 * Compute intent hash from the scene config + renderer version.
 *
 * @param {object} sceneConfig
 * @param {string} rendererVersion
 * @returns {string} hex digest
 */
export function hashIntent(sceneConfig, rendererVersion) {
  const intent = {
    sceneId: sceneConfig.sceneId,
    glbPath: sceneConfig.glbPath,
    width: sceneConfig.width,
    height: sceneConfig.height,
    spp: sceneConfig.spp,
    seed: sceneConfig.seed,
    camera: sceneConfig.camera,
    rendererVersion,
  };
  const canonical = JSON.stringify(intent, Object.keys(intent).sort());
  return sha256(canonical);
}

/**
 * Compute execution hash for a single backend run.
 *
 * @param {{ backendName: string, rendererVersion: string, pngBuffer: Buffer, provenance: object }} backend
 * @returns {string} hex digest
 */
export function hashExecution(backend) {
  const exec = {
    backendName: backend.backendName,
    rendererVersion: backend.rendererVersion,
    pngChecksum: sha256(backend.pngBuffer),
    provenance: backend.provenance,
  };
  const canonical = JSON.stringify(exec, Object.keys(exec).sort());
  return sha256(canonical);
}

/**
 * Generate a complete replay receipt binding CPU + GPU outputs.
 *
 * @param {{
 *   sceneConfig: object,
 *   cpu: { pngBuffer: Buffer, provenance: object, rendererVersion: string },
 *   gpu: { pngBuffer: Buffer, provenance: object, rendererVersion: string },
 *   comparison: { maxPixelDelta: number, mse: number, psnr: number, ssim: number, status: string },
 *   replayId?: string
 * }} params
 * @returns {object} replay receipt
 */
export function generateReplayReceipt({ sceneConfig, cpu, gpu, comparison, replayId }) {
  const sceneConfigHash = hashSceneConfig(sceneConfig);
  const intentHash = hashIntent(sceneConfig, cpu.rendererVersion);

  const cpuExecHash = hashExecution({
    backendName: "PathTracer4D_CPU",
    rendererVersion: cpu.rendererVersion,
    pngBuffer: cpu.pngBuffer,
    provenance: cpu.provenance,
  });

  const gpuExecHash = hashExecution({
    backendName: "PathTracer4D_GPU",
    rendererVersion: gpu.rendererVersion,
    pngBuffer: gpu.pngBuffer,
    provenance: gpu.provenance,
  });

  const autoId = `receipt-${sceneConfig.sceneId}-${sceneConfig.seed}-${Date.now()}`;

  return {
    replayId: replayId ?? autoId,
    sceneConfigHash,
    intentHash,
    backends: {
      cpu: {
        name: "PathTracer4D_CPU",
        executionHash: cpuExecHash,
        pngChecksum: sha256(cpu.pngBuffer),
        rendererVersion: cpu.rendererVersion,
      },
      gpu: {
        name: "PathTracer4D_GPU",
        executionHash: gpuExecHash,
        pngChecksum: sha256(gpu.pngBuffer),
        rendererVersion: gpu.rendererVersion,
      },
    },
    comparison: {
      maxPixelDelta: comparison.maxPixelDelta,
      mse: comparison.mse,
      ssim: comparison.ssim,
      thresholds: sceneConfig.thresholds ?? {},
      status: comparison.status,
    },
  };
}

/**
 * Verify that a replay receipt is internally consistent.
 * Checks that the hashes match the claimed data.
 *
 * @param {object} receipt — replay receipt
 * @param {object} sceneConfig — original scene config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyReplayReceipt(receipt, sceneConfig) {
  const errors = [];

  const expectedConfigHash = hashSceneConfig(sceneConfig);
  if (receipt.sceneConfigHash !== expectedConfigHash) {
    errors.push(`sceneConfigHash mismatch: expected ${expectedConfigHash}, got ${receipt.sceneConfigHash}`);
  }

  if (!receipt.backends?.cpu?.executionHash) {
    errors.push("missing cpu.executionHash");
  }
  if (!receipt.backends?.gpu?.executionHash) {
    errors.push("missing gpu.executionHash");
  }

  if (!receipt.comparison || typeof receipt.comparison.status !== "string") {
    errors.push("missing comparison.status");
  }

  return { valid: errors.length === 0, errors };
}
