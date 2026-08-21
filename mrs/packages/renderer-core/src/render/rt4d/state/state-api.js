/**
 * State Store API
 * REST API for certified state operations
 * Status: enforced
 */

import StateStore from './state-store.js';

/**
 * State API handler
 */
export class StateAPI {
  constructor(stateStore) {
    this.stateStore = stateStore || new StateStore();
  }
  
  /**
   * POST /api/mandala/state
   * Create certified state
   */
  async createState(req, res) {
    try {
      const proposal = req.body;
      
      // Validate request
      if (!proposal.intent_id || !proposal.world_id || !proposal.previous_state_id) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['intent_id', 'world_id', 'previous_state_id', 'fields']
        });
      }
      
      // Certify state
      const result = await this.stateStore.certifyState(proposal);
      
      if (result.status === 'certified') {
        return res.status(201).json({
          status: 'certified',
          state_id: result.state_id,
          certified_hash: result.certified_hash,
          provenance: result.state.provenance
        });
      } else {
        return res.status(400).json({
          status: 'rejected',
          reason: result.reason,
          violations: result.violations
        });
      }
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/mandala/state/:id
   * Get certified state
   */
  async getState(req, res) {
    try {
      const stateId = req.params.id;
      const state = this.stateStore.getState(stateId);
      
      if (!state) {
        return res.status(404).json({
          error: 'State not found',
          state_id: stateId
        });
      }
      
      // Verify state
      const verification = this.stateStore.verifyState(stateId);
      
      return res.status(200).json({
        state_id: state.state_id,
        certified_hash: state.certified_hash,
        fields: state.fields,
        provenance: state.provenance,
        verification
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/mandala/state/:id/verify
   * Verify state integrity
   */
  async verifyState(req, res) {
    try {
      const stateId = req.params.id;
      const verification = this.stateStore.verifyState(stateId);
      
      if (!verification.valid) {
        return res.status(400).json(verification);
      }
      
      return res.status(200).json(verification);
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/mandala/state/:id/lineage
   * Get provenance chain
   */
  async getLineage(req, res) {
    try {
      const stateId = req.params.id;
      const chain = this.stateStore.getProvenanceChain(stateId);
      
      return res.status(200).json({
        state_id: stateId,
        lineage: chain,
        length: chain.length
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/mandala/world/:id/states
   * List states for world
   */
  async listWorldStates(req, res) {
    try {
      const worldId = req.params.id;
      const states = this.stateStore.listStates(worldId);
      
      return res.status(200).json({
        world_id: worldId,
        states,
        count: states.length
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * POST /api/mandala/state/:id/render
   * Request render from state
   */
  async renderState(req, res) {
    try {
      const stateId = req.params.id;
      const state = this.stateStore.getState(stateId);
      
      if (!state) {
        return res.status(404).json({
          error: 'State not found',
          state_id: stateId
        });
      }
      
      // Verify state
      const verification = this.stateStore.verifyState(stateId);
      if (!verification.valid) {
        return res.status(400).json({
          error: 'State verification failed',
          verification
        });
      }
      
      // Request render (will be handled by renderer)
      return res.status(202).json({
        status: 'render_requested',
        state_id: stateId,
        certified_hash: state.certified_hash,
        render_request_id: `render-${Date.now()}-${stateId.slice(0, 8)}`
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}

/**
 * Express middleware for state API
 * @param {StateStore} stateStore
 * @returns {Object}
 */
export function createStateRoutes(stateStore) {
  const api = new StateAPI(stateStore);
  
  return {
    'POST /api/mandala/state': api.createState.bind(api),
    'GET /api/mandala/state/:id': api.getState.bind(api),
    'GET /api/mandala/state/:id/verify': api.verifyState.bind(api),
    'GET /api/mandala/state/:id/lineage': api.getLineage.bind(api),
    'GET /api/mandala/world/:id/states': api.listWorldStates.bind(api),
    'POST /api/mandala/state/:id/render': api.renderState.bind(api)
  };
}

export default StateAPI;
