/**
 * State Hash Tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashStateFields,
  hashStateProposal,
  hashRenderArtifact,
  verifyStateHash,
  createStateId,
  shortHash
} from './state-hash.js';

describe('StateHash', () => {
  it('hashes state fields deterministically', () => {
    const fields = {
      lattice: { topology: 'tesseract' },
      conserved_quantities: { energy: 100 }
    };
    
    const hash1 = hashStateFields(fields);
    const hash2 = hashStateFields(fields);
    
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });
  
  it('produces different hashes for different fields', () => {
    const fields1 = { lattice: { topology: 'tesseract' } };
    const fields2 = { lattice: { topology: 'moebius' } };
    
    const hash1 = hashStateFields(fields1);
    const hash2 = hashStateFields(fields2);
    
    assert.notEqual(hash1, hash2);
  });
  
  it('hashes state proposal consistently', () => {
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 }
    };
    
    const hash1 = hashStateProposal(proposal);
    const hash2 = hashStateProposal(proposal);
    
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });
  
  it('verifies state hash correctly', () => {
    const fields = { lattice: { topology: 'tesseract' } };
    const state = {
      fields,
      certified_hash: hashStateFields(fields)
    };
    
    assert.ok(verifyStateHash(state));
  });
  
  it('detects hash mismatch', () => {
    const fields = { lattice: { topology: 'tesseract' } };
    const state = {
      fields,
      certified_hash: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    
    assert.ok(!verifyStateHash(state));
  });
  
  it('creates valid state IDs', () => {
    const id1 = createStateId('world-001', 1);
    const id2 = createStateId('world-001', 1);
    
    // Same inputs should produce same format
    assert.ok(id1.startsWith('state-'));
    assert.ok(id2.startsWith('state-'));
    assert.equal(id1.length, 20); // 'state-' + 14 hex chars
    assert.equal(id2.length, 20);
  });
  
  it('shortens hash correctly', () => {
    const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const short = shortHash(hash);
    
    assert.equal(short, 'abcdef01');
    assert.equal(short.length, 8);
  });
  
  it('hashes render artifacts', () => {
    const render = {
      state_id: 'state-001',
      observation_params: { camera: 'cam-001' },
      pixels: [1, 2, 3, 4],
      provenance: { intent_id: 'intent-001' }
    };
    
    const hash1 = hashRenderArtifact(render);
    const hash2 = hashRenderArtifact(render);
    
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });
  
  it('detects render changes', () => {
    const render1 = {
      state_id: 'state-001',
      observation_params: { camera: 'cam-001' },
      pixels: [1, 2, 3, 4],
      provenance: { intent_id: 'intent-001' }
    };
    
    const render2 = {
      state_id: 'state-001',
      observation_params: { camera: 'cam-001' },
      pixels: [1, 2, 3, 5], // Changed
      provenance: { intent_id: 'intent-001' }
    };
    
    const hash1 = hashRenderArtifact(render1);
    const hash2 = hashRenderArtifact(render2);
    
    assert.notEqual(hash1, hash2);
  });
});
