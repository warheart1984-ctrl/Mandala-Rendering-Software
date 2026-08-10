// mrs/narrative/provenance-chain.js
// Provenance Chain - genome → render → evidence → replay (NFC invariant)

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export class ProvenanceChain {
  constructor(options = {}) {
    this.ledger = options.ledger; // CIEMS DurableContinuityLedger
    this.evidenceService = options.evidenceService;
    this.storage = new Map(); // chainId -> ProvenanceChain
  }

  /**
   * Create a new provenance chain for a narrative render
   * @param {object} params - Chain initialization params
   * @returns {Promise<string>} Chain ID
   */
  async createChain(params) {
    const { 
      blueprintId, 
      chapterId, 
      beatIndex, 
      narrativeDNA, 
      selectedGenotype,
      humanSelection = null 
    } = params;

    const chainId = `prov-${uuidv4()}`;
    const now = new Date().toISOString();

    const chain = {
      id: chainId,
      blueprintId,
      chapterId,
      beatIndex,
      
      // Genesis block
      genesis: {
        id: `gen-${uuidv4()}`,
        type: 'GENESIS',
        timestamp: now,
        narrativeDNA: this.hashNarrativeDNA(narrativeDNA),
        blueprintHash: this.hashObject(narrativeDNA),
        genotypeId: selectedGenotype.id,
        genotypeHash: this.hashObject(selectedGenotype),
        humanSelection: humanSelection ? {
          selected: true,
          selectorId: humanSelection.selectorId,
          reason: humanSelection.reason,
          alternatives: humanSelection.alternatives?.map(a => a.genotypeId) || [],
        } : { selected: false },
      },
      
      // Render blocks
      renders: [],
      
      // Evidence blocks
      evidence: [],
      
      // Selection blocks (for contact sheet choices)
      selections: [],
      
      // Current head
      head: null,
      
      // Merkle tree
      merkleRoot: null,
      
      // Metadata
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // Compute initial merkle root
    chain.merkleRoot = this.computeMerkleRoot([chain.genesis]);
    chain.head = chain.genesis.id;

    this.storage.set(chainId, chain);

    // Persist to CIEMS ledger if available
    if (this.ledger) {
      await this.ledger.append({
        type: 'PROVENANCE_CHAIN_CREATED',
        chainId,
        genesis: chain.genesis,
        merkleRoot: chain.merkleRoot,
        timestamp: now,
      });
    }

    return chainId;
  }

  /**
   * Add a render block to the chain
   */
  async addRenderBlock(chainId, renderData) {
    const chain = this.storage.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);

    const block = {
      id: `render-${uuidv4()}`,
      type: 'RENDER',
      timestamp: new Date().toISOString(),
      previousHash: chain.head,
      
      genotypeId: renderData.genotypeId,
      genotypeHash: renderData.genotypeHash,
      
      renderRequest: {
        scene: renderData.scene,
        renderParams: renderData.renderParams,
        identity: renderData.identity,
      },
      
      renderResult: {
        artifactId: renderData.artifactId,
        artifactHash: renderData.artifactHash,
        format: renderData.format,
        resolution: renderData.resolution,
        duration: renderData.duration,
        frameCount: renderData.frameCount,
      },
      
      conformance: {
        reportRef: renderData.conformanceReportRef,
        passed: renderData.conformancePassed,
        checks: renderData.conformanceChecks || [],
      },
      
      governance: {
        contractId: renderData.governanceContractId,
        authorityChain: renderData.authorityChain,
        allowed: renderData.governanceAllowed,
      },
      
      // Narrative evaluation
      narrativeScores: renderData.narrativeScores || {},
      
      // Efficiency metrics
      efficiency: renderData.efficiency || {},
      
      // Evidence reference
      evidenceRef: renderData.evidenceRef,
    };

    // Hash the block
    block.hash = this.hashObject(block);
    
    chain.renders.push(block);
    chain.evidence.push({
      id: `ev-${uuidv4()}`,
      type: 'RENDER_EVIDENCE',
      timestamp: new Date().toISOString(),
      renderBlockId: block.id,
      evidenceRef: renderData.evidenceRef,
      merkleProof: this.generateMerkleProof(chain, block.id),
    });
    
    chain.head = block.id;
    chain.merkleRoot = this.computeMerkleRoot([chain.genesis, ...chain.renders]);
    chain.updatedAt = new Date().toISOString();
    chain.version++;

    // Persist
    if (this.ledger) {
      await this.ledger.append({
        type: 'RENDER_BLOCK_ADDED',
        chainId,
        blockId: block.id,
        blockHash: block.hash,
        merkleRoot: chain.merkleRoot,
        timestamp: block.timestamp,
      });
    }

    return block.id;
  }

  /**
   * Add a selection block (human choice from contact sheet)
   */
  async addSelectionBlock(chainId, selectionData) {
    const chain = this.storage.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);

    const block = {
      id: `selection-${uuidv4()}`,
      type: 'SELECTION',
      timestamp: new Date().toISOString(),
      previousHash: chain.head,
      
      beatIndex: selectionData.beatIndex,
      selectedRenderId: selectionData.selectedRenderId,
      selectedGenotypeId: selectionData.selectedGenotypeId,
      
      // All alternatives presented
      alternatives: selectionData.alternatives.map(a => ({
        renderId: a.renderId,
        genotypeId: a.genotypeId,
        scores: a.scores,
        thumbnail: a.thumbnail,
      })),
      
      // Human decision
      humanDecision: {
        selectorId: selectionData.selectorId,
        reason: selectionData.reason,
        confidence: selectionData.confidence,
        timestamp: new Date().toISOString(),
      },
      
      // Continuity weighting
      continuityWeight: selectionData.continuityWeight || 0.7,
      
      // Narrative justification
      narrativeJustification: selectionData.narrativeJustification,
    };

    block.hash = this.hashObject(block);
    
    chain.selections.push(block);
    chain.evidence.push({
      id: `ev-${uuidv4()}`,
      type: 'SELECTION_EVIDENCE',
      timestamp: new Date().toISOString(),
      selectionBlockId: block.id,
      merkleProof: this.generateMerkleProof(chain, block.id),
    });
    
    chain.head = block.id;
    chain.merkleRoot = this.computeMerkleRoot([chain.genesis, ...chain.renders, ...chain.selections]);
    chain.updatedAt = new Date().toISOString();
    chain.version++;

    if (this.ledger) {
      await this.ledger.append({
        type: 'SELECTION_BLOCK_ADDED',
        chainId,
        blockId: block.id,
        blockHash: block.hash,
        merkleRoot: chain.merkleRoot,
        timestamp: block.timestamp,
      });
    }

    return block.id;
  }

  /**
   * Add evidence block (general)
   */
  async addEvidenceBlock(chainId, evidenceData) {
    const chain = this.storage.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);

    const block = {
      id: `evidence-${uuidv4()}`,
      type: 'EVIDENCE',
      timestamp: new Date().toISOString(),
      previousHash: chain.head,
      
      evidenceType: evidenceData.type, // CONFORMANCE, GOVERNANCE, NARRATIVE, TECHNICAL
      evidenceRef: evidenceData.evidenceRef,
      payload: evidenceData.payload,
      
      hash: null,
    };

    block.hash = this.hashObject(block);
    
    chain.evidence.push(block);
    chain.head = block.id;
    chain.merkleRoot = this.computeMerkleRoot([chain.genesis, ...chain.renders, ...chain.selections, ...chain.evidence]);
    chain.updatedAt = new Date().toISOString();
    chain.version++;

    return block.id;
  }

  /**
   * Get full chain for replay
   */
  async getChain(chainId) {
    const chain = this.storage.get(chainId);
    if (!chain) return null;
    
    return {
      ...chain,
      // Verify integrity
      integrity: this.verifyChain(chain),
    };
  }

  /**
   * Replay chain - reconstruct all decisions
   */
  async replayChain(chainId) {
    const chain = await this.getChain(chainId);
    if (!chain) return null;

    const replay = {
      chainId: chain.id,
      blueprintId: chain.blueprintId,
      chapterId: chain.chapterId,
      beatIndex: chain.beatIndex,
      
      // Genesis
      genesis: chain.genesis,
      
      // Timeline of events
      timeline: [
        { type: 'GENESIS', timestamp: chain.genesis.timestamp, data: chain.genesis },
        ...chain.renders.map(r => ({ type: 'RENDER', timestamp: r.timestamp, data: r })),
        ...chain.selections.map(s => ({ type: 'SELECTION', timestamp: s.timestamp, data: s })),
        ...chain.evidence.map(e => ({ type: 'EVIDENCE', timestamp: e.timestamp, data: e })),
      ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
      
      // Final state
      finalMerkleRoot: chain.merkleRoot,
      finalHead: chain.head,
      
      // Statistics
      stats: {
        totalRenders: chain.renders.length,
        totalSelections: chain.selections.length,
        totalEvidence: chain.evidence.length,
        uniqueGenotypes: new Set(chain.renders.map(r => r.genotypeId)).size,
      },
    };

    return replay;
  }

  /**
   * Verify chain integrity
   */
  verifyChain(chain) {
    const blocks = [chain.genesis, ...chain.renders, ...chain.selections, ...chain.evidence];
    
    let previousHash = null;
    let valid = true;
    const errors = [];

    for (const block of blocks) {
      // Check hash
      const computedHash = this.hashObject(block);
      if (block.hash !== computedHash) {
        valid = false;
        errors.push(`Hash mismatch for block ${block.id}`);
      }

      // Check link
      if (previousHash && block.previousHash !== previousHash) {
        valid = false;
        errors.push(`Chain link broken at block ${block.id}`);
      }

      previousHash = block.hash;
    }

    // Check merkle root
    const computedRoot = this.computeMerkleRoot([chain.genesis, ...chain.renders, ...chain.selections, ...chain.evidence]);
    if (computedRoot !== chain.merkleRoot) {
      valid = false;
      errors.push('Merkle root mismatch');
    }

    return { valid, errors, blockCount: blocks.length };
  }

  /**
   * Generate Merkle proof for a block
   */
  generateMerkleProof(chain, targetBlockId) {
    const blocks = [chain.genesis, ...chain.renders, ...chain.selections, ...chain.evidence];
    const targetIndex = blocks.findIndex(b => b.id === targetBlockId);
    
    if (targetIndex === -1) return null;

    // Simplified: return sibling hashes up to root
    const proof = [];
    let index = targetIndex;
    let levelBlocks = blocks.map(b => b.hash);

    while (levelBlocks.length > 1) {
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;
      
      if (siblingIndex < levelBlocks.length) {
        proof.push({
          position: isRight ? 'left' : 'right',
          hash: levelBlocks[siblingIndex],
        });
      }

      index = Math.floor(index / 2);
      levelBlocks = this.hashLevel(levelBlocks);
    }

    return { targetHash: blocks[targetIndex].hash, proof };
  }

  /**
   * Hash a level of the Merkle tree
   */
  hashLevel(hashes) {
    const next = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || hashes[i]; // duplicate if odd
      next.push(createHash('sha256').update(left + right).digest('hex'));
    }
    return next;
  }

  /**
   * Compute Merkle root from blocks
   */
  computeMerkleRoot(blocks) {
    if (!blocks.length) return 'empty';
    
    let level = blocks.map(b => b.hash || this.hashObject(b));
    
    while (level.length > 1) {
      level = this.hashLevel(level);
    }
    
    return level[0];
  }

  /**
   * Hash an object
   */
  hashObject(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Hash narrative DNA for genesis
   */
  hashNarrativeDNA(narrativeDNA) {
    // Extract key identifying features
    const keyFeatures = {
      title: narrativeDNA.metadata?.title,
      author: narrativeDNA.metadata?.author,
      beatCount: narrativeDNA.structure?.beats?.length,
      themes: narrativeDNA.semantics?.themes?.map(t => t.theme).sort(),
      symbols: narrativeDNA.semantics?.symbols?.sort(),
      emotionalArcHash: narrativeDNA.emotionalArc?.turningPoints?.map(t => t.type).join(','),
    };
    return this.hashObject(keyFeatures);
  }

  /**
   * Export chain for archival
   */
  async exportChain(chainId) {
    const chain = await this.getChain(chainId);
    if (!chain) return null;

    return {
      ...chain,
      exportFormat: 'PROVENANCE_CHAIN_V1',
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import chain from archive
   */
  async importChain(chainData) {
    if (chainData.exportFormat !== 'PROVENANCE_CHAIN_V1') {
      throw new Error('Invalid export format');
    }

    // Verify integrity before importing
    const verification = this.verifyChain(chainData);
    if (!verification.valid) {
      throw new Error(`Chain integrity check failed: ${verification.errors.join(', ')}`);
    }

    this.storage.set(chainData.id, chainData);
    return chainData.id;
  }

  /**
   * Query chains by blueprint
   */
  async getChainsByBlueprint(blueprintId) {
    const chains = [];
    for (const [id, chain] of this.storage.entries()) {
      if (chain.blueprintId === blueprintId) {
        chains.push({ id: chain.id, chapterId: chain.chapterId, beatIndex: chain.beatIndex, createdAt: chain.createdAt });
      }
    }
    return chains;
  }

  /**
   * Get chain statistics
   */
  async getChainStats(chainId) {
    const chain = this.storage.get(chainId);
    if (!chain) return null;

    const renderCount = chain.renders.length;
    const selectionCount = chain.selections.length;
    const evidenceCount = chain.evidence.length;
    
    const uniqueGenotypes = new Set(chain.renders.map(r => r.genotypeId)).size;
    const totalDuration = chain.renders.reduce((sum, r) => sum + (r.renderResult?.duration || 0), 0);
    
    return {
      chainId: chain.id,
      renderCount,
      selectionCount,
      evidenceCount,
      uniqueGenotypes,
      totalDuration,
      merkleRoot: chain.merkleRoot,
      version: chain.version,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
    };
  }
}

export default ProvenanceChain;