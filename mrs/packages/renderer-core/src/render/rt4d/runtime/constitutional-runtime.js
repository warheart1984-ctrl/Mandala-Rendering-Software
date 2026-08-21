/**
 * Constitutional Runtime Loop for Mandala 4D Renderer
 * Self-governing runtime where renderer projects certified 4D state to pixels
 * 
 * Loop:
 * Simulation Chamber proposal → AAIS gate → Certified state → Projection → Render with provenance
 */

import { StateStore } from '../state/state-store.js';
import { AAISValidator } from '../state/aais-validator.js';

/**
 * Constitutional Runtime orchestrator
 * Ensures all rendering follows constitutional principles
 */
export class ConstitutionalRuntime {
  constructor(options = {}) {
    this.stateStore = new StateStore(options.stateStoreOptions);
    this.validator = new AAISValidator(options.validatorOptions);
    this.strictMode = options.strictMode ?? true;
    
    // Runtime state
    this.currentWorldId = null;
    this.currentStateId = 'genesis';
    this.sessionId = options.sessionId || this._generateSessionId();
    this.renderHistory = [];
    
    // Provenance tracking
    this.provenanceChain = [];
    this.lastRenderTime = null;
    
    // Runtime metrics
    this.metrics = {
      totalRenders: 0,
      successfulRenders: 0,
      rejectedStates: 0,
      aaisViolations: 0,
      avgRenderTime: 0
    };
  }
  
  /**
   * Initialize runtime with world
   * @param {string} worldId - World identifier
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(worldId) {
    if (!worldId) {
      throw new Error('World ID required for initialization');
    }
    
    this.currentWorldId = worldId;
    
    // Create initial state for world
    const initialState = {
      intent_id: `init-${this.sessionId}`,
      world_id: worldId,
      previous_state_id: 'genesis',
      simulation_step: 0,
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
      },
      causality_bounds: {
        max_light_speed: 1.0
      }
    };
    
    const result = await this.stateStore.certifyState(initialState);
    
    if (result.status === 'certified') {
      this.currentStateId = result.state_id;
      this.provenanceChain.push({
        event: 'initialize',
        worldId,
        stateId: result.state_id,
        timestamp: new Date().toISOString()
      });
      
      return {
        status: 'initialized',
        worldId,
        stateId: result.state_id,
        certifiedHash: result.certified_hash
      };
    } else {
      throw new Error(`Failed to initialize world: ${result.reason}`);
    }
  }
  
  /**
   * Submit simulation proposal for certification
   * @param {Object} proposal - Simulation proposal
   * @returns {Promise<Object>} Certification result
   */
  async proposeState(proposal) {
    if (!this.currentWorldId) {
      throw new Error('Runtime not initialized. Call initialize() first.');
    }
    
    // Validate proposal has required fields
    if (!proposal.intent_id || !proposal.world_id || !proposal.fields) {
      throw new Error('Proposal missing required fields: intent_id, world_id, fields');
    }
    
    // Ensure world ID matches
    if (proposal.world_id !== this.currentWorldId) {
      throw new Error(`World ID mismatch: ${proposal.world_id} !== ${this.currentWorldId}`);
    }
    
    // Set previous state if not specified
    if (!proposal.previous_state_id) {
      proposal.previous_state_id = this.currentStateId;
    }
    
    // Certify state through AAIS gate
    const startTime = Date.now();
    const result = await this.stateStore.certifyState(proposal);
    const duration = Date.now() - startTime;
    
    if (result.status === 'certified') {
      this.currentStateId = result.state_id;
      this.metrics.successfulRenders++;
      this.metrics.totalRenders++;
      
      this.provenanceChain.push({
        event: 'state_certified',
        intentId: proposal.intent_id,
        worldId: this.currentWorldId,
        previousStateId: proposal.previous_state_id,
        newStateId: result.state_id,
        certifiedHash: result.certified_hash,
        aaisSignature: result.aais_signature,
        duration,
        timestamp: new Date().toISOString()
      });
      
      return {
        status: 'certified',
        stateId: result.state_id,
        certifiedHash: result.certified_hash,
        aaisSignature: result.aais_signature,
        provenance: result.provenance
      };
    } else {
      this.metrics.rejectedStates++;
      this.metrics.aaisViolations += result.violations?.length || 0;
      
      this.provenanceChain.push({
        event: 'state_rejected',
        intentId: proposal.intent_id,
        worldId: this.currentWorldId,
        reason: result.reason,
        violations: result.violations,
        timestamp: new Date().toISOString()
      });
      
      return {
        status: 'rejected',
        reason: result.reason,
        violations: result.violations
      };
    }
  }
  
