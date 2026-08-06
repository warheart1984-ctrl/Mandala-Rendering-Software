/**
 * SME-Core: Constitutional Orchestration & Runtime - JavaScript Version
 */

const crypto = require('crypto');
const { SkiRuntime, CpuSubstrate } = require('./ski');
const { CapabilityPlanner } = require('./capability-planner');
const { HardwareProfileManager, CANONICAL_PROFILES } = require('./hardware-profiles');

class SmeCoreModule {
  constructor() {
    this.moduleId = 'sme-core';
    this.moduleType = 'core';
    this.config = null;
    this.skiRuntime = null;
    this.capabilityPlanner = null;
    this.hardwareProfileManager = null;
    this.txtModule = null;
    this.visModule = null;
    this.audModule = null;
    this.vidModule = null;
    this.genModule = null;
    this.logModule = null;
    this.activeChains = new Map();
    this.constitutionalRules = [];
    this.initialized = false;
  }

  async initialize(config) {
    this.config = config;
    this.skiRuntime = new SkiRuntime();
    this.constitutionalRules = config.constitutionalRules || [];
    
    // Initialize Hardware Profile Manager
    this.hardwareProfileManager = new (require('./hardware-profiles').HardwareProfileManager)();
    await this.hardwareProfileManager.detectProfile();
    
    // Initialize Capability Planner
    this.capabilityPlanner = new (require('./capability-planner').CapabilityPlanner)(
      this.hardwareProfileManager.getActiveProfile() || require('./hardware-profiles').CANONICAL_PROFILES.LAPTOP,
      this.createDefaultModelProfile(),
      this.createDefaultPolicyContext()
    );
    
    // Register default CPU substrate
    const cpuSubstrate = new (require('./ski').CpuSubstrate)();
    await cpuSubstrate.initialize();
    this.skiRuntime.registerSubstrate(cpuSubstrate);
    
    // Initialize engines
    this.initializeEngines(config);
    
    this.initialized = true;
    console.log('[SME-CORE] Constitutional runtime initialized with Capability Planner');
  }

  createDefaultModelProfile() {
    return {
      txt: { modelName: 'sovereign-300M', modelVersion: 'v0.2.0', parameters: 300000000, quantization: 'Q4_K_M', contextWindow: 4096, estimatedFLOPsPerToken: 600000000, estimatedRAMGB: 1.5, supportedModalities: ['text'] },
      vis: { modelName: 'mobilevit-xs', modelVersion: 'v1.0.0', parameters: 2300000, quantization: 'INT8', contextWindow: 224 * 224 * 3, estimatedFLOPsPerToken: 500000000, estimatedRAMGB: 0.1, supportedModalities: ['image'] },
      aud: { modelName: 'whisper-base', modelVersion: 'v1.0.0', parameters: 74000000, quantization: 'INT8', contextWindow: 30 * 16000, estimatedFLOPsPerToken: 1000000000, estimatedRAMGB: 0.3, supportedModalities: ['audio'] },
      vid: { modelName: 'uniform-16frame', modelVersion: 'v1.0.0', parameters: 5000000, quantization: 'INT8', contextWindow: 16 * 224 * 224 * 3, estimatedFLOPsPerToken: 2000000000, estimatedRAMGB: 0.2, supportedModalities: ['video'] },
      gen: { modelName: 'flux-schnell', modelVersion: 'v1.0.0', parameters: 12000000000, quantization: 'FP16', contextWindow: 1024 * 1024 * 3, estimatedFLOPsPerToken: 10000000000, estimatedRAMGB: 8, supportedModalities: ['image', 'audio', 'video'] }
    };
  }

  createDefaultPolicyContext() {
    return {
      ciemRules: [],
      offloadRules: [{ ruleId: 'default-offload', dataTypes: ['public', 'internal'], allowedEndpoints: [], requireEncryption: true, maxFLOPs: 1e13 }],
      safetyConstraints: [],
      privacyConstraints: []
    };
  }

