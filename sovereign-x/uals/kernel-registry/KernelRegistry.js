/**
 * UALS v1.0 — Kernel Registry (KR)
 * Constitutional metadata ledger for all kernel variants
 */

import { UALSError, ERROR_CODES, KERNEL_CATEGORIES, QUALITY_TIERS, CONFORMANCE_CHECKS } from "../types.js";

export class KernelRegistry {
  constructor() {
    this.kernels = new Map();
    this.byCategory = new Map();
    this.byBackend = new Map();
    this.byQuality = new Map();
  }

  register(kernelEntry) {
    this._validateEntry(kernelEntry);

    const entry = {
      ...kernelEntry,
      registeredAt: Date.now(),
      ualsVersion: "1.0",
    };

    this.kernels.set(entry.kernelId, entry);

    if (!this.byCategory.has(entry.category)) {
      this.byCategory.set(entry.category, new Set());
    }
    this.byCategory.get(entry.category).add(entry.kernelId);

    for (const backend of entry.backends) {
      if (!this.byBackend.has(backend)) {
        this.byBackend.set(backend, new Set());
      }
      this.byBackend.get(backend).add(entry.kernelId);
    }

    if (!this.byQuality.has(entry.qualityTier)) {
      this.byQuality.set(entry.qualityTier, new Set());
    }
    this.byQuality.get(entry.qualityTier).add(entry.kernelId);

    return entry;
  }

  _validateEntry(entry) {
    if (!entry.kernelId || typeof entry.kernelId !== "string") {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "kernelId is required and must be a string");
    }

    if (this.kernels.has(entry.kernelId)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Kernel ${entry.kernelId} already registered`);
    }

    if (!entry.category || !KERNEL_CATEGORIES.includes(entry.category)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Invalid category: ${entry.category}. Must be one of: ${KERNEL_CATEGORIES.join(", ")}`);
    }

    if (!entry.backends || !Array.isArray(entry.backends) || entry.backends.length === 0) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "At least one backend must be specified");
    }

    if (!entry.qualityTier || !QUALITY_TIERS.includes(entry.qualityTier)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Invalid qualityTier: ${entry.qualityTier}. Must be one of: ${QUALITY_TIERS.join(", ")}`);
    }

    if (!entry.determinismGuarantee) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "determinismGuarantee is required");
    }

    if (!entry.conformanceProfile || !Array.isArray(entry.conformanceProfile)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "conformanceProfile must be an array of check IDs");
    }

    for (const check of entry.conformanceProfile) {
      if (!CONFORMANCE_CHECKS.includes(check)) {
        throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Unknown conformance check: ${check}`);
      }
    }

    if (!entry.replayMetadata) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "replayMetadata is required");
    }

    if (!entry.provenanceSchema) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "provenanceSchema is required");
    }
  }

  get(kernelId) {
    return this.kernels.get(kernelId) || null;
  }

  getAll() {
    return Array.from(this.kernels.values());
  }

  getByCategory(category) {
    const ids = this.byCategory.get(category) || new Set();
    return Array.from(ids).map(id => this.kernels.get(id));
  }

  getByBackend(backend) {
    const ids = this.byBackend.get(backend) || new Set();
    return Array.from(ids).map(id => this.kernels.get(id));
  }

  getByQuality(qualityTier) {
    const ids = this.byQuality.get(qualityTier) || new Set();
    return Array.from(ids).map(id => this.kernels.get(id));
  }

  findCompatible(operation, constraints = {}) {
    const {
      category,
      backend,
      qualityTier,
      minDeterminism,
      maxTileSize,
    } = constraints;

    let candidates = this.getAll();

    if (category) {
      candidates = candidates.filter(k => k.category === category);
    }

    if (backend) {
      candidates = candidates.filter(k => k.backends.includes(backend));
    }

    if (qualityTier) {
      candidates = candidates.filter(k => k.qualityTier === qualityTier);
    }

    if (maxTileSize) {
      candidates = candidates.filter(k => 
        k.maxTileSize && 
        k.maxTileSize.width <= maxTileSize.width && 
        k.maxTileSize.height <= maxTileSize.height
      );
    }

    return candidates;
  }

  selectBest(operation, constraints = {}) {
    const candidates = this.findCompatible(operation, constraints);
    if (candidates.length === 0) return null;

    const qualityOrder = { reference: 4, ultra: 3, high: 2, baseline: 1 };
    const determinismOrder = { "bit-exact": 3, "numerically-stable": 2, "stochastic-bounded": 1 };

    return candidates.sort((a, b) => {
      const qDiff = (qualityOrder[b.qualityTier] || 0) - (qualityOrder[a.qualityTier] || 0);
      if (qDiff !== 0) return qDiff;
      return (determinismOrder[b.determinismGuarantee] || 0) - (determinismOrder[a.determinismGuarantee] || 0);
    })[0];
  }

  unregister(kernelId) {
    const entry = this.kernels.get(kernelId);
    if (!entry) return false;

    this.kernels.delete(kernelId);
    this.byCategory.get(entry.category)?.delete(kernelId);
    for (const backend of entry.backends) {
      this.byBackend.get(backend)?.delete(kernelId);
    }
    this.byQuality.get(entry.qualityTier)?.delete(kernelId);

    return true;
  }

  clear() {
    this.kernels.clear();
    this.byCategory.clear();
    this.byBackend.clear();
    this.byQuality.clear();
  }

  toJSON() {
    return {
      ualsVersion: "1.0",
      kernelCount: this.kernels.size,
      kernels: Array.from(this.kernels.values()),
    };
  }

  static fromJSON(json) {
    const registry = new KernelRegistry();
    if (json.kernels) {
      for (const entry of json.kernels) {
        registry.register(entry);
      }
    }
    return registry;
  }
}

export const defaultKernelRegistry = new KernelRegistry();

defaultKernelRegistry.register({
  kernelId: "legacy_still_256",
  category: "still",
  backends: ["opencl"],
  qualityTier: "baseline",
  determinismGuarantee: "bit-exact",
  allowedSemantics: ["fp32", "tone-mapped-uint8"],
  maxTileSize: { width: 256, height: 256 },
  conformanceProfile: [
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
  ],
  replayMetadata: {
    inputSchema: "SceneSpec",
    outputSchema: "ProtonRaster",
    deterministic: true,
    seedRequired: true,
  },
  provenanceSchema: {
    required: ["kernelId", "backendId", "tileId", "params", "timestamp", "evidence"],
    tileTracked: true,
  },
  description: "OpenCL legacy still kernel for 256² output, proven bit-exact parity",
});

defaultKernelRegistry.register({
  kernelId: "legacy_still_512",
  category: "still",
  backends: ["opencl"],
  qualityTier: "baseline",
  determinismGuarantee: "bit-exact",
  allowedSemantics: ["fp32", "tone-mapped-uint8"],
  maxTileSize: { width: 512, height: 512 },
  conformanceProfile: [
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
  ],
  replayMetadata: {
    inputSchema: "SceneSpec",
    outputSchema: "ProtonRaster",
    deterministic: true,
    seedRequired: true,
  },
  provenanceSchema: {
    required: ["kernelId", "backendId", "tileId", "params", "timestamp", "evidence"],
    tileTracked: true,
  },
  description: "OpenCL legacy still kernel for 512² output, proven bit-exact parity",
});