  /**
   * Render certified state to pixels
   * @param {Object} renderParams - Render parameters
   * @returns {Promise<Object>} Render result with provenance
   */
  async renderState(renderParams = {}) {
    if (!this.currentWorldId || !this.currentStateId) {
      throw new Error('No certified state available for rendering');
    }
    
    // Verify current state is still valid
    const verification = this.stateStore.verifyState(this.currentStateId);
    
    if (!verification.valid) {
      throw new Error(`Current state verification failed: ${verification.hashValid}`);
    }
    
    const startTime = Date.now();
    
    // Get certified state
    const state = this.stateStore.getState(this.currentStateId);
    
    if (!state) {
      throw new Error(`State not found: ${this.currentStateId}`);
    }
    
    // Create render provenance
    const renderId = this._generateRenderId();
    const renderProvenance = {
      render_id: renderId,
      world_id: this.currentWorldId,
      state_id: this.currentStateId,
      certified_hash: state.certified_hash,
      aais_signature: state.provenance?.aais_signature,
      intent_id: state.provenance?.intent_id,
      simulation_step: state.provenance?.simulation_step,
      parent_state_id: state.provenance?.parent_state_id,
      render_params: renderParams,
      rendered_at: new Date().toISOString(),
      session_id: this.sessionId
    };
    
    // Simulate rendering (actual rendering would happen here)
    const renderResult = {
      renderId,
      stateId: this.currentStateId,
      worldId: this.currentWorldId,
      pixels: null, // Would be filled by actual renderer
      width: renderParams.width || 1920,
      height: renderParams.height || 1080,
      provenance: renderProvenance,
      certified: true
    };
    
    const duration = Date.now() - startTime;
    this.metrics.avgRenderTime = 
      (this.metrics.avgRenderTime * (this.metrics.totalRenders - 1) + duration) / 
      this.metrics.totalRenders;
    
    this.lastRenderTime = new Date().toISOString();
    
    this.provenanceChain.push({
      event: 'render',
      renderId,
      stateId: this.currentStateId,
      worldId: this.currentWorldId,
      duration,
      timestamp: this.lastRenderTime
    });
    
    this.renderHistory.push({
      renderId,
      stateId: this.currentStateId,
      timestamp: this.lastRenderTime,
      duration
    });
    
    return renderResult;
  }
  
  /**
   * Full constitutional loop: Propose → Certify → Render
   * @param {Object} proposal - Simulation proposal
   * @param {Object} renderParams - Render parameters
   * @returns {Promise<Object>} Complete loop result
   */
  async constitutionalLoop(proposal, renderParams = {}) {
    // Step 1: Propose state
    const certification = await this.proposeState(proposal);
    
    if (certification.status !== 'certified') {
      return {
        status: 'rejected',
        stage: 'certification',
        certification
      };
    }
    
    // Step 2: Render certified state
    const render = await this.renderState(renderParams);
    
    return {
      status: 'complete',
      stage: 'rendered',
      certification,
      render,
      provenanceChain: this.getProvenanceChain()
    };
  }
  
  /**
   * Get current certified state
   * @returns {Object|null} Current state
   */
  getCurrentState() {
    return this.stateStore.getState(this.currentStateId);
  }
  
  /**
   * Get state verification
   * @param {string} stateId - State ID
   * @returns {Object} Verification result
   */
  verifyState(stateId = this.currentStateId) {
    return this.stateStore.verifyState(stateId);
  }
  
  /**
   * Get provenance chain
   * @returns {Array} Provenance events
   */
  getProvenanceChain() {
    return [...this.provenanceChain];
  }
  
  /**
   * Get render history
   * @returns {Array} Render events
   */
  getRenderHistory() {
    return [...this.renderHistory];
  }
  
  /**
   * Get runtime metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * Get runtime status
   * @returns {Object} Status
   */
  getStatus() {
    return {
      initialized: !!this.currentWorldId,
      worldId: this.currentWorldId,
      currentStateId: this.currentStateId,
      sessionId: this.sessionId,
      lastRenderTime: this.lastRenderTime,
      metrics: this.getMetrics(),
      provenanceLength: this.provenanceChain.length
    };
  }
  
  /**
   * Reset runtime
   */
  reset() {
    this.currentWorldId = null;
    this.currentStateId = 'genesis';
    this.provenanceChain = [];
    this.renderHistory = [];
    this.metrics = {
      totalRenders: 0,
      successfulRenders: 0,
      rejectedStates: 0,
      aaisViolations: 0,
      avgRenderTime: 0
    };
  }
  
  /**
   * Generate session ID
   * @private
   */
  _generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
  
  /**
   * Generate render ID
   * @private
   */
  _generateRenderId() {
    return `render-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
