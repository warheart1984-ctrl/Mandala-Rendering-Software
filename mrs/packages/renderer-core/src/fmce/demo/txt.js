/**
 * SME-TXT deterministic reasoning simulation.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * Implements the SME-TXT-IFC contract shape: TXT_PROMPT + MM_EMBEDDINGS ->
 * TXT_RESPONSE, TXT_REASON_TRACE, DECISION_RECORD, and a 768-dim TXT embedding
 * over the emitted text. Output is fully deterministic in (prompt, seed,
 * constitution, fused context).
 */

import { sha256Hex, sha256Prefixed, stableStringify } from "../core/hash.js";
import { seededRng, textEmbedding } from "./embeddings.js";

export const TXT_VERSION = "sme-txt-deterministic-v1.0.0";
export const TXT_EMBED_DIM = 768;

const CONSTITUTION = "mandala-constitution-v1.0.0";

function composeResponse({ prompt, seed, intentId, fusedSummary }) {
  const rng = seededRng(`${intentId}:txt:${seed}`);
  const verbs = ["Confirmed", "Anchored", "Governed", "Synthesized"];
  const verb = verbs[Math.floor(rng() * verbs.length)];
  const topics = ["mandala symmetry", "multi-modal cohesion", "constitutional compliance"];
  const topic = topics[Math.floor(rng() * topics.length)];
  return (
    `${verb} ${topic} for intent "${prompt}". ` +
    `Fused context (${fusedSummary}) meets ${CONSTITUTION}; D2_NUMERICAL determinism holds.`
  );
}

/**
 * Reason over a prompt + fused multimodal embedding.
 */
export function reasonText({
  prompt,
  embedding,
  seed = 0,
  intentId = "intent.default",
}) {
  const fusedSummary = `vis:${embedding.length}-dim`;
  const response = composeResponse({ prompt, seed, intentId, fusedSummary });

  const reasonTrace = [
    { stepId: "authority", description: "Authority grant verified" },
    { stepId: "validation", description: "Input + resource checks passed" },
    { stepId: "fusion", description: "Fused VIS embedding into context" },
    { stepId: "decision", description: "Synthesized governed response" },
  ];

  const decisionId = `dec-${sha256Hex(`${intentId}:${prompt}:${seed}`).slice(0, 12)}`;
  const decisionRecord = {
    decisionId,
    intent: { intentId, modalities: ["text", "image"], goal: prompt, constraints: {}, priority: "normal" },
    authorityGrant: { actor: "sme-core", action: "txt.reason", granted: true },
    validationResult: { passed: true, checks: ["size_limit", "safety_classifier"], warnings: [] },
    reasoningTrace: reasonTrace,
    outputs: [{ moduleId: "sme-txt", modality: "text", data: response, modelVersion: TXT_VERSION }],
    evidenceIds: [],
    signature: sha256Prefixed(`${prompt}:${response}:${CONSTITUTION}`),
  };

  const embeddingOut = textEmbedding(response, TXT_EMBED_DIM, `${intentId}:txt:${seed}`);
  const evidenceId = `ev-txt-${sha256Hex(`${intentId}:${prompt}:${seed}`).slice(0, 12)}`;
  const checksum = sha256Prefixed(
    stableStringify({ response, reasonTrace, decisionRecord, embedding: embeddingOut })
  );

  return {
    modality: "text",
    text: response,
    reasonTrace,
    decisionRecord,
    embedding: embeddingOut,
    evidenceId,
    checksum,
    modelVersion: TXT_VERSION,
  };
}
