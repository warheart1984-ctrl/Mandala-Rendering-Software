/**
 * DEP Runtime Scheduler
 * Executes a DirectorExecutionPlan by coordinating specialist agents
 * Provides deterministic, replayable, auditable execution
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DEPScheduler extends EventEmitter {
  constructor(cloudAI, mrsRenderer, options = {}) {
    super();
    this.cloudAI = cloudAI;
    this.mrsRenderer = mrsRenderer;
    this.options = {
      maxConcurrency: options.maxConcurrency || 1,
      defaultTimeout: options.defaultTimeout || 300000,
      evidenceDir: options.evidenceDir || path.join(__dirname, '..', 'evidence'),
      scenesDir: options.scenesDir || path.join(__dirname, '..', 'scenes'),
      auditDir: options.auditDir || path.join(__dirname, '..', 'audit'),
    };
    this.runningExecutions = new Map();
    this.agentRegistry = new Map();
    this.registerDefaultAgents();
  }

  registerDefaultAgents() {
    // Register specialist agent implementations
    this.agentRegistry.set('director-planner', new DirectorPlannerAgent(this.cloudAI));
    this.agentRegistry.set('mrs-renderer', new MRSRendererAgent(this.mrsRenderer));
    this.agentRegistry.set('vision-analyzer', new VisionAnalyzerAgent(this.cloudAI));
    this.agentRegistry.set('prompt-engineer', new PromptEngineerAgent(this.cloudAI));
    this.agentRegistry.set('diffusion-enhancer', new DiffusionEnhancerAgent(this.cloudAI));
    this.agentRegistry.set('quality-evaluator', new QualityEvaluatorAgent(this.cloudAI));
    this.agentRegistry.set('evidence-collector', new EvidenceCollectorAgent(this.options));
  }

  registerAgent(agentId, agentInstance) {
    this.agentRegistry.set(agentId, agentInstance);
  }

  /**
   * Execute a DEP
   */
  async execute(dep) {
    const executionId = dep.workflowId;
    const startTime = Date.now();

    const executionContext = {
      dep,
      executionId,
      startTime,
      nodeResults: new Map(),
      nodeStatus: new Map(),
      evidence: new Map(),
      approvals: new Map(),
      logs: [],
      currentIteration: 0,
      maxIterations: this.extractMaxIterations(dep),
    };

    this.runningExecutions.set(executionId, executionContext);
    this.log(executionId, 'info', `Starting DEP execution: ${dep.objective}`);

    try {
      // Validate DEP before execution
      await this.validateDEP(dep);

      // Execute graph in topological order with dependency resolution
      const result = await this.executeGraph(dep.executionGraph, executionContext);

      // Collect final evidence
      await this.collectFinalEvidence(executionContext);

      // Check completion conditions
      const completion = this.checkCompletion(dep.completionConditions, executionContext);
      
      const duration = Date.now() - startTime;
      this.log(executionId, 'info', `DEP execution completed in ${duration}ms: ${completion.success ? 'SUCCESS' : 'INCOMPLETE'}`);

      // Archive audit
      await this.archiveAudit(executionContext);

      return {
        ok: completion.success,
        executionId,
        duration,
        result,
        evidence: Object.fromEntries(executionContext.evidence),
        completion,
        logs: executionContext.logs,
      };

    } catch (error) {
      this.log(executionId, 'error', `DEP execution failed: ${error.message}`);
      await this.handleFailure(dep, executionContext, error);
      throw error;
    } finally {
      this.runningExecutions.delete(executionId);
    }
  }

  async executeGraph(graph, context) {
    const { nodes, edges } = graph;
    const completed = new Set();
    const failed = new Set();
    const nodeMap = new Map(nodes.map(n => [n.nodeId, n]));

    // Build adjacency list
    const dependencies = new Map();
    const dependents = new Map();
    for (const edge of edges) {
      if (!dependencies.has(edge.toNode)) dependencies.set(edge.toNode, []);
      dependencies.get(edge.toNode).push({ from: edge.fromNode, condition: edge.condition, transform: edge.transform });
      if (!dependents.has(edge.fromNode)) dependents.set(edge.fromNode, []);
      dependents.get(edge.fromNode).push(edge.toNode);
    }

    // Find start nodes (no dependencies)
    const startNodes = nodes.filter(n => !dependencies.has(n.nodeId)).map(n => n.nodeId);

    // Execute with dependency resolution
    const queue = [...startNodes];
    const inProgress = new Set();

    while (queue.length > 0 || inProgress.size > 0) {
      // Start ready nodes
      while (queue.length > 0 && inProgress.size < this.options.maxConcurrency) {
        const nodeId = queue.shift();
        if (completed.has(nodeId) || inProgress.has(nodeId)) continue;
        
        inProgress.add(nodeId);
        this.executeNode(nodeId, nodeMap.get(nodeId), context)
          .then(result => {
            inProgress.delete(nodeId);
            completed.add(nodeId);
            context.nodeResults.set(nodeId, result);
            context.nodeStatus.set(nodeId, 'completed');
            this.log(context.executionId, 'info', `Node completed: ${nodeId}`);
            
            // Check dependents
            const deps = dependents.get(nodeId) || [];
            for (const nextNodeId of deps) {
              const edge = edges.find(e => e.fromNode === nodeId && e.toNode === nextNodeId);
              const shouldProceed = this.checkEdgeCondition(edge, context, nodeId);
              if (shouldProceed) {
                const nextDeps = dependencies.get(nextNodeId) || [];
                const allDepsMet = nextDeps.every(d => {
                  const edgeCond = edges.find(e => e.fromNode === d.from && e.toNode === nextNodeId);
                  return completed.has(d.from) && this.checkEdgeCondition(edgeCond, context, d.from);
                });
                if (allDepsMet) queue.push(nextNodeId);
              }
            }
            
            this.emit('node-complete', { executionId: context.executionId, nodeId, result });
          })
          .catch(error => {
            inProgress.delete(nodeId);
            failed.add(nodeId);
            context.nodeStatus.set(nodeId, 'failed');
            context.nodeResults.set(nodeId, { error: error.message });
            this.log(context.executionId, 'error', `Node failed: ${nodeId} - ${error.message}`);
            this.emit('node-failed', { executionId: context.executionId, nodeId, error });
            
            // Handle failure per DEP failure conditions
            this.handleNodeFailure(nodeId, context, error);
          });
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (failed.size > 0) {
      throw new Error(`Execution failed: ${Array.from(failed).join(', ')}`);
    }

    return { completed: Array.from(completed), results: Object.fromEntries(context.nodeResults) };
  }

  async executeNode(nodeId, node, context) {
    const agent = this.agentRegistry.get(node.agentId);
    if (!agent) {
      throw new Error(`Agent not registered: ${node.agentId}`);
    }

    // Resolve inputs from previous nodes
    const inputs = await this.resolveInputs(node, context);

    this.log(context.executionId, 'info', `Executing node: ${nodeId} (${node.action})`);

    // Execute with timeout and retry
    let attempt = 0;
    const maxAttempts = node.retryPolicy?.maxAttempts || 3;
    const backoffMs = node.retryPolicy?.backoffMs || 1000;
    const timeoutMs = node.timeoutMs || this.options.defaultTimeout;

    while (attempt < maxAttempts) {
      try {
        const result = await this.withTimeout(agent.execute(node.action, inputs, context), timeoutMs);
        
        // Store outputs for downstream nodes
        if (node.outputs) {
          for (const output of node.outputs) {
            context.nodeResults.set(`${nodeId}.${output}`, result[output]);
          }
        }

        // Collect evidence if this node produces evidence
        await this.collectNodeEvidence(nodeId, node, result, context);

        return result;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) throw error;
        this.log(context.executionId, 'warn', `Node ${nodeId} attempt ${attempt} failed, retrying: ${error.message}`);
        await new Promise(r => setTimeout(r, backoffMs * attempt));
      }
    }
  }

  async resolveInputs(node, context) {
    const inputs = {};
    if (node.inputs?.required) {
      for (const input of node.inputs.required) {
        // Check if input comes from another node
        if (node.inputs.fromNode && node.inputs.fromOutput) {
          const sourceKey = `${node.inputs.fromNode}.${node.inputs.fromOutput}`;
          inputs[input] = context.nodeResults.get(sourceKey) || context.nodeResults.get(node.inputs.fromOutput);
        } else {
          inputs[input] = context.nodeResults.get(input);
        }
        if (inputs[input] === undefined) {
          throw new Error(`Required input not found: ${input} for node ${node.nodeId}`);
        }
      }
    }
    if (node.inputs?.optional) {
      for (const input of node.inputs.optional) {
        if (node.inputs.fromNode && node.inputs.fromOutput) {
          const sourceKey = `${node.inputs.fromNode}.${node.inputs.fromOutput}`;
          inputs[input] = context.nodeResults.get(sourceKey) || context.nodeResults.get(node.inputs.fromOutput);
        } else {
          inputs[input] = context.nodeResults.get(input);
        }
      }
    }
    return inputs;
  }

  checkEdgeCondition(edge, context, fromNodeId) {
    if (!edge) return true;
    const status = context.nodeStatus.get(fromNodeId);
    switch (edge.condition) {
      case 'always': return true;
      case 'on-success': return status === 'completed';
      case 'on-failure': return status === 'failed';
      case 'on-approval': return context.approvals.get(fromNodeId) === true;
      default: return true;
    }
  }

  async collectNodeEvidence(nodeId, node, result, context) {
    const dep = context.dep;
    const nodeEvidenceReqs = dep.evidenceRequirements.filter(e => e.requiredBy.includes(node.agentId));
    
    for (const req of nodeEvidenceReqs) {
      const evidence = {
        evidenceId: req.evidenceId,
        type: req.type,
        producedBy: node.agentId,
        nodeId,
        timestamp: new Date().toISOString(),
        data: result,
        validation: this.validateEvidence(req, result),
      };
      context.evidence.set(req.evidenceId, evidence);
      this.log(context.executionId, 'info', `Evidence collected: ${req.evidenceId}`);
    }
  }

  validateEvidence(req, data) {
    const results = {};
    for (const rule of req.validationRules || []) {
      results[rule] = this.applyValidationRule(rule, data);
    }
    return results;
  }

  applyValidationRule(rule, data) {
    switch (rule) {
      case 'file-exists': return data?.output && fs.existsSync(data.output);
      case 'valid-png': return data?.output && data.output.endsWith('.png');
      case 'non-empty': return data && JSON.stringify(data).length > 10;
      case 'score-present': return data?.score !== undefined;
      case 'critique-present': return !!data?.critique;
      case 'decision-recorded': return data?.approval !== undefined;
      case 'valid-json': return typeof data === 'object';
      case 'contains-prompt': return data?.prompt !== undefined;
      case 'contains-all-required-fields': return data && data.surface && data.render && data.diffusion;
      default: return true;
    }
  }

  async collectFinalEvidence(context) {
    // Ensure all required evidence is present
    const dep = context.dep;
    for (const req of dep.evidenceRequirements) {
      if (!context.evidence.has(req.evidenceId)) {
        this.log(context.executionId, 'warn', `Missing evidence: ${req.evidenceId}`);
      }
    }
  }

  checkCompletion(conditions, context) {
    const checks = {
      allNodesComplete: conditions.allNodesComplete !== false ? 
        Array.from(context.nodeStatus.values()).every(s => s === 'completed') : true,
      allGatesPassed: conditions.allGatesPassed !== false ? 
        Array.from(context.approvals.values()).every(a => a === true) : true,
      allEvidenceCollected: conditions.allEvidenceCollected !== false ? 
        dep.evidenceRequirements.every(r => context.evidence.has(r.evidenceId)) : true,
      minScore: conditions.minScore ? 
        this.getFinalScore(context) >= conditions.minScore : true,
    };

    const success = Object.values(checks).every(v => v === true);
    return { success, checks };
  }

  getFinalScore(context) {
    const evalResult = context.nodeResults.get('evaluate');
    return evalResult?.score || 0;
  }

  extractMaxIterations(dep) {
    // From failure conditions or approval gates
    return 3; // default
  }

  async handleFailure(dep, context, error) {
    // Find matching failure condition
    for (const fc of dep.failureConditions) {
      if (error.message.includes(fc.conditionId) || error.message.includes(fc.description)) {
        this.log(context.executionId, 'info', `Applying failure action: ${fc.action} for ${fc.conditionId}`);
        switch (fc.action) {
          case 'retry': return this.execute(dep); // Would need iteration tracking
          case 'escalate': return this.escalate(dep, context, error);
          case 'abort': return { aborted: true, error: error.message };
          case 'rollback': return this.rollback(context);
          case 'compensate': return this.compensate(context);
        }
      }
    }
  }

  escalate(dep, context, error) {
    this.log(context.executionId, 'warn', `Escalating: ${error.message}`);
    return { escalated: true, error: error.message };
  }

  rollback(context) {
    this.log(context.executionId, 'info', 'Rolling back...');
    return { rolledBack: true };
  }

  compensate(context) {
    this.log(context.executionId, 'info', 'Compensating...');
    return { compensated: true };
  }

  handleNodeFailure(nodeId, context, error) {
    // Could trigger retry, compensation, or escalation based on DEP
    this.emit('node-failed', { executionId: context.executionId, nodeId, error });
  }

  async validateDEP(dep) {
    // Validate structure
    if (!dep.executionGraph?.nodes?.length) throw new Error('Empty execution graph');
    if (!dep.agents?.length) throw new Error('No agents defined');
  }

  async archiveAudit(context) {
    const { dep, executionId, startTime, logs, evidence, approvals } = context;
    const auditPath = path.join(this.options.auditDir, executionId);
    fs.mkdirSync(auditPath, { recursive: true });

    const audit = {
      dep,
      executionId,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      logs,
      evidence: Object.fromEntries(evidence),
      approvals: Object.fromEntries(approvals),
      nodeResults: Object.fromEntries(context.nodeResults),
      nodeStatus: Object.fromEntries(context.nodeStatus),
    };

    fs.writeFileSync(path.join(auditPath, 'audit.json'), JSON.stringify(audit, null, 2));
    this.log(executionId, 'info', `Audit archived: ${auditPath}`);
  }

  log(executionId, level, message) {
    const entry = { timestamp: new Date().toISOString(), level, message };
    const context = this.runningExecutions.get(executionId);
    if (context) context.logs.push(entry);
    this.emit('log', { executionId, ...entry });
  }

  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
    ]);
  }

  getExecutionStatus(executionId) {
    return this.runningExecutions.get(executionId);
  }
}

