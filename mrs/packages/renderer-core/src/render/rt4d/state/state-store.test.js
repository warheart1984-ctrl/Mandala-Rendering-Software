/**
 * State Store Tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import StateStore from './state-store.js';
import { hashStateFields } from './state-hash.js';

describe('StateStore', () => {
  it('creates genesis state', () => {
    const store = new StateStore();
    const genesis = store.getState('genesis');
    
    assert.ok(genesis);
    assert.equal(genesis.state_id, 'genesis');
    assert.ok(genesis.certified_hash);
    assert.ok(genesis.provenance);
    assert.ok(genesis.fields);
  });
  
  it('certifies valid state transition', async () => {
    const store = new StateStore();
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: {
        lattice: {
          dimensions: [128, 128, 128, 256],
          topology: 'tesseract'
        }
      },
      conserved_quantities: {
        energy: 0
      },
      causality_bounds: {
        max_light_speed: 1.0
      }
    };
    
    const result = await store.certifyState(proposal);
    
    assert.equal(result.status, 'certified');
    assert.ok(result.state_id);
    assert.ok(result.certified_hash);
    assert.ok(result.state);
    assert.equal(result.state.provenance.intent_id, 'intent-001');
    assert.equal(result.state.provenance.simulation_step, 1);
  });
  
  it('rejects invalid topology', async () => {
    const store = new StateStore();
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: {
        lattice: {
          dimensions: [128, 128, 128, 256],
          topology: 'invalid-topology'
        }
      },
      conserved_quantities: {
        energy: 0
      },
      causality_bounds: {
        max_light_speed: 1.0
      }
    };
    
    const result = await store.certifyState(proposal);
    
    assert.equal(result.status, 'rejected');
    assert.ok(result.violations.length > 0);
  });
  
  it('rejects energy non-conservation', async () => {
    const store = new StateStore();
    
    // First state
    const proposal1 = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: {
        energy: 100
      },
      causality_bounds: {
        max_light_speed: 1.0
      }
    };
    
    const result1 = await store.certifyState(proposal1);
    assert.equal(result1.status, 'certified');
    
    // Second state with energy change
    const proposal2 = {
      intent_id: 'intent-002',
      world_id: 'world-001',
      previous_state_id: result1.state_id,
      simulation_step: 2,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: {
        energy: 200  // Changed!
      },
      causality_bounds: {
        max_light_speed: 1.0
      }
    };
    
    const result2 = await store.certifyState(proposal2);
    
    assert.equal(result2.status, 'rejected');
    const energyViolation = result2.violations.find(v => v.invariant === 'energy_conservation');
    assert.ok(energyViolation);
  });
  
  it('verifies state integrity', () => {
    const store = new StateStore();
    
    // Genesis is always valid
    const verification = store.verifyState('genesis');
    
    assert.ok(verification.valid);
    assert.ok(verification.hashValid);
    assert.ok(verification.provenanceValid);
  });
  
  it('gets provenance chain', async () => {
    const store = new StateStore();
    
    const proposal1 = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result1 = await store.certifyState(proposal1);
    
    const proposal2 = {
      intent_id: 'intent-002',
      world_id: 'world-001',
      previous_state_id: result1.state_id,
      simulation_step: 2,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result2 = await store.certifyState(proposal2);
    
    const chain = store.getProvenanceChain(result2.state_id);
    
    assert.equal(chain.length, 3); // genesis + 2 states
    assert.equal(chain[0].state_id, 'genesis');
    assert.equal(chain[2].state_id, result2.state_id);
  });
  
  it('lists states by world', async () => {
    const store = new StateStore();
    
    const proposal1 = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await store.certifyState(proposal1);
    
    const proposal2 = {
      intent_id: 'intent-002',
      world_id: 'world-002',
      previous_state_id: 'genesis',
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await store.certifyState(proposal2);
    
    const world1States = store.listStates('world-001');
    const world2States = store.listStates('world-002');
    
    assert.equal(world1States.length, 1);
    assert.equal(world2States.length, 1);
    assert.equal(world1States[0].simulation_step, 1);
  });
  
  it('hashes state fields deterministically', () => {
    const fields = {
      lattice: { topology: 'tesseract', dimensions: [128, 128, 128, 256] }
    };
    
    const hash1 = hashStateFields(fields);
    const hash2 = hashStateFields(fields);
    
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });
  
  it('detects state tampering', () => {
    const store = new StateStore();
    
    // Get genesis
    const genesis = store.getState('genesis');
    
    // Tamper with fields
    const tampered = {
      ...genesis,
      fields: {
        ...genesis.fields,
        lattice: {
          ...genesis.fields.lattice,
          topology: 'tampered'
        }
      }
    };
    
    // Verify should fail because hash won't match
    const computedHash = hashStateFields(tampered.fields);
    assert.notEqual(computedHash, genesis.certified_hash);
  });
  
  it('exports state safely', () => {
    const store = new StateStore();
    
    const exported = store.exportState('genesis');
    
    assert.ok(exported);
    assert.equal(exported.state_id, 'genesis');
    assert.ok(exported.certified_hash);
    assert.ok(exported.fields);
    assert.ok(exported.provenance);
    
    // Export should not allow mutation of stored state
    exported.fields.lattice.topology = 'modified';
    const stored = store.getState('genesis');
    assert.notEqual(stored.fields.lattice.topology, 'modified');
  });
});