  initializeEngines(config) {
    // Authority Engine
    config.authorityEngine = {
      evaluate: async (request) => this.evaluateAuthority(request),
      revoke: async (grantId) => this.revokeAuthority(grantId),
      validate: async (grant) => this.validateAuthority(grant)
    };
    
    // Validation Engine
    config.validationEngine = {
      validate: async (input, grant) => this.validateInput(input, grant),
      registerValidator: (modality, validator) => this.registerValidator(modality, validator)
    };
    
    // Fusion Engine
    config.fusionEngine = {
      fuse: async (embeddings, context) => this.fuseEmbeddings(embeddings, context),
      registerFusionStrategy: (name, strategy) => this.registerFusionStrategy(name, strategy)
    };
    
    // Decision Engine
    config.decisionEngine = {
      decide: async (input) => this.makeDecision(input)
    };
    
    // Evidence & Replay Engine
    config.evidenceEngine = {
      collect: async (evidence) => this.collectEvidence(evidence),
      finalize: async (chainId) => this.finalizeEvidence(chainId),
      verify: async (bundle) => this.verifyEvidence(bundle)
    };
    
    // Audit Engine
    config.auditEngine = {
      archive: async (bundle) => this.archiveEvidence(bundle),
      query: async (query) => this.queryAudit(query),
      generateReport: async (chainId) => this.generateAuditReport(chainId)
    };
    
    // Register modules
    for (const [id, module] of config.modules) {
      this.registerModuleInternal(id, module);
    }
  }

  registerModuleInternal(id, module) {
    switch (module.moduleType) {
      case 'txt': this.txtModule = module; break;
      case 'vis': this.visModule = module; break;
      case 'aud': this.audModule = module; break;
      case 'vid': this.vidModule = module; break;
      case 'gen': this.genModule = module; break;
      case 'log': this.logModule = module; break;
    }
    console.log(`[SME-CORE] Registered module: ${id} (${module.moduleType})`);
  }

  async execute(input) {
    this.assertInitialized();
    
    const chainId = this.generateChainId();
    const startTime = Date.now();
    
    console.log(`[SME-CORE] Executing chain: ${chainId}`);
    
    const trace = {
      chainId,
      stages: [],
      startTime,
      endTime: 0,
      success: false
    };
    
    const chain = {
      chainId,
      startTime,
      intent: null,
      authorityGrant: null,
      validationResult: { passed: false, checks: [], warnings: [] },
      capabilityPlan: null,
      embeddings: { metadata: { modelVersions: new Map(), dimensions: new Map(), timestamp: Date.now() } },
      trace,
      evidence: new Map(),
      decisions: []
    };
    
    this.activeChains.set(chainId, chain);
    
    try {
      // STAGE 0: CAPABILITY PLANNING
      await this.recordStage(trace, 'planning', async () => {
        const userRequest = this.buildUserRequest(input);
        chain.capabilityPlan = await this.capabilityPlanner.plan(userRequest);
        
        // Hardware profile matching
        const matchResult = this.hardwareProfileManager.matchCapabilityPlan(chain.capabilityPlan);
        if (!matchResult.compatible) {
          console.warn(`[SME-CORE] Capability plan issues: ${matchResult.issues.join(', ')}`);
          for (const rec of matchResult.recommendations) {
            console.log(`[SME-CORE] Recommendation: ${rec}`);
          }
        }
        
        // Log capability plan evidence
        chain.evidence.set(chain.capabilityPlan.planEvidence.evidenceId, {
          evidenceId: chain.capabilityPlan.planEvidence.evidenceId,
          type: 'capability-plan',
          moduleId: 'sme-core',
          data: chain.capabilityPlan,
          timestamp: Date.now(),
          modelVersion: '1.0.0',
          hash: this.hashObject(chain.capabilityPlan)
        });
      });
      
      // STAGE 1: INTENT & AUTHORITY
      await this.recordStage(trace, 'authority', async () => {
        chain.intent = this.parseIntent(input);
        const authRequest = {
          userId: input.authorityContext?.userId || 'anonymous',
          intent: chain.intent,
          context: input.authorityContext || { userId: 'anonymous', role: 'user', permissions: [] }
        };
        chain.authorityGrant = await this.config.authorityEngine.evaluate(authRequest);
      });
      
      // STAGE 2: VALIDATION
      await this.recordStage(trace, 'validation', async () => {
        chain.validationResult = await this.config.validationEngine.validate({ ...input, intent: chain.intent }, chain.authorityGrant);
        if (!chain.validationResult.passed) {
          throw new Error(`Validation failed: ${chain.validationResult.checks.filter(c => !c.passed).map(c => c.name).join(', ')}`);
        }
      });
      
      // STAGE 3: MODALITY INGESTION & FUSION
      await this.recordStage(trace, 'fusion', async () => {
        chain.embeddings = await this.ingestModalities(input, chain.authorityGrant);
        chain.embeddings.fused = await this.config.fusionEngine.fuse(chain.embeddings, chain.intent.goal);
      });
      
      // STAGE 4: DECISION (SME-TXT via SKI)
      await this.recordStage(trace, 'decision', async () => {
        const decisionInput = {
          intent: chain.intent,
          fusedEmbedding: chain.embeddings.fused,
          authorityGrant: chain.authorityGrant,
          validationResult: chain.validationResult,
          context: chain.intent.goal
        };
        const decisionOutput = await this.config.decisionEngine.decide(decisionInput);
        chain.decisions.push(decisionOutput.decisionRecord);
        
        // Execute decision actions
        await this.executeActions(decisionOutput.actions, chain);
      });
      
      // STAGE 5: EVIDENCE COLLECTION
      await this.recordStage(trace, 'evidence', async () => {
        await this.config.evidenceEngine.finalize(chain.chainId);
      });
      
      // STAGE 6: VERIFICATION & REPLAY
      await this.recordStage(trace, 'verification', async () => {
        await this.verifyExecution(chain);
      });
      
      // STAGE 7: AUDIT
      await this.recordStage(trace, 'audit', async () => {
        await this.config.auditEngine.archive(await this.buildEvidenceBundle(chain));
      });
      
      trace.success = true;
      trace.endTime = Date.now();
      
      // Build final response
      const response = this.buildResponse(chain);
      
      // Archive
      if (this.logModule) {
        await this.logModule.recordTrace(trace);
      }
      
      return {
        success: trace.success,
        chainId,
        response,
        constitutionalTrace: trace,
        evidenceBundle: await this.buildEvidenceBundle(chain)
      };
      
    } catch (error) {
      trace.success = false;
      trace.endTime = Date.now();
      trace.stages.push({
        stage: 'failed',
        moduleId: 'sme-core',
        inputEvidenceIds: [],
        outputEvidenceIds: [],
        durationMs: Date.now() - startTime,
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      });
      
      console.error(`[SME-CORE] Chain ${chainId} failed:`, error);
      throw error;
    } finally {
      this.activeChains.delete(chainId);
    }
  }

