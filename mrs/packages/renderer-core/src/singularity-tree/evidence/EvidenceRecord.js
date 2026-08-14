/**
 * EvidenceRecord — auditable record of one generative operation.
 *
 * EvidenceRecord {
 *   operationId, parentNode, childNodes, inputStateHash, outputStateHash,
 *   topologyBefore, topologyAfter, generationRule, seed, configurationHash,
 *   timestamp
 * }
 *
 * timestamp is null by default so generation stays fully replayable
 * (config.evidenceTimestamp enables wall-clock stamps when auditability
 * requires them).
 *
 * Status: enforced (verified by evidence tests).
 */

import { hashState } from "../determinism/StateHasher.js";

let operationCounter = 0;

export function createEvidenceRecord({
  parentNode,
  childNodes,
  inputStateHash,
  outputStateHash,
  topologyBefore,
  topologyAfter,
  generationRule,
  seed,
  configurationHash,
  timestamp = null,
}) {
  operationCounter += 1;
  const operationId = `ev-${hashState({
    counter: operationCounter,
    parent: parentNode ? parentNode.id : "root",
    rule: generationRule,
    seed,
  }).slice(0, 16)}`;

  return Object.freeze({
    operationId,
    parentNode: parentNode ? parentNode.id : null,
    childNodes: Object.freeze(childNodes.map((c) => c.id)),
    inputStateHash,
    outputStateHash,
    topologyBefore,
    topologyAfter,
    generationRule,
    seed: seed >>> 0,
    configurationHash,
    timestamp,
  });
}

export function evidenceAnswersWhy(record) {
  return {
    parent: record.parentNode,
    generationRule: record.generationRule,
    inputStateHash: record.inputStateHash,
    outputStateHash: record.outputStateHash,
    seed: record.seed,
    topologyBefore: record.topologyBefore,
    topologyAfter: record.topologyAfter,
  };
}