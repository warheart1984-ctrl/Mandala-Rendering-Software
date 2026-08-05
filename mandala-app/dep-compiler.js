/**
 * DirectorExecutionPlan (DEP) Compiler
 * Transforms user intent into a versioned, executable DEP contract
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CloudAIClient } = require('./cloud-ai-client');

class DEPCompiler {
  constructor(cloudAI) {
    this.cloudAI = cloudAI;
    this.templates = new Map();
    this.loadTemplates();
  }

  loadTemplates() {
    // MRS 4D Scene Generation Workflow Template
    this.templates.set('mrs-4d-scene', {
      workflowType: 'mrs-4d-scene',
      version: '1.0.0',
      agents: [
        {
          agentId: 'director-planner',
          agentType: 'director',
          contractId: 'contract.director.v1',
          capabilities: ['plan', 'compile', 'coordinate', 'validate'],
          config: { role: 'planner' }
        },
        {
          agentId: 'mrs-renderer',
          agentType: 'specialist',
          contractId: 'contract.mrs.renderer.v1',
          capabilities: ['render-4d', 'project-4d-to-3d', 'export-png'],
          config: { engine: 'rt4d', surfaces: ['tesseract', 'clifford-torus', 'hopf', 'gyroid', 'hypertorus'] }
        },
        {
          agentId: 'vision-analyzer',
          agentType: 'specialist',
          contractId: 'contract.vision.analyzer.v1',
          capabilities: ['analyze-render', 'describe-geometry', 'assess-quality'],
          config: { models: ['qwen-vl', 'llava', 'gpt-4o-vision'] }
        },
        {
          agentId: 'prompt-engineer',
          agentType: 'specialist',
          contractId: 'contract.prompt.engineer.v1',
          capabilities: ['refine-diffusion-prompt', 'optimize-for-model', 'inject-style'],
          config: { targetModels: ['flux', 'sdxl', 'midjourney'] }
        },
        {
          agentId: 'diffusion-enhancer',
          agentType: 'specialist',
          contractId: 'contract.diffusion.enhancer.v1',
          capabilities: ['txt2img', 'img2img', 'controlnet-canny', 'controlnet-depth'],
          config: { providers: ['pollinations', 'huggingface', 'fal', 'replicate'] }
        },
        {
          agentId: 'quality-evaluator',
          agentType: 'inspector',
          contractId: 'contract.inspector.v1',
          capabilities: ['evaluate-fidelity', 'score-aesthetic', 'check-4d-preservation'],
          config: { minScore: 7, criteria: ['intent-fidelity', 'geometry-preservation', 'artistic-quality'] }
        },
        {
          agentId: 'evidence-collector',
          agentType: 'specialist',
          contractId: 'contract.evidence.collector.v1',
          capabilities: ['collect-provenance', 'generate-receipt', 'archive-audit'],
          config: { retentionDays: 90 }
        }
      ],
      executionGraph: {
        nodes: [
          { nodeId: 'plan-scene', agentId: 'director-planner', action: 'compile-scene-plan', inputs: { required: ['userIntent'] }, outputs: ['scenePlan'] },
          { nodeId: 'render-base', agentId: 'mrs-renderer', action: 'render-4d', inputs: { required: ['scenePlan'], fromNode: 'plan-scene', fromOutput: 'scenePlan' }, outputs: ['baseRenderPath'] },
          { nodeId: 'analyze-render', agentId: 'vision-analyzer', action: 'analyze', inputs: { required: ['baseRenderPath'], fromNode: 'render-base', fromOutput: 'baseRenderPath' }, outputs: ['analysis'] },
          { nodeId: 'refine-prompt', agentId: 'prompt-engineer', action: 'refine', inputs: { required: ['analysis', 'scenePlan'], fromNode: 'analyze-render', fromOutput: 'analysis' }, outputs: ['diffusionParams'] },
          { nodeId: 'enhance', agentId: 'diffusion-enhancer', action: 'enhance', inputs: { required: ['baseRenderPath', 'diffusionParams'], fromNode: 'render-base', fromOutput: 'baseRenderPath' }, outputs: ['enhancedImagePath'] },
          { nodeId: 'evaluate', agentId: 'quality-evaluator', action: 'evaluate', inputs: { required: ['enhancedImagePath', 'scenePlan'], fromNode: 'enhance', fromOutput: 'enhancedImagePath' }, outputs: ['evaluation'] },
          { nodeId: 'check-approval', agentId: 'director-planner', action: 'check-approval', inputs: { required: ['evaluation', 'scenePlan'], fromNode: 'evaluate', fromOutput: 'evaluation' }, outputs: ['approval'] },
          { nodeId: 'collect-evidence', agentId: 'evidence-collector', action: 'collect', inputs: { required: ['scenePlan', 'baseRenderPath', 'enhancedImagePath', 'evaluation', 'approval'] }, outputs: ['evidenceBundle', 'sceneSpec'] }
        ],
        edges: [
          { fromNode: 'plan-scene', toNode: 'render-base', condition: 'always' },
          { fromNode: 'render-base', toNode: 'analyze-render', condition: 'always' },
          { fromNode: 'analyze-render', toNode: 'refine-prompt', condition: 'always' },
          { fromNode: 'refine-prompt', toNode: 'enhance', condition: 'always' },
          { fromNode: 'enhance', toNode: 'evaluate', condition: 'always' },
          { fromNode: 'evaluate', toNode: 'check-approval', condition: 'always' },
          { fromNode: 'check-approval', toNode: 'enhance', condition: 'on-failure', transform: 'increment-iteration' },
          { fromNode: 'check-approval', toNode: 'collect-evidence', condition: 'on-success' }
        ]
      },
      evidenceRequirements: [
        { evidenceId: 'scene-plan', type: 'decision-log', requiredBy: ['director-planner'], validationRules: ['valid-json', 'contains-all-required-fields'] },
        { evidenceId: 'base-render', type: 'render-output', requiredBy: ['mrs-renderer'], validationRules: ['file-exists', 'valid-png', 'matches-dimensions'] },
        { evidenceId: 'vision-analysis', type: 'audit-log', requiredBy: ['vision-analyzer'], validationRules: ['non-empty', 'structured'] },
        { evidenceId: 'diffusion-params', type: 'decision-log', requiredBy: ['prompt-engineer'], validationRules: ['valid-json', 'contains-prompt'] },
        { evidenceId: 'enhanced-render', type: 'render-output', requiredBy: ['diffusion-enhancer'], validationRules: ['file-exists', 'valid-png'] },
        { evidenceId: 'quality-evaluation', type: 'test-results', requiredBy: ['quality-evaluator'], validationRules: ['score-present', 'critique-present'] },
        { evidenceId: 'approval-record', type: 'receipt', requiredBy: ['director-planner'], validationRules: ['decision-recorded'] },
        { evidenceId: 'scene-spec', type: 'scene-spec', requiredBy: ['evidence-collector'], validationRules: ['complete', 'reproducible'] }
      ],
      approvalGates: [
        { gateId: 'quality-gate', name: 'Quality Approval', type: 'automated-check', requiredApprovers: ['quality-evaluator'], criteria: ['score >= minScore', 'passes == true'], blocking: true },
        { gateId: 'human-review', name: 'Human Review (optional)', type: 'human-review', requiredApprovers: ['user'], criteria: ['user-approves'], blocking: false }
      ],
      successCriteria: [
        'Final score >= minScore (default 7)',
        'Director approval granted',
        'All evidence collected',
        'SceneSpec saved and valid'
      ],
      failureConditions: [
        { conditionId: 'render-failed', description: 'Base render failed', action: 'abort' },
        { conditionId: 'enhancement-failed', description: 'Diffusion enhancement failed after retries', action: 'escalate' },
        { conditionId: 'quality-below-threshold', description: 'Score below minScore after max iterations', action: 'escalate' },
        { conditionId: 'evidence-incomplete', description: 'Required evidence not collected', action: 'abort' }
      ],
      outputs: [
        { outputId: 'base-render', type: 'artifact', path: 'output/base-{seed}.png', contentType: 'image/png', required: true },
        { outputId: 'enhanced-render', type: 'artifact', path: 'output/enhanced-{timestamp}.png', contentType: 'image/png', required: true },
        { outputId: 'scene-spec', type: 'scene-spec', path: 'scenes/scene-{seed}-{timestamp}.json', contentType: 'application/json', required: true },
        { outputId: 'evidence-bundle', type: 'evidence', path: 'evidence/bundle-{workflowId}.json', contentType: 'application/json', required: true },
        { outputId: 'audit-archive', type: 'audit-archive', path: 'audit/{workflowId}/', contentType: 'application/zip', required: false }
      ],
      completionConditions: {
        allNodesComplete: true,
        allGatesPassed: true,
        allEvidenceCollected: true,
        minScore: 7
      },
      auditRequirements: {
        logLevel: 'standard',
        archivePath: 'audit/{workflowId}/',
        include: ['dep', 'agent-logs', 'evidence', 'approvals', 'timing', 'errors', 'decisions'],
        retentionDays: 365
      }
    });
  }

  /**
   * Compile user intent into a DirectorExecutionPlan
   */
  async compile(intent, options = {}) {
    const workflowId = crypto.randomUUID();
    const intentHash = crypto.createHash('sha256').update(intent).digest('hex').substring(0, 16);
    const template = this.templates.get(options.template || 'mrs-4d-scene');
    
    if (!template) {
      throw new Error(`Template not found: ${options.template}`);
    }

    const dep = {
      depVersion: '1.0.0',
      workflowId,
      objective: intent,
      intentHash,
      agents: template.agents.map(a => ({ ...a, config: { ...a.config, ...options.agentConfig?.[a.agentId] } })),
      executionGraph: this.instantiateGraph(template.executionGraph, options),
      evidenceRequirements: template.evidenceRequirements,
      approvalGates: template.approvalGates,
      successCriteria: template.successCriteria,
      failureConditions: template.failureConditions,
      outputs: this.instantiateOutputs(template.outputs, { workflowId, intentHash, seed: options.seed || Math.floor(Math.random() * 1e6) }),
      completionConditions: { ...template.completionConditions, minScore: options.minScore || template.completionConditions.minScore },
      auditRequirements: { ...template.auditRequirements, archivePath: template.auditRequirements.archivePath.replace('{workflowId}', workflowId) },
      provenance: {
        createdBy: 'DEPCompiler',
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        tools: ['DEPCompiler', 'MRS', 'CloudAI'],
        environment: {
          platform: process.platform,
          nodeVersion: process.version,
          mrsRoot: path.join(__dirname, '..')
        }
      }
    };

    // Validate DEP against schema (simplified)
    this.validateDEP(dep);

    return dep;
  }

  instantiateGraph(graph, options) {
    // Allow runtime parameter injection
    const nodes = graph.nodes.map(node => ({
      ...node,
      config: { ...node.config, ...options.nodeConfig?.[node.nodeId] },
      timeoutMs: options.timeouts?.[node.nodeId] || node.timeoutMs
    }));
    return { ...graph, nodes };
  }

  instantiateOutputs(outputs, vars) {
    return outputs.map(out => ({
      ...out,
      path: out.path
        .replace('{workflowId}', vars.workflowId)
        .replace('{seed}', vars.seed)
        .replace('{intentHash}', vars.intentHash)
        .replace('{timestamp}', Date.now())
    }));
  }

  validateDEP(dep) {
    const required = ['depVersion', 'workflowId', 'objective', 'agents', 'executionGraph', 'evidenceRequirements', 'approvalGates', 'successCriteria', 'failureConditions', 'outputs', 'completionConditions', 'auditRequirements', 'provenance'];
    for (const field of required) {
      if (!dep[field]) throw new Error(`DEP missing required field: ${field}`);
    }
    if (dep.agents.length === 0) throw new Error('DEP must have at least one agent');
    if (dep.executionGraph.nodes.length === 0) throw new Error('DEP must have at least one execution node');
  }

  getTemplate(name) {
    return this.templates.get(name);
  }

  listTemplates() {
    return Array.from(this.templates.keys());
  }
}

module.exports = { DEPCompiler };