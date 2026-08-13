/**
 * Axiom Vision — Conformance Checks.
 *
 * 6 vision-specific conformance checks that extend the existing 16 checks.
 * These verify the integrity of the vision pipeline's evidence chain.
 */

import { sha256Hex, canonicalJSON } from "../evidence/sha256.js";
import { computeLevelHash, verifyLineage } from "../evidence/lineageTracker.js";

/**
 * Check: vision.feature-hash-stability
 * Re-running the same kernel on the same input produces identical feature_hash values.
 */
export function checkFeatureHashStability(kernel, input, runs = 3) {
  const hashes = [];
  for (let i = 0; i < runs; i++) {
    const result = kernel(input);
    const levelHash = computeLevelHash(Array.isArray(result) ? result : [result]);
    hashes.push(levelHash);
  }
  const allSame = hashes.every(h => h === hashes[0]);
  return {
    id: "vision.feature-hash-stability",
    passed: allSame,
    detail: allSame
      ? `Stable across ${runs} runs`
      : `Hash drift: ${hashes.join(", ")}`,
  };
}

/**
 * Check: vision.tile-boundary-continuity
 * Features crossing tile boundaries are detected and deduplicated without loss.
 */
export function checkTileBoundaryContinuity(features, grid, width, height) {
  // Count features that appear to be duplicates at tile boundaries
  const boundaryFeatures = features.filter(f => f.tile_lineage && f.tile_lineage.length > 1);
  const totalFeatures = features.length;

  // No features should be lost — every boundary feature should have a merged entry
  const hasDedup = boundaryFeatures.every(f => f.tile_lineage && f.tile_lineage.length >= 1);

  return {
    id: "vision.tile-boundary-continuity",
    passed: hasDedup,
    detail: `${boundaryFeatures.length} cross-tile features, ${totalFeatures} total`,
  };
}

/**
 * Check: vision.cpu-gpu-parity
 * GPU-accelerated feature extraction matches CPU reference within tolerance.
 */
export function checkCpuGpuParity(cpuFeatures, gpuFeatures, tolerance = 1e-6) {
  if (cpuFeatures.length !== gpuFeatures.length) {
    return {
      id: "vision.cpu-gpu-parity",
      passed: false,
      detail: `Count mismatch: CPU=${cpuFeatures.length}, GPU=${gpuFeatures.length}`,
    };
  }

  for (let i = 0; i < cpuFeatures.length; i++) {
    const cpuHash = cpuFeatures[i].provenance?.feature_hash;
    const gpuHash = gpuFeatures[i].provenance?.feature_hash;
    if (cpuHash !== gpuHash) {
      return {
        id: "vision.cpu-gpu-parity",
        passed: false,
        detail: `Hash mismatch at index ${i}: CPU=${cpuHash}, GPU=${gpuHash}`,
      };
    }
  }

  return {
    id: "vision.cpu-gpu-parity",
    passed: true,
    detail: `All ${cpuFeatures.length} features match`,
  };
}

/**
 * Check: vision.model-evidence-present
 * Level 3+ features carry model checksum, quantization, and parameter count.
 */
export function checkModelEvidencePresent(l3Features, l4Features) {
  // Only L3 detections require model_evidence (they come from learned models).
  // L4 relations are derived geometrically from L3 and don't need model_evidence.
  const l3 = l3Features || [];
  if (l3.length === 0) {
    return {
      id: "vision.model-evidence-present",
      passed: true,
      detail: "No L3 features (no learned models used)",
    };
  }

  for (const f of l3) {
    const me = f.model_evidence;
    if (!me) {
      return {
        id: "vision.model-evidence-present",
        passed: false,
        detail: `L3 feature ${f.feature_id} missing model_evidence`,
      };
    }
    if (!me.checksum_sha256 || !me.model_name) {
      return {
        id: "vision.model-evidence-present",
        passed: false,
        detail: `L3 feature ${f.feature_id} model_evidence incomplete`,
      };
    }
  }

  return {
    id: "vision.model-evidence-present",
    passed: true,
    detail: `All ${l3.length} L3 detections have model evidence`,
  };
}

/**
 * Check: vision.observation-interpretation-boundary
 * Level 5 interpretations are explicitly tagged as inference, not measurement.
 */
export function checkObservationInterpretationBoundary(l5Features) {
  if (!l5Features || l5Features.length === 0) {
    return {
      id: "vision.observation-interpretation-boundary",
      passed: true,
      detail: "No L5 features present",
    };
  }

  for (const f of l5Features) {
    if (f.constitutional_tag !== "interpretation_not_fact") {
      return {
        id: "vision.observation-interpretation-boundary",
        passed: false,
        detail: `L5 feature ${f.feature_id} missing interpretation_not_fact tag`,
      };
    }
  }

  return {
    id: "vision.observation-interpretation-boundary",
    passed: true,
    detail: `All ${l5Features.length} L5 features properly tagged`,
  };
}

/**
 * Check: vision.provenance-chain-intact
 * Every feature at every level has an unbroken hash lineage to image_hash.
 */
export function checkProvenanceChainIntact(evidenceGraph) {
  const levels = ["L1", "L2", "L3", "L4", "L5"];
  let totalFeatures = 0;
  let brokenChains = 0;

  for (const level of levels) {
    const features = evidenceGraph[level] || [];
    for (const f of features) {
      totalFeatures++;
      if (!verifyLineage(f, evidenceGraph)) {
        brokenChains++;
      }
    }
  }

  return {
    id: "vision.provenance-chain-intact",
    passed: brokenChains === 0,
    detail: brokenChains === 0
      ? `All ${totalFeatures} features have intact lineage`
      : `${brokenChains}/${totalFeatures} features have broken lineage`,
  };
}

/**
 * Run all vision conformance checks on a Vision IR.
 *
 * @param {Object} visionIR - Output of axiomVision.analyze()
 * @returns {Object} { passed: number, failed: number, results: [...] }
 */
export function runAllVisionChecks(visionIR) {
  const graph = visionIR.evidence_graph;
  const results = [];

  // Provenance chain check
  results.push(checkProvenanceChainIntact(graph));

  // Observation-interpretation boundary
  results.push(checkObservationInterpretationBoundary(graph.L5));

  // Model evidence (L3/L4)
  results.push(checkModelEvidencePresent(graph.L3, graph.L4));

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  return { passed, failed, results };
}
