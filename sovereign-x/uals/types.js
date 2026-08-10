/**
 * UALS v1.0 — Universal Assist Layer Specification Types
 * Constitutional types for multi-backend compute delegation
 */

import { createHash } from "node:crypto";

export const UALS_VERSION = "1.0";

export const BACKEND_TYPES = [
  "cuda",
  "hip",
  "opencl",
  "webgpu",
  "metal",
  "vulkan",
  "cpu-sim",
  "fpga",
];

export const KERNEL_CATEGORIES = [
  "still",
  "video",
  "streaming",
];

export const QUALITY_TIERS = [
  "baseline",
  "high",
  "ultra",
  "reference",
];

export const DETERMINISM_LEVELS = [
  "bit-exact",
  "numerically-stable",
  "stochastic-bounded",
];

export const CONFORMANCE_CHECKS = [
  "determinism",
  "normalization",
  "provenance_integrity",
  "replay_fidelity",
  "byte_exact_parity",
  "backend_fungibility",
  "kernel_consistency",
  "no_nondeterministic_drift",
  "no_authority_leakage",
  "no_global_state_mutation",
  "no_backend_specific_semantics",
  "no_ungoverned_memory_access",
  "no_provenance_loss",
  "no_replay_divergence",
  "no_tile_boundary_artifacts",
  "no_constitutional_violations",
];

export class UALSError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "UALSError";
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = {
  BACKEND_INIT_FAILED: "BACKEND_INIT_FAILED",
  BACKEND_EXECUTE_FAILED: "BACKEND_EXECUTE_FAILED",
  BACKEND_READBACK_FAILED: "BACKEND_READBACK_FAILED",
  KERNEL_NOT_FOUND: "KERNEL_NOT_FOUND",
  KERNEL_INCOMPATIBLE: "KERNEL_INCOMPATIBLE",
  TILING_FAILED: "TILING_FAILED",
  CONFORMANCE_FAILED: "CONFORMANCE_FAILED",
  PARITY_FAILED: "PARITY_FAILED",
  PROVENANCE_LOST: "PROVENANCE_LOST",
  REPLAY_DIVERGENCE: "REPLAY_DIVERGENCE",
  AUTHORITY_LEAKAGE: "AUTHORITY_LEAKAGE",
  INVALID_CONFIG: "INVALID_CONFIG",
};

export function createProvenanceRecord(kernelId, backendId, tileId, params, evidence) {
  return {
    ualsVersion: UALS_VERSION,
    timestamp: Date.now(),
    kernelId,
    backendId,
    tileId,
    params: JSON.stringify(params),
    evidence,
    hash: null,
  };
}

export function hashProvenance(record) {
  const str = `${record.kernelId}|${record.backendId}|${record.tileId}|${record.params}|${record.timestamp}`;
  return createHash("sha256").update(str).digest("hex");
}