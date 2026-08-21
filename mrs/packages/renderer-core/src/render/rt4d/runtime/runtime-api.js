/**
 * Constitutional Runtime API
 * REST API endpoints for self-governing runtime
 */

import { ConstitutionalRuntime } from './constitutional-runtime.js';

/**
 * Create runtime API handler
 * @param {Object} options - Runtime options
 * @returns {Object} API handlers
 */
export function createRuntimeAPI(options = {}) {
  const runtime = new ConstitutionalRuntime(options);
  
  return {
    runtime,
    
    /**
     * Initialize runtime with world
     * POST /api/runtime/initialize
     */
    async initialize(req, res) {
      try {
        const { worldId } = req.body || {};
        
        if (!worldId) {
          return res.status(400).json({
            error: 'worldId required',
            status: 'error'
          });
        }
        
        const result = await runtime.initialize(worldId);
        
        return res.json({
          status: 'success',
          data: result
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Propose state transition
     * POST /api/runtime/propose
     */
    async propose(req, res) {
      try {
        const proposal = req.body || {};
        
        const result = await runtime.proposeState(proposal);
        
        if (result.status === 'certified') {
          return res.json({
            status: 'success',
            data: result
          });
        } else {
          return res.status(422).json({
            status: 'rejected',
            error: result.reason,
            violations: result.violations
          });
        }
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Render current state
     * POST /api/runtime/render
     */
    async render(req, res) {
      try {
        const renderParams = req.body || {};
        
        const result = await runtime.renderState(renderParams);
        
        return res.json({
          status: 'success',
          data: result
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Full constitutional loop
     * POST /api/runtime/loop
     */
    async constitutionalLoop(req, res) {
      try {
        const { proposal, renderParams } = req.body || {};
        
        if (!proposal) {
          return res.status(400).json({
            error: 'proposal required',
            status: 'error'
          });
        }
        
        const result = await runtime.constitutionalLoop(proposal, renderParams || {});
        
        if (result.status === 'complete') {
          return res.json({
            status: 'success',
            data: result
          });
        } else {
          return res.status(422).json({
            status: 'rejected',
            data: result
          });
        }
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Get current state
     * GET /api/runtime/state
     */
    async getState(req, res) {
      try {
        const state = runtime.getCurrentState();
        
        if (!state) {
          return res.status(404).json({
            error: 'No current state',
            status: 'error'
          });
        }
        
        return res.json({
          status: 'success',
          data: {
            stateId: runtime.currentStateId,
            worldId: runtime.currentWorldId,
            state
          }
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Verify state
     * GET /api/runtime/state/:stateId/verify
     */
    async verifyState(req, res) {
      try {
        const { stateId } = req.params;
        
        const verification = runtime.verifyState(stateId);
        
        return res.json({
          status: 'success',
          data: verification
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Get provenance chain
     * GET /api/runtime/provenance
     */
    async getProvenance(req, res) {
      try {
        const chain = runtime.getProvenanceChain();
        
        return res.json({
          status: 'success',
          data: {
            chain,
            length: chain.length
          }
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Get render history
     * GET /api/runtime/history
     */
    async getHistory(req, res) {
      try {
        const history = runtime.getRenderHistory();
        
        return res.json({
          status: 'success',
          data: {
            history,
            count: history.length
          }
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Get runtime metrics
     * GET /api/runtime/metrics
     */
    async getMetrics(req, res) {
      try {
        const metrics = runtime.getMetrics();
        
        return res.json({
          status: 'success',
          data: metrics
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Get runtime status
     * GET /api/runtime/status
     */
    async getStatus(req, res) {
      try {
        const status = runtime.getStatus();
        
        return res.json({
          status: 'success',
          data: status
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    },
    
    /**
     * Reset runtime
     * POST /api/runtime/reset
     */
    async reset(req, res) {
      try {
        runtime.reset();
        
        return res.json({
          status: 'success',
          message: 'Runtime reset complete'
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          status: 'error'
        });
      }
    }
  };
}

/**
 * Runtime API routes
 */
export const RuntimeRoutes = {
  'POST /api/runtime/initialize': 'initialize',
  'POST /api/runtime/propose': 'propose',
  'POST /api/runtime/render': 'render',
  'POST /api/runtime/loop': 'constitutionalLoop',
  'GET /api/runtime/state': 'getState',
  'GET /api/runtime/state/:stateId/verify': 'verifyState',
  'GET /api/runtime/provenance': 'getProvenance',
  'GET /api/runtime/history': 'getHistory',
  'GET /api/runtime/metrics': 'getMetrics',
  'GET /api/runtime/status': 'getStatus',
  'POST /api/runtime/reset': 'reset'
};
