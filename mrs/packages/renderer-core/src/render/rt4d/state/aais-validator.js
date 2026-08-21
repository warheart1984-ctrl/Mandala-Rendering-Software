/**
 * AAIS Constitutional Validator
 * Validates state transitions against constitutional invariants
 * Status: enforced
 */

export const AAIS_INVARIANTS = {
  ENERGY_CONSERVATION: {
    id: 'energy_conservation',
    severity: 'critical',
    description: 'Energy must be conserved across state transitions',
    check: (prevState, nextState) => {
      if (!prevState || !nextState) return { valid: true };
      // Skip energy conservation check for genesis transition
      if (prevState.state_id === 'genesis') {
        return { valid: true, value: 0, tolerance: 0, message: 'Genesis transition, energy check skipped' };
      }
      const prevEnergy = prevState.conserved_quantities?.energy || 0;
      const nextEnergy = nextState.conserved_quantities?.energy || 0;
      const delta = Math.abs(nextEnergy - prevEnergy);
      const tolerance = 1e-6;
      return {
        valid: delta < tolerance,
        value: delta,
        tolerance,
        message: delta >= tolerance ? 
          `Energy non-conservation: delta=${delta} exceeds tolerance=${tolerance}` : 
          'Energy conserved'
      };
    }
  },
  
  CAUSALITY: {
    id: 'causality',
    severity: 'critical',
    description: 'Causality bounds must be respected',
    check: (prevState, nextState) => {
      if (!nextState.causality_bounds) return { valid: true };
      const maxLightSpeed = nextState.causality_bounds.max_light_speed || 0;
      const valid = maxLightSpeed <= 1.001; // Allow small numerical error
      return {
        valid,
        value: maxLightSpeed,
        message: valid ? 
          'Causality respected' : 
          `Causality violation: max_light_speed=${maxLightSpeed} > 1.0`
      };
    }
  },
  
  TOPOLOGY_VALIDITY: {
    id: 'topology_validity',
    severity: 'critical',
    description: 'Lattice topology must be valid',
    check: (state) => {
      const topology = state.fields?.lattice?.topology;
      const valid = topology === 'moebius' || topology === 'tesseract';
      return {
        valid,
        value: topology,
        message: valid ? 
          `Valid topology: ${topology}` : 
          `Invalid topology: ${topology}`
      };
    }
  },
  
  MATH_VALIDITY: {
    id: 'math_validity',
    severity: 'critical',
    description: 'No NaN or Infinity in state fields',
    check: (state) => {
      const fields = state.fields;
      const hasNaN = (obj) => {
        if (obj == null) return false;
        if (typeof obj === 'number') return !isFinite(obj);
        if (Array.isArray(obj)) return obj.some(hasNaN);
        if (typeof obj === 'object') {
          return Object.values(obj).some(hasNaN);
        }
        return false;
      };
      
      const valid = !hasNaN(fields);
      return {
        valid,
        message: valid ? 
          'No NaN/Infinity in fields' : 
          'State contains NaN or Infinity'
      };
    }
  },
  
  PROVENANCE_CHAIN: {
    id: 'provenance_chain',
    severity: 'critical',
    description: 'State must have complete provenance chain',
    check: (state) => {
      // Skip provenance check for proposals (they don't have provenance yet)
      if (!state.provenance && state.intent_id && state.world_id) {
        return { valid: true, message: 'Proposal provenance will be created' };
      }
      
      const provenance = state.provenance;
      if (!provenance) {
        return { valid: false, message: 'Missing provenance' };
      }
      
      const required = ['intent_id', 'world_id', 'aais_signature', 'simulation_step'];
      const missing = required.filter(field => !provenance[field]);
      
      const valid = missing.length === 0;
      return {
        valid,
        missing,
        message: valid ? 
          'Provenance chain complete' : 
          `Missing provenance fields: ${missing.join(', ')}`
      };
    }
  },
  
  REPLAY_DETERMINISM: {
    id: 'replay_determinism',
    severity: 'critical',
    description: 'State must be deterministic and replayable',
    check: (state) => {
      const fields = state.fields;
      const hasRandom = (obj) => {
        if (typeof obj === 'object' && obj !== null) {
          // Check for random seeds or timestamps
          if (obj.seed && typeof obj.seed === 'number') return false; // seeds are ok
          if (obj.timestamp) return true; // timestamps break determinism
          return Object.values(obj).some(hasRandom);
        }
        return false;
      };
      
      const valid = !hasRandom(fields);
      return {
        valid,
        message: valid ? 
          'State is deterministic' : 
          'State contains non-deterministic elements'
      };
    }
  }
};