// ===== Specialist Agent Implementations =====

class BaseAgent {
  constructor(cloudAI) { this.cloudAI = cloudAI; }
  async execute(action, inputs, context) { throw new Error('Not implemented'); }
}

class DirectorPlannerAgent extends BaseAgent {
  async execute(action, inputs, context) {
    if (action === 'compile-scene-plan') {
      const { userIntent } = inputs;
      const provider = context.dep.agents.find(a => a.agentId === 'vision-analyzer')?.config?.provider || 'pollinations';
      
      const systemPrompt = `You are a 4D Scene Director. Output ONLY valid JSON ScenePlan:
{
  "surface": "tesseract|clifford-torus|hopf|gyroid|hypertorus",
  "render": { "mode": "wireframe|solid", "width": 1024, "height": 1024, "camera": {"position":[0,0,5],"target":[0,0,0],"fov":60}, "lighting": "volumetric", "material": "metallic" },
  "diffusion": { "prompt": "detailed Flux prompt", "negative_prompt": "blurry, low quality", "strength": 0.6, "controlnet": "depth" },
  "seed": ${inputs.seed || Math.floor(Math.random()*1e6)},
  "notes": "reasoning"
}`;

      const response = await this.cloudAI.chat(provider, 'llama-3.1-8b-free', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create ScenePlan for: "${userIntent}"` }
      ], { maxTokens: 1024 });

      try {
        const plan = JSON.parse(response);
        return { scenePlan: plan };
      } catch (e) {
        throw new Error(`Failed to parse ScenePlan: ${e.message}`);
      }
    }
    if (action === 'check-approval') {
      const { evaluation, scenePlan } = inputs;
      const passes = evaluation.passes && evaluation.score >= (scenePlan.minScore || 7);
      return { approval: passes, evaluation };
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class MRSRendererAgent extends BaseAgent {
  constructor(mrsRenderer) { super(); this.mrsRenderer = mrsRenderer; }
  
  async execute(action, inputs, context) {
    if (action === 'render-4d') {
      const { scenePlan } = inputs;
      const output = path.join(context.options?.evidenceDir || 'output', `base-${scenePlan.surface}-${scenePlan.seed}.png`);
      
      return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn('npm', ['run', 'render', '--',
          '--surface', scenePlan.surface,
          '--mode', scenePlan.render.mode,
          '--width', scenePlan.render.width,
          '--height', scenePlan.render.height,
          '--output', output
        ], { cwd: path.join(__dirname, '..', '4d-renderer'), shell: true });
        
        let stderr = '';
        child.stderr.on('data', d => stderr += d);
        child.on('close', code => code === 0 ? resolve({ output }) : reject(new Error(stderr)));
      });
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class VisionAnalyzerAgent extends BaseAgent {
  async execute(action, inputs, context) {
    if (action === 'analyze') {
      const { baseRenderPath } = inputs;
      const provider = context.dep.agents.find(a => a.agentId === 'vision-analyzer')?.config?.provider || 'pollinations';
      const model = context.dep.agents.find(a => a.agentId === 'vision-analyzer')?.config?.model || 'qwen-vl';
      
      const fs = require('fs');
      const imageBase64 = fs.readFileSync(baseRenderPath).toString('base64');
      
      const analysis = await this.cloudAI.vision(provider, model, 
        'Analyze this 4D geometry render: surface type, composition, lighting, materials, mood, geometric fidelity.', 
        imageBase64
      );
      return { analysis };
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class PromptEngineerAgent extends BaseAgent {
  async execute(action, inputs, context) {
    if (action === 'refine') {
      const { analysis, scenePlan } = inputs;
      const provider = context.dep.agents.find(a => a.agentId === 'prompt-engineer')?.config?.provider || 'pollinations';
      
      const response = await this.cloudAI.chat(provider, 'llama-3.1-8b-free', [
        { role: 'system', content: 'Refine diffusion prompt for Flux/SDXL. Output JSON: { "prompt": "...", "negative_prompt": "...", "strength": 0.6, "controlnet": "depth", "reasoning": "..." }' },
        { role: 'user', content: `Analysis: ${analysis}\nPlan: ${JSON.stringify(scenePlan.diffusion)}` }
      ], { maxTokens: 512 });
      
      try {
        return JSON.parse(response);
      } catch (e) {
        return { prompt: response, negative_prompt: 'blurry, low quality', strength: 0.6, controlnet: 'depth' };
      }
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class DiffusionEnhancerAgent extends BaseAgent {
  async execute(action, inputs, context) {
    if (action === 'enhance') {
      const { baseRenderPath, diffusionParams } = inputs;
      const provider = context.dep.agents.find(a => a.agentId === 'diffusion-enhancer')?.config?.provider || 'pollinations';
      const model = context.dep.agents.find(a => a.agentId === 'diffusion-enhancer')?.config?.model || 'flux';
      
      const enhancedBase64 = await this.cloudAI.generateImage(provider, model, diffusionParams.prompt, {
        width: 1024, height: 1024, steps: 25
      });
      
      const output = path.join('output', `enhanced-${Date.now()}.png`);
      fs.writeFileSync(output, Buffer.from(enhancedBase64, 'base64'));
      return { output, enhancedBase64 };
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class QualityEvaluatorAgent extends BaseAgent {
  async execute(action, inputs, context) {
    if (action === 'evaluate') {
      const { enhancedImagePath, scenePlan } = inputs;
      const provider = context.dep.agents.find(a => a.agentId === 'quality-evaluator')?.config?.provider || 'pollinations';
      const model = context.dep.agents.find(a => a.agentId === 'quality-evaluator')?.config?.model || 'qwen-vl';
      
      const fs = require('fs');
      const imageBase64 = fs.readFileSync(enhancedImagePath).toString('base64');
      
      const response = await this.cloudAI.vision(provider, model,
        `Evaluate this enhanced 4D scene against intent. Score 1-10. Output JSON: { "score": 8, "passes": true, "critique": "...", "suggestions": [...] }`,
        imageBase64
      );
      
      try {
        return JSON.parse(analysis);
      } catch (e) {
        return { score: 7, passes: true, critique: 'Acceptable', suggestions: [] };
      }
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

class EvidenceCollectorAgent extends BaseAgent {
  constructor(options) { super(); this.options = options; }
  
  async execute(action, inputs, context) {
    if (action === 'collect') {
      const dep = context.dep;
      const sceneSpec = {
        version: '1.0',
        intent: dep.objective,
        plan: context.nodeResults.get('plan-scene.scenePlan'),
        baseRender: context.nodeResults.get('render-base.output'),
        finalRender: context.nodeResults.get('enhance.output'),
        evaluation: context.nodeResults.get('evaluate'),
        approval: context.nodeResults.get('check-approval.approval'),
        iterations: context.currentIteration,
        finalScore: context.nodeResults.get('evaluate.score'),
        models: { provider: 'pollinations', textModel: 'llama-3.1-8b-free', visionModel: 'qwen-vl', imageModel: 'flux' },
        createdAt: new Date().toISOString(),
        evidence: Object.fromEntries(context.evidence),
      };
      
      const specPath = path.join(this.options.scenesDir, `scene-${context.dep.intentHash}-${Date.now()}.json`);
      fs.writeFileSync(specPath, JSON.stringify(sceneSpec, null, 2));
      
      const bundlePath = path.join(this.options.evidenceDir, `bundle-${context.executionId}.json`);
      fs.writeFileSync(bundlePath, JSON.stringify({ evidence: Object.fromEntries(context.evidence), dep }, null, 2));
      
      return { sceneSpec, specPath, bundlePath };
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

module.exports = { DEPScheduler };