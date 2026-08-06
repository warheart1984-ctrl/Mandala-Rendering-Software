// mrs/mcp/tools/director-dep.js

import { DirectorDEPService } from '../services/DirectorDEPService.js';

const depService = new DirectorDEPService();

export const directorDepTool = {
  id: 'mrs.director.dep',
  description: 'Director DEP workflow orchestration: Plan → Route → Supervise → Enforce Governance',

  /**
   * @param {object} params - DEPExecutionRequest
   * @param {object} context - MCP context (governance, conformance, lattice, evidence)
   */
  async execute(params = {}, context = {}) {
    const {
      intentId,
      intent,
      timelineId,
      worldId,
      parameters,
      evidence: paramsEvidence,
      depStages = ['plan', 'route', 'supervise', 'enforce_governance'],
    } = params;

    // Support evidence in both params and context (REST puts it in context)
    const evidence = paramsEvidence || context.evidence;

    const correlationId = context.correlationId || `dep-${intentId || Date.now()}`;

    // Stage 1: PLAN
    const planResult = await depService.plan({
      intentId,
      intent,
      timelineId,
      worldId,
      parameters,
      evidence,
      correlationId,
      actorIdentity: context.actorIdentity,
      lattice: context.lattice,
    });

    if (!planResult.ok) {
      return { ok: false, stage: 'plan', error: planResult.error, evidence: planResult.evidence };
    }

    // Stage 2: ROUTE
    const routeResult = await depService.route({
      ...planResult.output,
      evidence,
      correlationId,
      actorIdentity: context.actorIdentity,
      lattice: context.lattice,
    });

    if (!routeResult.ok) {
      return { ok: false, stage: 'route', error: routeResult.error, evidence: routeResult.evidence };
    }

    // Stage 3: SUPERVISE
    const superviseResult = await depService.supervise({
      ...routeResult.output,
      evidence,
      correlationId,
      actorIdentity: context.actorIdentity,
      lattice: context.lattice,
    });

    if (!superviseResult.ok) {
      return { ok: false, stage: 'supervise', error: superviseResult.error, evidence: superviseResult.evidence };
    }

    // Stage 4: ENFORCE GOVERNANCE
    const enforceResult = await depService.enforceGovernance({
      ...superviseResult.output,
      evidence,
      correlationId,
      actorIdentity: context.actorIdentity,
      lattice: context.lattice,
    });

    if (!enforceResult.ok) {
      return { ok: false, stage: 'enforce_governance', error: enforceResult.error, evidence: enforceResult.evidence };
    }

    // Aggregate evidence from all stages
    const aggregatedEvidence = {
      id: `ev-dep-${intentId}`,
      intentId,
      correlationId,
      stages: [
        { stage: 'plan', evidence: planResult.evidence },
        { stage: 'route', evidence: routeResult.evidence },
        { stage: 'supervise', evidence: superviseResult.evidence },
        { stage: 'enforce_governance', evidence: enforceResult.evidence },
      ],
      merkleRoot: depService.computeMerkleRoot([
        planResult.evidence,
        routeResult.evidence,
        superviseResult.evidence,
        enforceResult.evidence,
      ]),
      timestamp: new Date().toISOString(),
    };

    return {
      ok: true,
      intentId,
      correlationId,
      output: enforceResult.output,
      evidence: aggregatedEvidence,
      replayToken: `replay-dep-${intentId}`,
    };
  },
};