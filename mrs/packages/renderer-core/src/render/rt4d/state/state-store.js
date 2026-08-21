/**
 * Certified State Store
 * Immutable state certification with AAIS signatures
 * Status: enforced
 */

import { createHash } from 'crypto';
import { 
  hashStateFields, 
  hashStateProposal, 
  verifyStateHash,
  createStateId 
} from './state-hash.js';
import AAISValidator from './aais-validator.js';

/**
 * Certified State Store
 */
export class StateStore {
  constructor(options = {}) {
    this.states = new Map();
    this.validator = new AAISValidator(options.validatorOptions);
    this.strictMode = options.strictMode ?? true;
    
    // Genesis state
    this.genesisState = {
      state_id: 'genesis',
      certified_hash: 'f5886e9bf0b0097a289f9ded9b4136a2a10c64b243d48dceeede3f7ac187eab0',
      provenance: {
        intent_id: 'genesis',
        world_id: 'initial',
        simulation_step: 0,
        aais_signature: 'genesis',
        parent_state_id: null,
        created_at: new Date().toISOString()
      },
      fields: {
        lattice: {
          dimensions: [128, 128, 128, 256],
          topology: 'tesseract',
          sparsity: 0.12
        },
        conserved_quantities: {
          energy: 0,
          momentum: [0, 0, 0, 0]
        }
      }
    };
    
    this.states.set('genesis', this.genesisState);
  }
  
  /**
   * Get state by ID
   * @param {string} stateId
   * @returns {Object|null}
   */
  getState(stateId) {
    return this.states.get(stateId) || null;
  }
  
