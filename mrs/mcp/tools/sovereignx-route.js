// mrs/mcp/tools/sovereignx-route.js

import { sovereignXRouter } from '../services/SovereignXRouter.js';

export const sovereignxRouteTool = {
  id: 'mrs.sovereignx.route',
  description: 'Route render tasks via Sovereign X Constitutional Compute Scheduler for GPU efficiency',

  /**
   * @param {object} params - SovereignXRouteRequest
   * @param {object} context - MCP context
   */
  async execute(params = {}, context = {}) {
    const { scene, renderParams, identity, evidenceIds, priority } = params;

    if (!scene || !scene.meshes) {
      return { ok: false, error: 'scene with meshes required' };
    }

    // Initialize router if not already done
    if (!sovereignXRouter.hipStatus) {
      await sovereignXRouter.initialize();
    }

    const renderTask = {
      scene,
      renderParams,
      identity,
      evidenceIds,
      priority,
    };

    const result = await sovereignXRouter.routeRenderTask(renderTask);

    return {
      ok: result.decision === 'allowed',
      arena: result.arena,
      arenaLabel: result.arenaLabel,
      decision: result.decision,
      result: result.result,
      executionTime: result.executionTime,
      efficiency: result.efficiency,
      hipStatus: result.hipStatus,
      intentId: result.intentId,
      replayToken: `replay-sx-${result.intentId}`,
    };
  },
};

export const sovereignxStatsTool = {
  id: 'mrs.sovereignx.stats',
  description: 'Get Sovereign X router statistics and efficiency metrics',

  async execute(params = {}, context = {}) {
    return {
      ok: true,
      stats: sovereignXRouter.getStats(),
    };
  },
};

export const sovereignxHipDetectTool = {
  id: 'mrs.sovereignx.hip.detect',
  description: 'Detect HIP/ROCm SDK availability',

  async execute(params = {}, context = {}) {
    const invokeTools = params.invokeTools === true;
    const status = await sovereignXRouter.refreshHipDetection();
    return {
      ok: true,
      hipStatus: status,
    };
  },
};