/**
 * AAIS Validator class
 */
export class AAISValidator {
  constructor(options = {}) {
    this.invariants = options.invariants || AAIS_INVARIANTS;
    this.strictMode = options.strictMode ?? true;
  }
  
  /**
   * Validate state transition
   * @param {Object} previousState - previous certified state
   * @param {Object} nextState - proposed next state
   * @returns {ValidationResult}
   */
  async validateTransition(previousState, nextState) {
    const results = [];
    const violations = [];
    
    for (const [name, invariant] of Object.entries(this.invariants)) {
      try {
        let result;
        if (name === 'ENERGY_CONSERVATION' || name === 'CAUSALITY') {
          result = invariant.check(previousState, nextState);
        } else {
          result = invariant.check(nextState);
        }
        
        results.push({
          invariant: invariant.id,
          name,
          severity: invariant.severity,
          valid: result.valid,
          details: result
        });
        
        if (!result.valid) {
          violations.push({
            invariant: invariant.id,
            severity: invariant.severity,
            message: result.message,
            details: result
          });
        }
      } catch (error) {
        results.push({
          invariant: invariant.id,
          name,
          severity: invariant.severity,
          valid: false,
          error: error.message
        });
        violations.push({
          invariant: invariant.id,
          severity: invariant.severity,
          message: `Validation error: ${error.message}`,
          error
        });
      }
    }
    
    const valid = violations.length === 0 || 
      !this.strictMode && violations.every(v => v.severity !== 'critical');
    
    return {
      valid,
      results,
      violations,
      timestamp: new Date().toISOString(),
      validator: 'AAIS-v1.0'
    };
  }
  
  /**
   * Validate single state
   * @param {Object} state - state to validate
   * @returns {ValidationResult}
   */
  async validateState(state) {
    const results = [];
    const violations = [];
    
    for (const [name, invariant] of Object.entries(this.invariants)) {
      try {
        const result = invariant.check(state);
        
        results.push({
          invariant: invariant.id,
          name,
          severity: invariant.severity,
          valid: result.valid,
          details: result
        });
        
        if (!result.valid) {
          violations.push({
            invariant: invariant.id,
            severity: invariant.severity,
            message: result.message,
            details: result
          });
        }
      } catch (error) {
        results.push({
          invariant: invariant.id,
          name,
          severity: invariant.severity,
          valid: false,
          error: error.message
        });
        violations.push({
          invariant: invariant.id,
          severity: invariant.severity,
          message: `Validation error: ${error.message}`,
          error
        });
      }
    }
    
    const valid = violations.length === 0 || 
      !this.strictMode && violations.every(v => v.severity !== 'critical');
    
    return {
      valid,
      results,
      violations,
      timestamp: new Date().toISOString(),
      validator: 'AAIS-v1.0'
    };
  }
  
  /**
   * Check if state satisfies constitutional invariants
   * @param {Object} state - state to check
   * @returns {boolean}
   */
  async satisfiesInvariants(state) {
    const validation = await this.validateState(state);
    return validation.valid;
  }
}

/**
 * Quick validation helper
 * @param {Object} state - state to validate
 * @param {Object} options - validation options
 * @returns {Promise<boolean>}
 */
export async function validateState(state, options = {}) {
  const validator = new AAISValidator(options);
  const result = await validator.validateState(state);
  return result.valid;
}

export default AAISValidator;
