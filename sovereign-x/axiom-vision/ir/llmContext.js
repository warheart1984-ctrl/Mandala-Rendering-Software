/**
 * Axiom Vision — LLM Context Extractor.
 *
 * Converts the Vision IR evidence graph into a structured, groundable
 * context object suitable for LLM prompt injection.
 *
 * The LLM receives only the evidence — not raw pixels.
 * Every claim the LLM makes can be traced back to a feature_hash.
 */

/**
 * Extract structured LLM context from a Vision IR.
 *
 * @param {Object} visionIR - Output of buildVisionIR()
 * @param {Object} [options]
 * @param {number} [options.maxObservations=50] - Max L1 features to include
 * @param {number} [options.maxDetections=20] - Max L3 detections to include
 * @param {boolean} [options.includeLineage=true] - Include provenance refs
 * @returns {Object} Structured context for LLM prompt
 */
export function evidenceToLLMContext(visionIR, options = {}) {
  const { maxObservations = 50, maxDetections = 20, includeLineage = true } = options;
  const graph = visionIR.evidence_graph;

  const ctx = {
    scene_summary: {
      image_dimensions: `${visionIR.L0.width}×${visionIR.L0.height}`,
      image_hash: visionIR.L0.image_hash,
      total_observations: (graph.L1?.length || 0) + (graph.L2?.length || 0),
      total_detections: graph.L3?.length || 0,
      total_relations: graph.L4?.length || 0,
      total_interpretations: graph.L5?.length || 0,
      deterministic_observation_count: graph.L1?.filter(f => f.confidence === 1.0).length || 0,
    },

    observations: [],  // L1
    geometry: [],       // L2
    detections: [],     // L3
    relations: [],      // L4
    interpretations: [], // L5

    provenance: {
      pipeline_version: visionIR.version,
      lineage_root: visionIR.lineage_root,
      levels: 5,
      deterministic_levels: "0-2",
      learned_levels: "3-4",
      interpretation_level: 5,
      constitutional_boundary: "OBSERVATION ≠ INTERPRETATION",
      full_evidence_available: true,
      replay_supported: true,
    },
  };

  // Level 1: Primitives (edges, histograms, gradients)
  if (graph.L1) {
    const l1 = graph.L1.slice(0, maxObservations);
    for (const f of l1) {
      const obs = {
        id: f.feature_id,
        type: f.type,
      };
      if (f.geometry) obs.geometry = f.geometry;
      if (f.magnitude != null) obs.magnitude = f.magnitude;
      if (f.direction_degrees != null) obs.direction_degrees = f.direction_degrees;
      if (f.confidence != null) obs.confidence = f.confidence;
      if (f.tile != null) obs.tile = f.tile;
      if (includeLineage) obs.feature_hash = f.provenance?.feature_hash;
      ctx.observations.push(obs);
    }
  }

  // Level 2: Geometry (contours, regions)
  if (graph.L2) {
    for (const f of graph.L2) {
      const geom = {
        id: f.feature_id,
        type: f.type,
        area: f.area,
      };
      if (f.geometry?.bounding_box) geom.bounding_box = f.geometry.bounding_box;
      if (f.perimeter != null) geom.perimeter = f.perimeter;
      if (f.closed != null) geom.closed = f.closed;
      if (f.centroid) geom.centroid = f.centroid;
      if (f.confidence != null) geom.confidence = f.confidence;
      if (includeLineage) geom.feature_hash = f.provenance?.feature_hash;
      ctx.geometry.push(geom);
    }
  }

  // Level 3: Detections
  if (graph.L3) {
    const l3 = graph.L3.slice(0, maxDetections);
    for (const f of l3) {
      const det = {
        id: f.feature_id,
        label: f.label,
        confidence: f.confidence,
      };
      if (f.geometry?.bounding_box) det.bounding_box = f.geometry.bounding_box;
      if (f.model_evidence) {
        det.model = f.model_evidence.model_name;
        det.model_checksum = f.model_evidence.checksum_sha256?.slice(0, 16);
      }
      if (includeLineage) det.feature_hash = f.provenance?.feature_hash;
      ctx.detections.push(det);
    }
  }

  // Level 4: Relations
  if (graph.L4) {
    for (const f of graph.L4) {
      const rel = {
        id: f.feature_id,
        subject: f.subject,
        relation: f.relation,
        object: f.object,
        confidence: f.confidence,
      };
      if (includeLineage) rel.feature_hash = f.provenance?.feature_hash;
      ctx.relations.push(rel);
    }
  }

  // Level 5: Interpretations (if present)
  if (graph.L5) {
    for (const f of graph.L5) {
      const interp = {
        id: f.feature_id,
        claim: f.claim,
        confidence: f.confidence,
        grounded_by: f.grounded_by || [],
        constitutional_tag: f.constitutional_tag,
      };
      ctx.interpretations.push(interp);
    }
  }

  return ctx;
}

/**
 * Generate the system prompt instructions for the LLM.
 * This tells the LLM how to reason over the evidence.
 *
 * @returns {string} System prompt section
 */
export function llmSystemPrompt() {
  return `You are analyzing visual data through a constitutional vision pipeline.

## Rules
1. Ground ALL claims in the observations, detections, and relations provided.
2. If a claim cannot be grounded in evidence, say so explicitly with "No evidence for: <claim>".
3. Distinguish between what was MEASURED (confidence=1.0, deterministic algorithms) and what was INFERRED (confidence<1.0, learned models).
4. Do not invent objects, relationships, or attributes not present in the evidence.
5. Every observation and detection has a feature_hash. Reference these when making claims for traceability.
6. Interpretations (L5) are explicitly tagged as "interpretation_not_fact" — they are probabilistic, not measurements.

## Evidence Structure
- observations (L1): Direct pixel-level measurements (edges, gradients, colors). Always confidence=1.0.
- geometry (L2): Derived spatial structures (contours, regions). Deterministic from L1.
- detections (L3): Object detections from learned models. confidence<1.0, model checksum provided.
- relations (L4): Spatial relationships between detections. Derived from geometry.
- interpretations (L5): LLM-level semantic claims. Tagged as interpretation_not_fact.
`;
}