  async recordStage(trace, stage, fn) {
    const stageStart = Date.now();
    const chain = this.activeChains.get(trace.chainId);
    const inputEvidenceIds = chain ? Array.from(chain.evidence.keys()) : [];
    
    try {
      await fn();
      
      trace.stages.push({
        stage,
        moduleId: `sme-${stage}`,
        inputEvidenceIds,
        outputEvidenceIds: chain ? Array.from(chain.evidence.keys()).filter(id => !inputEvidenceIds.includes(id)) : [],
        durationMs: Date.now() - stageStart,
        success: true,
        errors: []
      });
    } catch (error) {
      trace.stages.push({
        stage,
        moduleId: `sme-${stage}`,
        inputEvidenceIds,
        outputEvidenceIds: [],
        durationMs: Date.now() - stageStart,
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      });
      throw error;
    }
  }

  async evaluateAuthority(request) {
    const permittedModalities = [];
    const constraints = {
      maxTokens: 2048,
      maxResolution: { width: 1024, height: 1024 },
      maxDurationSec: 30,
      allowedModels: [],
      safetyLevel: 'standard',
      resourceBudget: { maxCpuPercent: 80, maxMemoryMb: 4096, maxDurationMs: 60000, allowGpuOffload: true }
    };
    
    for (const modality of request.intent.modalities) {
      const allowed = this.constitutionalRules
        .filter(r => r.modality === modality || r.modality === 'all')
        .every(r => r.condition(request));
      if (allowed) permittedModalities.push(modality);
    }
    
    return {
      grantId: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      requester: request.userId,
      permittedModalities,
      constraints,
      expiresAt: Date.now() + 3600000,
      signature: this.generateSignature(JSON.stringify({ requester: request.userId, modalities: permittedModalities }))
    };
  }

