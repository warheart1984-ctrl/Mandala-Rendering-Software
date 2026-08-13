/**
 * Axiom Vision — L5 Response Parser.
 *
 * Parses the LLM's JSON response into structured L5 interpretation evidence objects.
 * Validates grounding: every claim must reference at least one feature_id from the evidence graph.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Expected LLM response schema:
 *
 * {
 *   "interpretations": [
 *     {
 *       "claim": "A rectangular object occupies the center of the image.",
 *       "confidence": 0.85,
 *       "grounded_by": ["feat_edg_000001", "feat_con_000005"],
 *       "category": "scene_description"
 *     }
 *   ],
 *   "unverifiable_claims": [
 *     "The object appears to be a window."
 *   ],
 *   "summary": "Brief overall scene description"
 * }
 */

export function parseL5Response(rawResponse, evidenceGraph, metadata = {}) {
  let parsed;

  try {
    parsed = JSON.parse(rawResponse);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1].trim());
    } else {
      // Try to find the first { ... } block
      const braceMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        parsed = JSON.parse(braceMatch[0]);
      } else {
        throw new Error(`L5 parse error: LLM response is not valid JSON (${e.message}). Raw: ${rawResponse.slice(0, 200)}`);
      }
    }
  }

  const validFeatureIds = collectFeatureIds(evidenceGraph);
  const interpretations = [];
  const unverifiable = [];

  if (parsed.interpretations && Array.isArray(parsed.interpretations)) {
    for (const interp of parsed.interpretations) {
      if (!interp.claim || typeof interp.claim !== "string") continue;

      const groundedBy = (interp.grounded_by || []).filter(id => validFeatureIds.has(id));
      const ungroundedRefs = (interp.grounded_by || []).filter(id => !validFeatureIds.has(id));

      if (groundedBy.length === 0 && (interp.grounded_by || []).length > 0) {
        unverifiable.push({
          claim: interp.claim,
          reason: "All grounding references are invalid feature IDs",
          invalid_refs: ungroundedRefs,
        });
        continue;
      }

      const confidence = clamp(interp.confidence ?? 0.5, 0, 1);

      const evidence = buildEvidence({
        level: 5,
        type: "interpretation",
        method: metadata.model || "llm-reasoning",
        method_version: metadata.model_version || "1.0.0",
        parent_features: groundedBy,
        parent_hashes: groundedBy.map(id => findFeatureHash(id, evidenceGraph)).filter(Boolean),
        confidence,
        claim: interp.claim,
        constitutional_tag: "interpretation_not_fact",
        extra: {
          category: interp.category || "other",
          grounded_by: groundedBy,
          ungrounded_refs: ungroundedRefs.length > 0 ? ungroundedRefs : undefined,
          summary: parsed.summary || null,
        },
      });

      interpretations.push(evidence);
    }
  }

  if (parsed.unverifiable_claims && Array.isArray(parsed.unverifiable_claims)) {
    for (const claim of parsed.unverifiable_claims) {
      if (typeof claim === "string") {
        unverifiable.push({ claim, reason: "LLM flagged as unverifiable" });
      } else if (claim && claim.claim) {
        unverifiable.push({
          claim: claim.claim,
          reason: claim.reason || "LLM flagged as unverifiable",
        });
      }
    }
  }

  return {
    interpretations,
    unverifiable,
    summary: parsed.summary || null,
  };
}

function collectFeatureIds(graph) {
  const ids = new Set();
  for (const level of ["L1", "L2", "L3", "L4"]) {
    if (graph[level]) {
      for (const f of graph[level]) {
        if (f.feature_id) ids.add(f.feature_id);
      }
    }
  }
  return ids;
}

function findFeatureHash(featureId, graph) {
  for (const level of ["L1", "L2", "L3", "L4"]) {
    const f = graph[level]?.find(f => f.feature_id === featureId);
    if (f) return f.provenance?.feature_hash;
  }
  return null;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
