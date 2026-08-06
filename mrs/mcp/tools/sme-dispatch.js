// mrs/mcp/tools/sme-dispatch.js

import { SMEDispatchService } from '../services/SMEDispatchService.js';

const smeDispatch = new SMEDispatchService();

export const smeDispatchTool = {
  id: 'mrs.sme.dispatch',
  description: 'Dispatch tasks to SME modules (txt, vis, aud, vid, gen, log, core)',

  /**
   * @param {object} params - SMEDispatchRequest
   * @param {object} context - MCP context
   */
  async execute(params = {}, context = {}) {
    const { tasks, intentId, correlationId } = params;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return { ok: false, error: 'tasks array required' };
    }

    const results = [];
    for (const task of tasks) {
      // Route task
      const route = await smeDispatch.routeTask(task, {
        intentId,
        correlationId: correlationId || `sme-${intentId || Date.now()}`,
        evidence: context.evidence,
        lattice: context.lattice,
      });

      if (!route.ok) {
        results.push(route);
        continue;
      }

      // Execute task
      const result = await smeDispatch.executeTask(route, {
        intentId,
        correlationId: correlationId || `sme-${intentId || Date.now()}`,
        evidence: context.evidence,
        lattice: context.lattice,
      });

      results.push(result);
    }

    const aggregatedEvidence = {
      id: `ev-sme-${intentId || Date.now()}`,
      intentId,
      correlationId: correlationId || `sme-${intentId || Date.now()}`,
      tasks: results.map(r => ({
        taskId: r.taskId,
        sme: r.sme,
        action: r.action,
        ok: r.ok,
        evidence: r.evidence,
      })),
      merkleRoot: `merkle-${results.length}-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    return {
      ok: results.every(r => r.ok),
      results,
      evidence: aggregatedEvidence,
      replayToken: `replay-sme-${intentId || Date.now()}`,
    };
  },
};