  async revokeAuthority(grantId) {
    console.log(`[SME-AUTH] Revoked grant: ${grantId}`);
  }

  async validateAuthority(grant) {
    return Date.now() < grant.expiresAt;
  }

  registerValidator(modality, validator) {
    if (!this.validators) this.validators = new Map();
    if (!this.validators.has(modality)) this.validators.set(modality, []);
    this.validators.get(modality).push(validator);
  }

  async validateInput(input, grant) {
    const checks = [];
    const warnings = [];
    
    for (const modality of input.intent.modalities) {
      if (!grant.permittedModalities.includes(modality)) {
        checks.push({ checkId: `modality-${modality}`, name: `Modality Permission: ${modality}`, passed: false, details: `Modality ${modality} not permitted` });
      } else {
        checks.push({ checkId: `modality-${modality}`, name: `Modality Permission: ${modality}`, passed: true });
      }
    }
    
    if (input.rawMedia.images) {
      for (const img of input.rawMedia.images) {
        if (img.length > 10 * 1024 * 1024) warnings.push('Image exceeds 10MB, may be downscaled');
      }
    }
    if (input.rawMedia.audio) {
      for (const aud of input.rawMedia.audio) {
        if (aud.length > 50 * 1024 * 1024) warnings.push('Audio exceeds 50MB, may be truncated');
      }
    }
    if (input.rawMedia.video) {
      for (const vid of input.rawMedia.video) {
        if (vid.length > 500 * 1024 * 1024) warnings.push('Video exceeds 500MB, may be truncated');
      }
    }
    
    if (this.validators) {
      for (const modality of input.intent.modalities) {
        const validators = this.validators.get(modality) || [];
        for (const validator of validators) {
          const result = await validator.check(input.rawMedia);
          checks.push(result);
        }
      }
    }
    
    const passed = checks.every(c => c.passed);
    return { passed, checks, warnings };
  }

  fusionStrategies = new Map();
  registerFusionStrategy(name, strategy) { this.fusionStrategies.set(name, strategy); }

  async fuseEmbeddings(embeddings, context) {
    const embeddingsList = [];
    const dims = [];
    
    if (embeddings.text) { embeddingsList.push(embeddings.text); dims.push(embeddings.text.length); }
    if (embeddings.vision) { embeddingsList.push(embeddings.vision); dims.push(embeddings.vision.length); }
    if (embeddings.audio) { embeddingsList.push(embeddings.audio); dims.push(embeddings.audio.length); }
    if (embeddings.video) { embeddingsList.push(embeddings.video); dims.push(embeddings.video.length); }
    
    if (embeddingsList.length === 0) return new Float32Array(512);
    
    const totalDim = dims.reduce((a, b) => a + b, 0);
    const fused = new Float32Array(totalDim);
    let offset = 0;
    for (const emb of embeddingsList) { fused.set(emb, offset); offset += emb.length; }
    
    const targetDim = 512;
    if (totalDim !== targetDim) {
      const projected = new Float32Array(targetDim);
      const stride = totalDim / targetDim;
      for (let i = 0; i < targetDim; i++) {
        let sum = 0;
        for (let j = 0; j < stride; j++) {
          const idx = Math.floor(i * stride + j);
          if (idx < totalDim) sum += fused[idx];
        }
        projected[i] = sum / stride;
      }
      return projected;
    }
    return fused;
  }

  async makeDecision(input) {
    if (!this.txtModule) throw new Error('SME-TXT not registered');
    
    const prompt = this.buildDecisionPrompt(input);
    const txtOutput = await this.txtModule.process({
      prompt,
      embeddings: { fused: input.fusedEmbedding, metadata: { modelVersions: new Map(), dimensions: new Map(), timestamp: Date.now() } },
      authorityGrant: input.authorityGrant,
      maxTokens: 256,
      temperature: 0.3
    });
    
    const actions = this.parseDecisionActions(txtOutput.text);
    return { decisionRecord: txtOutput.decisionRecord, actions };
  }