  /**
   * Verify state integrity
   * @param {string} stateId
   * @returns {VerificationResult}
   */
  verifyState(stateId) {
    const state = this.getState(stateId);
    if (!state) {
      return { valid: false, error: `State ${stateId} not found` };
    }
    
    const hashValid = verifyStateHash(state);
    const provenanceValid = this.verifyProvenance(state);
    
    return {
      valid: hashValid && provenanceValid,
      hashValid,
      provenanceValid,
      stateId,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Verify provenance chain
   * @param {Object} state
   * @returns {boolean}
   */
  verifyProvenance(state) {
    if (!state.provenance) return false;
    if (!state.provenance.intent_id) return false;
    if (!state.provenance.world_id) return false;
    if (!state.provenance.aais_signature) return false;
    
    // Verify parent exists if not genesis
    if (state.state_id !== 'genesis' && state.provenance.parent_state_id) {
      const parent = this.getState(state.provenance.parent_state_id);
      if (!parent) return false;
    }
    
    return true;
  }
  
  /**
   * Certify state proposal
   * @param {Object} proposal - state proposal
   * @returns {Promise<CertificationResult>}
   */
  async certifyState(proposal) {
    // Step 1: Get previous state
    const previousState = this.getState(proposal.previous_state_id);
    if (!previousState) {
      return {
        status: 'rejected',
        reason: 'Previous state not found',
        violations: [`previous_state_id ${proposal.previous_state_id} not found`]
      };
    }
    
    // Step 2: Validate with AAIS
    const validation = await this.validator.validateTransition(previousState, proposal);
    
    if (!validation.valid) {
      const criticalViolations = validation.violations.filter(v => v.severity === 'critical');
      if (criticalViolations.length > 0 || this.strictMode) {
        return {
          status: 'rejected',
          reason: 'AAIS validation failed',
          violations: validation.violations,
          validation
        };
      }
    }
    
    // Step 3: Create certified state
    const stateId = createStateId(proposal.world_id, proposal.simulation_step);
    const certifiedHash = hashStateFields(proposal.fields);
    const proposalHash = hashStateProposal(proposal);
    
    const certifiedState = {
      state_id: stateId,
      certified_hash: certifiedHash,
      proposal_hash: proposalHash,
      fields: proposal.fields,
      conserved_quantities: proposal.conserved_quantities,
      causality_bounds: proposal.causality_bounds,
      provenance: {
        intent_id: proposal.intent_id,
        world_id: proposal.world_id,
        simulation_step: proposal.simulation_step,
        parent_state_id: proposal.previous_state_id,
        aais_signature: this.generateAAISSignature(proposal, validation),
        validation_result: validation,
        created_at: new Date().toISOString(),
        numerical_error_bound: proposal.numerical_error_bound || 0
      }
    };
    
    // Step 4: Store state
    this.states.set(stateId, certifiedState);
    
    return {
      status: 'certified',
      state_id: stateId,
      certified_hash: certifiedHash,
      aais_signature: certifiedState.provenance.aais_signature,
      state: certifiedState,
      provenance: certifiedState.provenance
    };
  }
  
  /**
   * Generate AAIS signature
   * @param {Object} proposal
   * @param {Object} validation
   * @returns {string}
   */
  generateAAISSignature(proposal, validation) {
    const signatureData = {
      intent_id: proposal.intent_id,
      world_id: proposal.world_id,
      simulation_step: proposal.simulation_step,
      validation_valid: validation.valid,
      violations_count: validation.violations.length,
      timestamp: new Date().toISOString()
    };
    
    const hash = createHash('sha256');
    hash.update(JSON.stringify(signatureData));
    return 'AAIS-' + hash.digest('hex').slice(0, 32);
  }
  
  /**
   * Get provenance chain
   * @param {string} stateId
   * @returns {Array}
   */
  getProvenanceChain(stateId) {
    const chain = [];
    let currentId = stateId;
    
    while (currentId && chain.length < 1000) { // Prevent infinite loops
      const state = this.getState(currentId);
      if (!state) break;
      
      chain.push({
        state_id: state.state_id,
        certified_hash: state.certified_hash,
        provenance: state.provenance
      });
      
      if (state.state_id === 'genesis') break;
      currentId = state.provenance.parent_state_id;
    }
    
    return chain.reverse();
  }
  
  /**
   * List all states for world
   * @param {string} worldId
   * @returns {Array}
   */
  listStates(worldId) {
    const states = [];
    for (const [id, state] of this.states.entries()) {
      if (state.provenance.world_id === worldId) {
        states.push({
          state_id: id,
          simulation_step: state.provenance.simulation_step,
          certified_hash: state.certified_hash,
          created_at: state.provenance.created_at
        });
      }
    }
    
    return states.sort((a, b) => a.simulation_step - b.simulation_step);
  }
  
  /**
   * Export state for external use
   * @param {string} stateId
   * @returns {Object|null}
   */
  exportState(stateId) {
    const state = this.getState(stateId);
    if (!state) return null;
    
    return {
      state_id: state.state_id,
      certified_hash: state.certified_hash,
      fields: JSON.parse(JSON.stringify(state.fields)),
      provenance: JSON.parse(JSON.stringify(state.provenance))
    };
  }
  
  /**
   * Import external state (verifies before import)
   * @param {Object} state
   * @returns {ImportResult}
   */
  async importState(state) {
    const verification = this.verifyState(state.state_id);
    if (verification.valid) {
      this.states.set(state.state_id, state);
      return { status: 'imported', state_id: state.state_id };
    }
    
    // Try to certify
    const proposal = {
      intent_id: state.provenance.intent_id,
      world_id: state.provenance.world_id,
      previous_state_id: state.provenance.parent_state_id,
      simulation_step: state.provenance.simulation_step,
      fields: state.fields,
      conserved_quantities: state.conserved_quantities,
      causality_bounds: state.causality_bounds
    };
    
    return this.certifyState(proposal);
  }
}

/**
 * Create state store instance
 * @param {Object} options
 * @returns {StateStore}
 */
export function createStateStore(options = {}) {
  return new StateStore(options);
}

export default StateStore;
