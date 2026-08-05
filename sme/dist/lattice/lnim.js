/**
 * Lattice Node Identity Map (LNIM).
 * Canonical identities for all lattice nodes and their constitutional roles.
 *
 * Identity Invariants:
 *   - Stability: nodeId must not change across deployments.
 *   - Uniqueness: no two nodes share the same nodeId.
 *   - Scope integrity: nodes may not act outside their declared authorityScope.
 *   - Capability integrity: nodes may not perform actions not listed in capabilities.
 */

const NODE_TYPES = ['substrate', 'orchestrator', 'ledger', 'gate', 'external'];

const CANONICAL_NODES = [
  {
    nodeId: 'sme-txt',
    nodeType: 'substrate',
    capabilities: ['generate_text', 'complete', 'summarize', 'query_knowledge'],
    authorityScope: 'text-only',
    evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
    replayProfile: { mode: 'seed-and-input', fields: ['seed', 'parameters', 'inputs'] },
  },
  {
    nodeId: 'sme-vis',
    nodeType: 'substrate',
    capabilities: ['classify', 'encode'],
    authorityScope: 'vision-only',
    evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
    replayProfile: { mode: 'input-and-model', fields: ['inputs', 'modelVersion'] },
  },
  {
    nodeId: 'sme-aud',
    nodeType: 'substrate',
    capabilities: ['transcribe', 'encode'],
    authorityScope: 'audio-only',
    evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
    replayProfile: { mode: 'input-and-model', fields: ['inputs', 'modelVersion'] },
  },
  {
    nodeId: 'sme-gen',
    nodeType: 'substrate',
    capabilities: ['generate_image', 'generate_audio', 'generate_video'],
    authorityScope: 'generation-only',
    evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
    replayProfile: { mode: 'seed-and-input', fields: ['seed', 'parameters', 'inputs'] },
  },
  {
    nodeId: 'sme-vid',
    nodeType: 'substrate',
    capabilities: ['analyze', 'transcode', 'extract_audio', 'trim'],
    authorityScope: 'video-only',
    evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
    replayProfile: { mode: 'input-and-model', fields: ['inputs', 'modelVersion'] },
  },
  {
    nodeId: 'sme-core',
    nodeType: 'orchestrator',
    capabilities: ['execute', 'plan', 'route'],
    authorityScope: 'spine-routing',
    evidenceProfile: { required: ['authority', 'decision', 'replay'], optional: ['audit'] },
    replayProfile: { mode: 'lawbook-chain', fields: ['lawbookChain', 'inputs'] },
  },
  {
    nodeId: 'sme-log',
    nodeType: 'ledger',
    capabilities: ['record', 'replay', 'audit'],
    authorityScope: 'evidence-store',
    evidenceProfile: { required: ['audit', 'replay'], optional: [] },
    replayProfile: { mode: 'append-only-ledger', fields: ['sequence', 'merkleRoot'] },
  },
  {
    nodeId: 'constitutional-gate',
    nodeType: 'gate',
    capabilities: ['measure', 'enforce', 'admit', 'refuse'],
    authorityScope: 'spine-routing',
    evidenceProfile: { required: ['authority', 'validation', 'decision'], optional: ['audit'] },
    replayProfile: { mode: 'lawbook-chain', fields: ['lawbookChain', 'snapshot'] },
  },
];

class NodeIdentityMap {
  constructor(nodes = CANONICAL_NODES) {
    this.nodes = new Map();
    this.registerMany(nodes);
  }

  register(node) {
    if (!node || typeof node.nodeId !== 'string' || node.nodeId.trim() === '') {
      throw new Error('LNIM registration requires a non-empty nodeId');
    }
    if (this.nodes.has(node.nodeId)) {
      throw new Error(`LNIM uniqueness violation: nodeId '${node.nodeId}' already registered`);
    }
    if (!NODE_TYPES.includes(node.nodeType)) {
      throw new Error(`LNIM nodeType '${node.nodeType}' not in allowed set: ${NODE_TYPES.join(', ')}`);
    }
    if (!Array.isArray(node.capabilities) || node.capabilities.length === 0) {
      throw new Error(`LNIM node '${node.nodeId}' requires non-empty capabilities`);
    }
    this.nodes.set(node.nodeId, Object.freeze({ ...node }));
    return node;
  }

  registerMany(nodes) {
    for (const node of nodes) { this.register(node); }
  }

  get(nodeId) { return this.nodes.get(nodeId) ?? null; }

  list() { return [...this.nodes.values()]; }

  has(nodeId) { return this.nodes.has(nodeId); }

  /**
   * Capability integrity: node may not perform actions not listed in capabilities.
   */
  assertCapability(nodeId, action) {
    const node = this.get(nodeId);
    if (!node) {
      return { ok: false, violation: 'node_unknown', message: `node '${nodeId}' not in identity map` };
    }
    if (!node.capabilities.includes(action)) {
      return {
        ok: false,
        violation: 'capability_integrity',
        message: `node '${nodeId}' does not declare capability '${action}' (capabilities: ${node.capabilities.join(', ')})`,
      };
    }
    return { ok: true, node };
  }

  /**
   * Scope integrity: node may not act outside its declared authorityScope.
   */
  assertScope(nodeId, requestedScope) {
    const node = this.get(nodeId);
    if (!node) {
      return { ok: false, violation: 'node_unknown', message: `node '${nodeId}' not in identity map` };
    }
    if (requestedScope && node.authorityScope !== requestedScope && requestedScope !== 'any') {
      return {
        ok: false,
        violation: 'scope_integrity',
        message: `node '${nodeId}' scope '${node.authorityScope}' does not match requested '${requestedScope}'`,
      };
    }
    return { ok: true, node };
  }

  /**
   * Full identity validation for a routed call.
   */
  validateCall({ originNodeId, targetNodeId, action, requestedScope }) {
    if (!originNodeId || !this.has(originNodeId)) {
      return { ok: false, violation: 'origin_unknown', message: `origin '${originNodeId}' not in identity map` };
    }
    if (!targetNodeId || !this.has(targetNodeId)) {
      return { ok: false, violation: 'target_unknown', message: `target '${targetNodeId}' not in identity map` };
    }
    const targetCheck = this.assertCapability(targetNodeId, action);
    if (!targetCheck.ok) { return targetCheck; }
    const scopeCheck = this.assertScope(targetNodeId, requestedScope);
    if (!scopeCheck.ok) { return scopeCheck; }
    return { ok: true, origin: this.get(originNodeId), target: this.get(targetNodeId) };
  }
}

module.exports = {
  NodeIdentityMap,
  CANONICAL_NODES,
  NODE_TYPES,
};