  buildDecisionPrompt(input) {
    return `[DECISION]
Intent: ${input.intent.goal}
Modalities: ${input.intent.modalities.join(', ')}
Authority: ${input.authorityGrant.permittedModalities.join(', ')}
Validation: ${input.validationResult.passed ? 'PASSED' : 'FAILED'}

Available Actions:
- generate_text
- generate_image
- generate_audio
- generate_video
- query_knowledge
- notify

Based on the intent and fused multimodal context, decide which actions to take.
Output as JSON array of actions with: actionId, type, moduleId, parameters, priority, dependsOn.
[/DECISION]`;
  }

  parseDecisionActions(text) {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const actions = JSON.parse(jsonMatch[0]);
        return actions.map((a, i) => ({
          actionId: a.actionId || `action-${i}`,
          type: a.type,
          moduleId: a.moduleId || this.inferModule(a.type),
          parameters: a.parameters || {},
          priority: a.priority || 1,
          dependsOn: a.dependsOn || []
        }));
      }
    } catch {}
    return [{
      actionId: 'default-text',
      type: 'generate_text',
      moduleId: 'sme-txt',
      parameters: { prompt: 'Provide a response to the user intent' },
      priority: 1,
      dependsOn: []
    }];
  }

  inferModule(actionType) {
    switch (actionType) {
      case 'generate_text': return 'sme-txt';
      case 'generate_image': case 'generate_audio': case 'generate_video': return 'sme-gen';
      case 'query_knowledge': return 'sme-txt';
      case 'notify': return 'sme-core';
      default: return 'sme-txt';
    }
  }

  async executeActions(actions, chain) {
    actions.sort((a, b) => b.priority - a.priority);
    for (const action of actions) {
      await this.executeAction(action, chain);
    }
  }

  async executeAction(action, chain) {
    switch (action.moduleId) {
      case 'sme-gen': await this.executeGenAction(action, chain); break;
      case 'sme-txt': await this.executeTxtAction(action, chain); break;
      default: console.warn(`[SME-CORE] Unknown module: ${action.moduleId}`);
    }
  }

  async executeGenAction(action, chain) {
    if (!this.genModule) return;
    const grant = chain.authorityGrant;
    
    switch (action.type) {
      case 'generate_image':
        const imgResult = await this.genModule.generateImage({
          prompt: action.parameters.prompt || chain.intent.goal,
          width: action.parameters.width || 512,
          height: action.parameters.height || 512,
          steps: action.parameters.steps || 20,
          guidanceScale: action.parameters.guidanceScale || 7.5,
          authorityGrant: grant
        });
        const imgData = { imageData: imgResult.imageData, mimeType: imgResult.mimeType };
        chain.evidence.set(imgResult.evidenceId, {
          evidenceId: imgResult.evidenceId, type: 'generation', moduleId: 'sme-gen',
          data: imgData, timestamp: Date.now(), modelVersion: imgResult.modelVersion,
          hash: this.hashData(imgData)
        });
        break;
      case 'generate_audio':
        const audResult = await this.genModule.generateAudio({
          text: action.parameters.text || chain.intent.goal,
          voice: action.parameters.voice, speed: action.parameters.speed,
          authorityGrant: grant
        });
        const audData = { audioData: audResult.audioData, mimeType: audResult.mimeType };
        chain.evidence.set(audResult.evidenceId, {
          evidenceId: audResult.evidenceId, type: 'generation', moduleId: 'sme-gen',
          data: audData, timestamp: Date.now(), modelVersion: audResult.modelVersion,
          hash: this.hashData(audData)
        });
        break;
      case 'generate_video':
        const vidResult = await this.genModule.generateVideo({
          prompt: action.parameters.prompt || chain.intent.goal,
          width: action.parameters.width || 512, height: action.parameters.height || 512,
          durationSec: action.parameters.durationSec || 5, fps: action.parameters.fps || 8,
          authorityGrant: grant
        });
        const vidData = { videoData: vidResult.videoData, mimeType: vidResult.mimeType };
        chain.evidence.set(vidResult.evidenceId, {
          evidenceId: vidResult.evidenceId, type: 'generation', moduleId: 'sme-gen',
          data: vidData, timestamp: Date.now(), modelVersion: vidResult.modelVersion,
          hash: this.hashData(vidData)
        });
        break;
    }
  }

  async executeTxtAction(action, chain) {
    if (!this.txtModule) return;
    const result = await this.txtModule.generate({
      prompt: action.parameters.prompt || chain.intent.goal,
      maxTokens: action.parameters.maxTokens || 512,
      temperature: action.parameters.temperature || 0.7,
      topP: action.parameters.topP || 0.9
    });
    const evidenceId = this.generateEvidenceId();
    const data = { text: result.text };
    chain.evidence.set(evidenceId, {
      evidenceId, type: 'generation', moduleId: 'sme-txt',
      data, timestamp: Date.now(),
      modelVersion: this.txtModule.getModelInfo().modelVersion,
      hash: this.hashData(data)
    });
  }

  async ingestModalities(input, grant) {
    const embeddings = { metadata: { modelVersions: new Map(), dimensions: new Map(), timestamp: Date.now() } };
    
    if (input.rawMedia.text && this.txtModule) {
      const txtResult = await this.txtModule.process({ prompt: input.rawMedia.text, authorityGrant: grant });
      embeddings.text = new Float32Array(512);
      embeddings.metadata.dimensions.set('text', 512);
      embeddings.metadata.modelVersions.set('text', this.txtModule.getModelInfo().modelVersion);
    }
    
    if (input.rawMedia.images && this.visModule) {
      for (const img of input.rawMedia.images) {
        const visResult = await this.visModule.encode({ imageData: img, mimeType: 'image/png', authorityGrant: grant, extractFeatures: true });
        embeddings.vision = visResult.embedding;
        embeddings.metadata.dimensions.set('vision', visResult.embedding.length);
        embeddings.metadata.modelVersions.set('vision', visResult.modelVersion);
      }
    }
    
    if (input.rawMedia.audio && this.audModule) {
      for (const aud of input.rawMedia.audio) {
        const audResult = await this.audModule.transcribe({ audioData: aud, mimeType: 'audio/wav', authorityGrant: grant });
        embeddings.audio = audResult.embedding;
        embeddings.metadata.dimensions.set('audio', audResult.embedding.length);
        embeddings.metadata.modelVersions.set('audio', audResult.modelVersion);
      }
    }
    
    if (input.rawMedia.video && this.vidModule) {
      for (const vid of input.rawMedia.video) {
        const vidResult = await this.vidModule.analyze({ videoData: vid, mimeType: 'video/mp4', authorityGrant: grant });
        embeddings.video = vidResult.globalEmbedding;
        embeddings.metadata.dimensions.set('video', vidResult.globalEmbedding.length);
        embeddings.metadata.modelVersions.set('video', vidResult.modelVersion);
      }
    }
    
    return embeddings;
  }

  async collectEvidence(evidence) { console.log(`[SME-EVR] Collected: ${evidence.evidenceId}`); }
  
  async finalizeEvidence(chainId) { 
    const chain = this.activeChains.get(chainId);
    return {
      bundleId: `bundle-${chainId}`,
      evidence: chain?.evidence,
      decisionRecords: chain?.decisions || [],
      provenance: { userId: 'anonymous', requestId: chainId, timestamp: Date.now(), modelVersions: new Map(), configHash: this.hashObject(this.config) }
    };
  }

  async buildEvidenceBundle(chain) {
    return {
      bundleId: `bundle-${chain.chainId}`,
      evidence: chain.evidence,
      decisionRecords: chain.decisions,
      provenance: { userId: 'anonymous', requestId: chain.chainId, timestamp: Date.now(), modelVersions: chain.embeddings.metadata.modelVersions, configHash: this.hashObject(this.config) }
    };
  }

  async verifyExecution(chain) {
    for (const [id, evidence] of chain.evidence) {
      const computedHash = evidence.type === 'generation' ? this.hashData(evidence.data) : this.hashString(JSON.stringify(evidence.data));
      if (evidence.hash && evidence.hash !== computedHash) throw new Error(`Evidence integrity check failed: ${id}`);
    }
  }

  async archiveEvidence(bundle) { return `archived-${bundle.bundleId}`; }
  async queryAudit(query) { return []; }
  async generateAuditReport(chainId) { return { chainId, report: 'Generated' }; }

  buildResponse(chain) {
    const response = { metadata: { decisionRecord: chain.decisions[chain.decisions.length - 1], evidenceIds: Array.from(chain.evidence.keys()), modelVersions: chain.embeddings.metadata.modelVersions, executionTimeMs: Date.now() - chain.startTime, resourceUsage: { cpuMs: 0, peakMemoryMb: 0 } } };
    
    for (const [id, evidence] of chain.evidence) {
      if (evidence.type === 'generation') {
        const data = evidence.data;
        if (data.imageData) { response.images = response.images || []; response.images.push(data.imageData); }
        if (data.audioData) { response.audio = response.audio || []; response.audio.push(data.audioData); }
        if (data.videoData) { response.video = response.video || []; response.video.push(data.videoData); }
        if (data.text) response.text = data.text;
      }
    }
    return response;
  }

  parseIntent(input) {
    return { intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, modalities: this.detectModalities(input), goal: input.rawMedia.text || 'Process multimodal input', constraints: {}, priority: 'normal' };
  }

  detectModalities(input) {
    const modalities = [];
    if (input.rawMedia.text) modalities.push('text');
    if (input.rawMedia.images?.length) modalities.push('image');
    if (input.rawMedia.audio?.length) modalities.push('audio');
    if (input.rawMedia.video?.length) modalities.push('video');
    return modalities.length > 0 ? modalities : ['text'];
  }

  buildUserRequest(input) {
    const modalities = this.detectModalities(input);
    const constraints = {};
    if (input.rawMedia.text) constraints.text = true;
    if (input.rawMedia.images?.length) constraints.images = input.rawMedia.images.length;
    if (input.rawMedia.audio?.length) constraints.audio = input.rawMedia.audio.length;
    if (input.rawMedia.video?.length) constraints.video = input.rawMedia.video.length;
    if (input.authorityContext) { constraints.userId = input.authorityContext.userId; constraints.role = input.authorityContext.role; }
    return { requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, intent: input.rawMedia.text || 'Process multimodal input', modalities, media: input.rawMedia, constraints, privacyLevel: 'internal', timestamp: Date.now() };
  }

  generateChainId() { return `chain-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
  generateSignature(data) { return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32); }
  hashData(data) { const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(JSON.stringify(data)); return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32); }
  hashString(str) { return crypto.createHash('sha256').update(str).digest('hex').slice(0, 32); }
  hashObject(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32); }

  assertInitialized() { if (!this.initialized) throw new Error('SME-CORE not initialized'); }

  registerModule(moduleId, module) { this.registerModuleInternal(moduleId, module); }
  unregisterModule(moduleId) {
    switch (moduleId) { case 'sme-txt': this.txtModule = null; break; case 'sme-vis': this.visModule = null; break; case 'sme-aud': this.audModule = null; break; case 'sme-vid': this.vidModule = null; break; case 'sme-gen': this.genModule = null; break; case 'sme-log': this.logModule = null; break; }
  }

  getModelInfo() { return { moduleId: this.moduleId, moduleType: this.moduleType, skiRuntime: this.skiRuntime, activeChains: this.activeChains.size, modules: { txt: !!this.txtModule, vis: !!this.visModule, aud: !!this.audModule, vid: !!this.vidModule, gen: !!this.genModule, log: !!this.logModule } }; }

  async healthCheck() {
    const modules = {};
    if (this.txtModule) modules.txt = await this.txtModule.healthCheck();
    if (this.visModule) modules.vis = await this.visModule.healthCheck();
    if (this.audModule) modules.aud = await this.audModule.healthCheck();
    if (this.vidModule) modules.vid = await this.vidModule.healthCheck();
    if (this.genModule) modules.gen = await this.genModule.healthCheck();
    if (this.logModule) modules.log = await this.logModule.healthCheck();
    return { moduleId: this.moduleId, healthy: Object.values(modules).every(m => m), modules, skiSubstrates: Array.from(this.skiRuntime?.substrates?.keys() || []) };
  }

  async shutdown() {
    if (this.txtModule) await this.txtModule.shutdown();
    if (this.visModule) await this.visModule.shutdown();
    if (this.audModule) await this.audModule.shutdown();
    if (this.vidModule) await this.vidModule.shutdown();
    if (this.genModule) await this.genModule.shutdown();
    if (this.logModule) await this.logModule.shutdown();
    this.initialized = false;
    console.log('[SME-CORE] Shutdown complete');
  }
}

module.exports = { SmeCoreModule };