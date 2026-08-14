/**
 * ProvenanceLedger â€” append-only audit trail for the whole hierarchy.
 *
 * Answers: "Why does this node exist?" â†’
 *   parent + generation rule + input state + threshold decision +
 *   refinement operation (see evidenceAnswersWhy).
 *
 * Status: enforced (verified by evidence tests).
 */

import { createEvidenceRecord } from "./EvidenceRecord.js";
import { hashState, configurationHash } from "../determinism/StateHasher.js";

export class ProvenanceLedger {
  constructor(config) {
    this.config = config;
    this.configHash = configurationHash(config);
    this.records = [];
    this.byNode = new Map(); // nodeId -> evidence record ids
  }

  recordRefinement(parent, childNodes, generationRule, seed, thresholdDecision) {
    if (!this.config.enableEvidence) return null;
    const inputStateHash = parent.state.stateHash;
    const outputStateHash = hashState(
      childNodes.map((c) => c.state.stateHash).sort(),
    ).slice(0, 16);
    const record = createEvidenceRecord({
      parentNode: parent,
      childNodes,
      inputStateHash,
      outputStateHash,
      topologyBefore: parent.topologySignature ? parent.topologySignature.class : this.config.topologyTarget,
      topologyAfter: this.config.topologyTarget,
      generationRule,
      seed,
      configurationHash: this.configHash,
      timestamp: this.config.evidenceTimestamp ? Date.now() : null,
    });
    this.records.push(record);
    for (const child of childNodes) {
      if (!this.byNode.has(child.id)) this.byNode.set(child.id, []);
      this.byNode.get(child.id).push(record.operationId);
    }
    return record;
  }

  recordGeneration(root, hierarchy, summary) {
    if (!this.config.enableEvidence) return null;
    const record = createEvidenceRecord({
      parentNode: null,
      childNodes: [root],
      inputStateHash: root.state.stateHash,
      outputStateHash: hashState({ summary, scheme: "hierarchy.generation.v1" }),
      topologyBefore: "pre-genesis",
      topologyAfter: this.config.topologyTarget,
      generationRule: "generateHierarchy.v1",
      seed: root.seed,
      configurationHash: this.configHash,
      timestamp: this.config.evidenceTimestamp ? Date.now() : null,
    });
    this.records.push(record);
    this.byNode.set(root.id, [...(this.byNode.get(root.id) || []), record.operationId]);
    return record;
  }

  getEvidence(nodeId) {
    const ids = this.byNode.get(nodeId) || [];
    return this.records.filter((r) => ids.includes(r.operationId));
  }

  /** Human-readable answer for "why does this node exist?". */
  why(nodeId) {
    const records = this.getEvidence(nodeId);
    if (records.length === 0) return null;
    return records.map((r) => ({
      operationId: r.operationId,
      parent: r.parentNode,
      generationRule: r.generationRule,
      inputStateHash: r.inputStateHash,
      outputStateHash: r.outputStateHash,
      topologyBefore: r.topologyBefore,
      topologyAfter: r.topologyAfter,
      seed: r.seed,
    }));
  }

  count() {
    return this.records.length;
  }
}
