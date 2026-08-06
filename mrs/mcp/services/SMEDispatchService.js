// mrs/mcp/services/SMEDispatchService.js

import { GovernanceAdapter } from '../governance-adapter.js';

const governance = new GovernanceAdapter();

// SME module configurations
const SME_MODULES = {
  'sme.txt': { authority: 'infer', allowed: ['generate_text', 'embed_text', 'produce_decision_record'] },
  'sme.vis': { authority: 'encode', allowed: ['encode_image', 'extract_features', 'produce_evidence'] },
  'sme.aud': { authority: 'transcribe', allowed: ['transcribe_audio', 'embed_audio', 'produce_timecodes'] },
  'sme.vid': { authority: 'encode', allowed: ['sample_frames', 'encode_video', 'aggregate_temporal', 'produce_events'] },
  'sme.gen': { authority: 'generate', allowed: ['generate_image', 'generate_audio', 'stitch_video', 'offload_gpu'] },
  'sme.log': { authority: 'record', allowed: ['store_evidence', 'index_replay', 'write_audit', 'verify_merkle'] },
  'sme.core': { authority: 'coordinate', allowed: ['dispatch', 'collect', 'validate', 'check_policy', 'resolve_conflicts', 'request_approval', 'publish'] },
};

export class SMEDispatchService {
  constructor() {
    this.governance = governance;
    this.moduleCache = new Map();
  }

  async routeTask(task, context) {
    const { sme, action, params, taskId } = task;

    // Verify SME exists
    const moduleConfig = SME_MODULES[sme];
    if (!moduleConfig) {
      return { taskId, ok: false, error: `Unknown SME module: ${sme}` };
    }

    // Verify action is allowed for this SME
    if (!moduleConfig.allowed.includes(action)) {
      return { taskId, ok: false, error: `Action ${action} not allowed for ${sme}` };
    }

    // Governance check for routing
    const govResult = await this.governance.evaluate({
      toolId: 'mrs.sme.dispatch',
      params: { sme, action, params },
      context: {
        actorIdentity: { id: sme, type: sme },  // Use full SME ID as type for contract mapping
        evidence: context.evidence,
        lattice: context.lattice,
        correlationId: context.correlationId,
      },
    });

    if (!govResult.allowed) {
      return { taskId, ok: false, error: `Governance denied routing: ${govResult.reason}` };
    }

    return {
      taskId,
      ok: true,
      sme,
      action,
      params,
      status: 'routed',
      routedAt: new Date().toISOString(),
      governance: govResult.meta,
    };
  }

  async executeTask(route, context) {
    const { taskId, sme, action, params } = route;

    // Get or create SME module instance
    const module = await this.getSMEModule(sme);
    if (!module) {
      return { taskId, ok: false, error: `Failed to load SME module: ${sme}` };
    }

    // Execute the action
    let output;
    try {
      output = await module[action](params, context);
    } catch (err) {
      return { taskId, ok: false, error: `SME execution failed: ${err.message}` };
    }

    // Collect evidence from SME
    const evidence = await module.collectEvidence?.(taskId, output, context) || {
      id: `ev-${sme}-${taskId}`,
      sme,
      action,
      output: output ? 'present' : 'none',
      timestamp: new Date().toISOString(),
    };

    return {
      taskId,
      ok: true,
      output,
      evidence,
      executedAt: new Date().toISOString(),
    };
  }

  async getSMEModule(sme) {
    if (this.moduleCache.has(sme)) {
      return this.moduleCache.get(sme);
    }

    // Dynamic import of SME module (would be actual implementation)
    // For now, return mock implementations
    const mockModule = this.createMockSME(sme);
    this.moduleCache.set(sme, mockModule);
    return mockModule;
  }

  createMockSME(sme) {
    const actions = SME_MODULES[sme]?.allowed || [];
    const module = {};

    for (const action of actions) {
      module[action] = async (params, context) => {
        // Simulate SME processing
        return { sme, action, params, result: `executed ${action} on ${sme}`, processedAt: new Date().toISOString() };
      };
    }

    module.collectEvidence = async (taskId, output, context) => ({
      id: `ev-${sme}-${taskId}`,
      sme,
      taskId,
      outputHash: output ? 'sha256-mock' : null,
      timestamp: new Date().toISOString(),
    });

    return module;
  }
}