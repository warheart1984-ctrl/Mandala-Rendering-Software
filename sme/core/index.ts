/**
 * SME-Core: Constitutional Orchestration & Runtime
 * Authority → Validation → Fusion → Decision → Evidence → Replay → Audit
 */

import { 
  SmeCoreIFC, SmeCoreConfig, SmeCoreInput, SmeCoreOutput,
  SmeModule, ModuleHealth, SmeAuthEngine, SmeValEngine,
  SmeFuseEngine, SmeDecEngine, SmeEvrEngine, SmeAuditEngine,
  AuthorityGrant, AuthorityRequest, AuthorityContext,
  ValidationResult, Validator, DecisionRecord, DecisionInput,
  DecisionOutput, DecisionAction, EvidenceRecord, EvidenceBundle,
  ProvenanceRecord, ConstitutionalTrace, TraceStage,
  GovernedResponse, ResponseMetadata, ResourceUsage,
  ConstitutionalRule, SkiRuntime, SkiKernelCall,
  UserIntent, RawMediaMap, Modality, EvidenceId, ModelVersion,
  SmeTxtIFC, SmeVisIFC, SmeAudIFC, SmeVidIFC, SmeGenIFC, SmeLogIFC,
  MultimodalEmbeddings
} from '../contracts';

import { CapabilityPlanner } from './capability-planner';
import { HardwareProfileManager, CANONICAL_PROFILES } from './hardware-profiles';

interface ActiveChain {
  chainId: string;
  startTime: number;
  intent: UserIntent;
  authorityGrant: AuthorityGrant;
  validationResult: ValidationResult;
  capabilityPlan: any; // CapabilityPlan
  embeddings: MultimodalEmbeddings;
  trace: ConstitutionalTrace;
  evidence: Map<EvidenceId, EvidenceRecord>;
  decisions: DecisionRecord[];
}

export class SmeCoreModule implements SmeCoreIFC, SmeModule {
  public readonly moduleId = 'sme-core';
  public readonly moduleType = 'core' as const;
  
  private config: SmeCoreConfig | null = null;
  private skiRuntime: SkiRuntime | null = null;
  private txtModule: SmeTxtIFC | null = null;
  private visModule: SmeVisIFC | null = null;
  private audModule: SmeAudIFC | null = null;
  private vidModule: SmeVidIFC | null = null;
  private genModule: SmeGenIFC | null = null;
  private logModule: SmeLogIFC | null = null;
  
  private activeChains: Map<string, ActiveChain> = new Map();
  private constitutionalRules: ConstitutionalRule[] = [];
  private initialized = false;

  private capabilityPlanner: CapabilityPlanner | null = null;
  private hardwareProfileManager: any = null;
  
  async initialize(config: SmeCoreConfig): Promise<void> {
    this.config = config;
    this.skiRuntime = new SkiRuntime();
    this.constitutionalRules = config.constitutionalRules;
    
    // Initialize Capability Planner
    this.hardwareProfileManager = new (await import('./hardware-profiles')).HardwareProfileManager();
    await this.hardwareProfileManager.detectProfile();
    
    this.capabilityPlanner = new CapabilityPlanner(
      this.hardwareProfileManager.getActiveProfile() || CANONICAL_PROFILES.LAPTOP,
      this.createDefaultModelProfile(),
      this.createDefaultPolicyContext()
    );
    
    // Register default CPU substrate
    const { CpuSubstrate } = await import('./ski');
    const cpuSubstrate = new CpuSubstrate();
    await cpuSubstrate.initialize();
    this.skiRuntime.registerSubstrate(cpuSubstrate);
    
    // Initialize engines
    this.initializeEngines(config);
    
    this.initialized = true;
    console.log('[SME-CORE] Constitutional runtime initialized with Capability Planner');
  }

  private createDefaultModelProfile(): any {
    return {
      txt: { modelName: 'sovereign-300M', modelVersion: 'v0.2.0' as ModelVersion, parameters: 300_000_000, quantization: 'Q4_K_M', contextWindow: 4096, estimatedFLOPsPerToken: 600_000_000, estimatedRAMGB: 1.5, supportedModalities: ['text'] },
      vis: { modelName: 'mobilevit-xs', modelVersion: 'v1.0.0' as ModelVersion, parameters: 2_300_000, quantization: 'INT8', contextWindow: 224 * 224 * 3, estimatedFLOPsPerToken: 500_000_000, estimatedRAMGB: 0.1, supportedModalities: ['image'] },
      aud: { modelName: 'whisper-base', modelVersion: 'v1.0.0' as ModelVersion, parameters: 74_000_000, quantization: 'INT8', contextWindow: 30 * 16000, estimatedFLOPsPerToken: 1_000_000_000, estimatedRAMGB: 0.3, supportedModalities: ['audio'] },
      vid: { modelName: 'uniform-16frame', modelVersion: 'v1.0.0' as ModelVersion, parameters: 5_000_000, quantization: 'INT8', contextWindow: 16 * 224 * 224 * 3, estimatedFLOPsPerToken: 2_000_000_000, estimatedRAMGB: 0.2, supportedModalities: ['video'] },
      gen: { modelName: 'flux-schnell', modelVersion: 'v1.0.0' as ModelVersion, parameters: 12_000_000_000, quantization: 'FP16', contextWindow: 1024 * 1024 * 3, estimatedFLOPsPerToken: 10_000_000_000, estimatedRAMGB: 8, supportedModalities: ['image', 'audio', 'video'] }
    };
  }

  private createDefaultPolicyContext(): any {
    return {
      ciemRules: [],
      offloadRules: [{ ruleId: 'default-offload', dataTypes: ['public', 'internal'], allowedEndpoints: [], requireEncryption: true, maxFLOPs: 1e13 }],
      safetyConstraints: [],
      privacyConstraints: []
    };
  }

  private initializeEngines(config: SmeCoreConfig): void {
    // Authority Engine
    config.authorityEngine = {
      evaluate: async (request: AuthorityRequest) => this.evaluateAuthority(request),
      revoke: async (grantId: string) => this.revokeAuthority(grantId),
      validate: async (grant: AuthorityGrant) => this.validateAuthority(grant)
    };
    
    // Validation Engine
    config.validationEngine = {
      validate: async (input: SmeCoreInput, grant: AuthorityGrant) => this.validateInput(input, grant),
      registerValidator: (modality: Modality, validator: Validator) => this.registerValidator(modality, validator)
    };
    
    // Fusion Engine
    config.fusionEngine = {
      fuse: async (embeddings: MultimodalEmbeddings, context: string) => this.fuseEmbeddings(embeddings, context),
      registerFusionStrategy: (name: string, strategy: any) => this.registerFusionStrategy(name, strategy)
    };
    
    // Decision Engine
    config.decisionEngine = {
      decide: async (input: DecisionInput) => this.makeDecision(input)
    };
    
    // Evidence & Replay Engine
    config.evidenceEngine = {
      collect: async (evidence: EvidenceRecord) => this.collectEvidence(evidence),
      finalize: async (chainId: string) => this.finalizeEvidence(chainId),
      verify: async (bundle: EvidenceBundle) => this.verifyEvidence(bundle)
    };
    
    // Audit Engine
    config.auditEngine = {
      archive: async (bundle: EvidenceBundle) => this.archiveEvidence(bundle),
      query: async (query: any) => this.queryAudit(query),
      generateReport: async (chainId: string) => this.generateAuditReport(chainId)
    };
    
    // Register modules
    for (const [id, module] of config.modules) {
      this.registerModuleInternal(id, module);
    }
  }

  private registerModuleInternal(id: string, module: SmeModule): void {
    switch (module.moduleType) {
      case 'txt': this.txtModule = module as SmeTxtIFC; break;
      case 'vis': this.visModule = module as SmeVisIFC; break;
      case 'aud': this.audModule = module as SmeAudIFC; break;
      case 'vid': this.vidModule = module as SmeVidIFC; break;
      case 'gen': this.genModule = module as SmeGenIFC; break;
      case 'log': this.logModule = module as SmeLogIFC; break;
    }
    console.log(`[SME-CORE] Registered module: ${id} (${module.moduleType})`);
  }

  // ============================================================
  // CORE EXECUTION
  // ============================================================

  async execute(input: SmeCoreInput): Promise<SmeCoreOutput> {
    this.assertInitialized();
    
    const chainId = this.generateChainId();
    const startTime = Date.now();
    
    console.log(`[SME-CORE] Executing chain: ${chainId}`);
    
    // Initialize trace
    const trace: ConstitutionalTrace = {
      chainId,
      stages: [],
      startTime,
      endTime: 0,
      success: false
    };
    
    const chain: ActiveChain = {
      chainId,
      startTime,
      intent: null as any,
      authorityGrant: null as any,
      validationResult: { passed: false, checks: [], warnings: [] },
      capabilityPlan: null as any,
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
        chain.capabilityPlan = await this.capabilityPlanner!.plan(userRequest);
        
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
          modelVersion: '1.0.0' as ModelVersion,
          hash: this.hashObject(chain.capabilityPlan)
        });
      });
      
      // STAGE 1: INTENT & AUTHORITY
      await this.recordStage(trace, 'authority', async () => {
        chain.intent = this.parseIntent(input);
        const authRequest: AuthorityRequest = {
          userId: input.authorityContext?.userId || 'anonymous',
          intent: chain.intent,
          context: input.authorityContext || { userId: 'anonymous', role: 'user', permissions: [] }
        };
        chain.authorityGrant = await config.authorityEngine.evaluate(authRequest);
      });
      
      // STAGE 2: VALIDATION
      await this.recordStage(trace, 'validation', async () => {
        chain.validationResult = await config.validationEngine.validate(input, chain.authorityGrant);
        if (!chain.validationResult.passed) {
          throw new Error(`Validation failed: ${chain.validationResult.checks.filter(c => !c.passed).map(c => c.name).join(', ')}`);
        }
      });
      
      // STAGE 3: MODALITY INGESTION & FUSION
      await this.recordStage(trace, 'fusion', async () => {
        chain.embeddings = await this.ingestModalities(input, chain.authorityGrant);
        chain.embeddings.fused = await config.fusionEngine.fuse(chain.embeddings, chain.intent.goal);
      });
      
      // STAGE 4: DECISION (SME-TXT via SKI)
      await this.recordStage(trace, 'decision', async () => {
        const decisionInput: DecisionInput = {
          intent: chain.intent,
          fusedEmbedding: chain.embeddings.fused!,
          authorityGrant: chain.authorityGrant,
          validationResult: chain.validationResult,
          context: chain.intent.goal
        };
        const decisionOutput = await config.decisionEngine.decide(decisionInput);
        chain.decisions.push(decisionOutput.decisionRecord);
        
        // Execute decision actions
        await this.executeActions(decisionOutput.actions, chain);
      });
      
      // STAGE 5: EVIDENCE COLLECTION
      await this.recordStage(trace, 'evidence', async () => {
        await config.evidenceEngine.finalize(chainId);
      });
      
      // STAGE 6: VERIFICATION & REPLAY
      await this.recordStage(trace, 'verification', async () => {
        await this.verifyExecution(chain);
      });
      
      // STAGE 7: AUDIT
      await this.recordStage(trace, 'audit', async () => {
        await config.auditEngine.archive(await this.buildEvidenceBundle(chain));
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

  private async recordStage(trace: ConstitutionalTrace, stage: TraceStage['stage'], fn: () => Promise<void>): Promise<void> {
    const stageStart = Date.now();
    const inputEvidenceIds = Array.from(this.activeChains.get(trace.chainId)?.evidence.keys() || []);
    
    try {
      await fn();
      
      trace.stages.push({
        stage,
        moduleId: `sme-${stage}`,
        inputEvidenceIds,
        outputEvidenceIds: Array.from(this.activeChains.get(trace.chainId)?.evidence.keys() || []).filter(
          id => !inputEvidenceIds.includes(id)
        ),
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

  // ============================================================
  // AUTHORITY ENGINE
  // ============================================================

  private async evaluateAuthority(request: AuthorityRequest): Promise<AuthorityGrant> {
    // Apply constitutional rules
    const permittedModalities: Modality[] = [];
    const constraints = {
      maxTokens: 2048,
      maxResolution: { width: 1024, height: 1024 },
      maxDurationSec: 30,
      allowedModels: [],
      safetyLevel: 'standard' as const,
      resourceBudget: {
        maxCpuPercent: 80,
        maxMemoryMb: 4096,
        maxDurationMs: 60000,
        allowGpuOffload: true
      }
    };
    
    // Check each modality against rules
    for (const modality of request.intent.modalities) {
      const allowed = this.constitutionalRules
        .filter(r => r.modality === modality || r.modality === 'all')
        .every(r => r.condition(request));
      
      if (allowed) {
        permittedModalities.push(modality);
      }
    }
    
    return {
      grantId: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      requester: request.userId,
      permittedModalities,
      constraints,
      expiresAt: Date.now() + 3600000, // 1 hour
      signature: this.generateSignature(JSON.stringify({ requester: request.userId, modalities: permittedModalities }))
    };
  }

  private async revokeAuthority(grantId: string): Promise<void> {
    // In production, maintain grant registry
    console.log(`[SME-AUTH] Revoked grant: ${grantId}`);
  }

  private async validateAuthority(grant: AuthorityGrant): Promise<boolean> {
    return Date.now() < grant.expiresAt;
  }

  // ============================================================
  // VALIDATION ENGINE
  // ============================================================

  private validators: Map<Modality, Validator[]> = new Map();

  private registerValidator(modality: Modality, validator: Validator): void {
    if (!this.validators.has(modality)) this.validators.set(modality, []);
    this.validators.get(modality)!.push(validator);
  }

  private async validateInput(input: SmeCoreInput, grant: AuthorityGrant): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];
    const warnings: string[] = [];
    
    // Check modality permissions
    for (const modality of input.intent.modalities) {
      if (!grant.permittedModalities.includes(modality)) {
        checks.push({
          checkId: `modality-${modality}`,
          name: `Modality Permission: ${modality}`,
          passed: false,
          details: `Modality ${modality} not permitted by authority grant`
        });
      } else {
        checks.push({
          checkId: `modality-${modality}`,
          name: `Modality Permission: ${modality}`,
          passed: true
        });
      }
    }
    
    // Validate raw media
    if (input.rawMedia.images) {
      for (const img of input.rawMedia.images) {
        if (img.length > 10 * 1024 * 1024) {
          warnings.push('Image exceeds 10MB, may be downscaled');
        }
      }
    }
    
    if (input.rawMedia.audio) {
      for (const aud of input.rawMedia.audio) {
        if (aud.length > 50 * 1024 * 1024) {
          warnings.push('Audio exceeds 50MB, may be truncated');
        }
      }
    }
    
    if (input.rawMedia.video) {
      for (const vid of input.rawMedia.video) {
        if (vid.length > 500 * 1024 * 1024) {
          warnings.push('Video exceeds 500MB, may be truncated');
        }
      }
    }
    
    // Run custom validators
    for (const modality of input.intent.modalities) {
      const validators = this.validators.get(modality) || [];
      for (const validator of validators) {
        const result = await validator.check(input.rawMedia);
        checks.push(result);
      }
    }
    
    const passed = checks.every(c => c.passed);
    return { passed, checks, warnings };
  }

  // ============================================================
  // FUSION ENGINE
  // ============================================================

  private fusionStrategies: Map<string, any> = new Map();

  private registerFusionStrategy(name: string, strategy: any): void {
    this.fusionStrategies.set(name, strategy);
  }

  private async fuseEmbeddings(embeddings: MultimodalEmbeddings, context: string): Promise<Float32Array> {
    // Simple concatenation + projection (in production, use learned fusion)
    const embeddingsList: Float32Array[] = [];
    const dims: number[] = [];
    
    if (embeddings.text) { embeddingsList.push(embeddings.text); dims.push(embeddings.text.length); }
    if (embeddings.vision) { embeddingsList.push(embeddings.vision); dims.push(embeddings.vision.length); }
    if (embeddings.audio) { embeddingsList.push(embeddings.audio); dims.push(embeddings.audio.length); }
    if (embeddings.video) { embeddingsList.push(embeddings.video); dims.push(embeddings.video.length); }
    
    if (embeddingsList.length === 0) {
      return new Float32Array(512); // Default fused dim
    }
    
    // Concatenate
    const totalDim = dims.reduce((a, b) => a + b, 0);
    const fused = new Float32Array(totalDim);
    let offset = 0;
    for (const emb of embeddingsList) {
      fused.set(emb, offset);
      offset += emb.length;
    }
    
    // Project to standard dimension (512) via simple pooling
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

  // ============================================================
  // DECISION ENGINE
  // ============================================================

  private async makeDecision(input: DecisionInput): Promise<DecisionOutput> {
    // Use SME-TXT for decision making
    if (!this.txtModule) {
      throw new Error('SME-TXT not registered');
    }
    
    // Build decision prompt
    const prompt = this.buildDecisionPrompt(input);
    
    const txtOutput = await this.txtModule.process({
      prompt,
      embeddings: { fused: input.fusedEmbedding, metadata: { modelVersions: new Map(), dimensions: new Map(), timestamp: Date.now() } },
      authorityGrant: input.authorityGrant,
      maxTokens: 1024,
      temperature: 0.3
    });
    
    // Parse decision from LLM output
    const actions = this.parseDecisionActions(txtOutput.text);
    
    return {
      decisionRecord: txtOutput.decisionRecord,
      actions
    };
  }

  private buildDecisionPrompt(input: DecisionInput): string {
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

  private parseDecisionActions(text: string): DecisionAction[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const actions = JSON.parse(jsonMatch[0]);
        return actions.map((a: any, i: number) => ({
          actionId: a.actionId || `action-${i}`,
          type: a.type,
          moduleId: a.moduleId || this.inferModule(a.type),
          parameters: a.parameters || {},
          priority: a.priority || 1,
          dependsOn: a.dependsOn || []
        }));
      }
    } catch {
      // Fallback: simple keyword-based decision
    }
    
    // Fallback: default actions based on intent
    return [{
      actionId: 'default-text',
      type: 'generate_text',
      moduleId: 'sme-txt',
      parameters: { prompt: 'Provide a response to the user intent' },
      priority: 1,
      dependsOn: []
    }];
  }

  private inferModule(actionType: string): string {
    switch (actionType) {
      case 'generate_text': return 'sme-txt';
      case 'generate_image': return 'sme-gen';
      case 'generate_audio': return 'sme-gen';
      case 'generate_video': return 'sme-gen';
      case 'query_knowledge': return 'sme-txt';
      case 'notify': return 'sme-core';
      default: return 'sme-txt';
    }
  }

  private async executeActions(actions: DecisionAction[], chain: ActiveChain): Promise<void> {
    // Sort by priority
    actions.sort((a, b) => b.priority - a.priority);
    
    for (const action of actions) {
      // Check dependencies
      for (const dep of action.dependsOn) {
        // In production, wait for dependency
      }
      
      await this.executeAction(action, chain);
    }
  }

  private async executeAction(action: DecisionAction, chain: ActiveChain): Promise<void> {
    switch (action.moduleId) {
      case 'sme-gen':
        await this.executeGenAction(action, chain);
        break;
      case 'sme-txt':
        await this.executeTxtAction(action, chain);
        break;
      default:
        console.warn(`[SME-CORE] Unknown module for action: ${action.moduleId}`);
    }
  }

  private async executeGenAction(action: DecisionAction, chain: ActiveChain): Promise<void> {
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
        chain.evidence.set(imgResult.evidenceId, {
          evidenceId: imgResult.evidenceId,
          type: 'generation',
          moduleId: 'sme-gen',
          data: imgResult,
          timestamp: Date.now(),
          modelVersion: imgResult.modelVersion,
          hash: this.hashData(imgResult.imageData)
        });
        break;
        
      case 'generate_audio':
        const audResult = await this.genModule.generateAudio({
          text: action.parameters.text || chain.intent.goal,
          voice: action.parameters.voice,
          speed: action.parameters.speed,
          authorityGrant: grant
        });
        chain.evidence.set(audResult.evidenceId, {
          evidenceId: audResult.evidenceId,
          type: 'generation',
          moduleId: 'sme-gen',
          data: audResult,
          timestamp: Date.now(),
          modelVersion: audResult.modelVersion,
          hash: this.hashData(audResult.audioData)
        });
        break;
        
      case 'generate_video':
        const vidResult = await this.genModule.generateVideo({
          prompt: action.parameters.prompt || chain.intent.goal,
          width: action.parameters.width || 512,
          height: action.parameters.height || 512,
          durationSec: action.parameters.durationSec || 5,
          fps: action.parameters.fps || 8,
          authorityGrant: grant
        });
        chain.evidence.set(vidResult.evidenceId, {
          evidenceId: vidResult.evidenceId,
          type: 'generation',
          moduleId: 'sme-gen',
          data: vidResult,
          timestamp: Date.now(),
          modelVersion: vidResult.modelVersion,
          hash: this.hashData(vidResult.videoData)
        });
        break;
    }
  }

  private async executeTxtAction(action: DecisionAction, chain: ActiveChain): Promise<void> {
    if (!this.txtModule) return;
    
    const result = await this.txtModule.generate({
      prompt: action.parameters.prompt || chain.intent.goal,
      maxTokens: action.parameters.maxTokens || 512,
      temperature: action.parameters.temperature || 0.7,
      topP: action.parameters.topP || 0.9
    });
    
    chain.evidence.set(this.generateEvidenceId(), {
      evidenceId: this.generateEvidenceId(),
      type: 'generation',
      moduleId: 'sme-txt',
      data: { text: result.text },
      timestamp: Date.now(),
      modelVersion: this.txtModule.getModelInfo().modelVersion,
      hash: this.hashString(result.text)
    });
  }

  // ============================================================
  // MODALITY INGESTION
  // ============================================================

  private async ingestModalities(input: SmeCoreInput, grant: AuthorityGrant): Promise<MultimodalEmbeddings> {
    const embeddings: MultimodalEmbeddings = { metadata: { modelVersions: new Map(), dimensions: new Map(), timestamp: Date.now() } };
    
    // Text
    if (input.rawMedia.text) {
      const txtResult = await this.txtModule!.process({
        prompt: input.rawMedia.text,
        authorityGrant: grant
      });
      embeddings.text = new Float32Array(512); // Would extract from model
      embeddings.metadata.dimensions.set('text', 512);
      embeddings.metadata.modelVersions.set('text', this.txtModule!.getModelInfo().modelVersion);
    }
    
    // Vision
    if (input.rawMedia.images && this.visModule) {
      for (const img of input.rawMedia.images) {
        const visResult = await this.visModule.encode({
          imageData: img,
          mimeType: 'image/png',
          authorityGrant: grant,
          extractFeatures: true
        });
        embeddings.vision = visResult.embedding;
        embeddings.metadata.dimensions.set('vision', visResult.embedding.length);
        embeddings.metadata.modelVersions.set('vision', visResult.modelVersion);
        
        chain.evidence.set(visResult.evidenceId, {
          evidenceId: visResult.evidenceId,
          type: 'embedding',
          moduleId: 'sme-vis',
          data: visResult,
          timestamp: Date.now(),
          modelVersion: visResult.modelVersion,
          hash: this.hashData(img)
        });
      }
    }
    
    // Audio
    if (input.rawMedia.audio && this.audModule) {
      for (const aud of input.rawMedia.audio) {
        const audResult = await this.audModule.transcribe({
          audioData: aud,
          mimeType: 'audio/wav',
          authorityGrant: grant
        });
        embeddings.audio = audResult.embedding;
        embeddings.metadata.dimensions.set('audio', audResult.embedding.length);
        embeddings.metadata.modelVersions.set('audio', audResult.modelVersion);
        
        chain.evidence.set(audResult.evidenceId, {
          evidenceId: audResult.evidenceId,
          type: 'embedding',
          moduleId: 'sme-aud',
          data: audResult,
          timestamp: Date.now(),
          modelVersion: audResult.modelVersion,
          hash: this.hashData(aud)
        });
      }
    }
    
    // Video
    if (input.rawMedia.video && this.vidModule) {
      for (const vid of input.rawMedia.video) {
        const vidResult = await this.vidModule.analyze({
          videoData: vid,
          mimeType: 'video/mp4',
          authorityGrant: grant
        });
        embeddings.video = vidResult.globalEmbedding;
        embeddings.metadata.dimensions.set('video', vidResult.globalEmbedding.length);
        embeddings.metadata.modelVersions.set('video', vidResult.modelVersion);
        
        chain.evidence.set(vidResult.evidenceId, {
          evidenceId: vidResult.evidenceId,
          type: 'embedding',
          moduleId: 'sme-vid',
          data: vidResult,
          timestamp: Date.now(),
          modelVersion: vidResult.modelVersion,
          hash: this.hashData(vid)
        });
      }
    }
    
    return embeddings;
  }

  // ============================================================
  // EVIDENCE & AUDIT
  // ============================================================

  private async collectEvidence(evidence: EvidenceRecord): Promise<void> {
    // In production, persist to SME-LOG
    console.log(`[SME-EVR] Collected evidence: ${evidence.evidenceId}`);
  }

  private async finalizeEvidence(chainId: string): Promise<EvidenceBundle> {
    const chain = this.activeChains.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);
    
    return {
      bundleId: `bundle-${chainId}`,
      evidence: chain.evidence,
      decisionRecords: chain.decisions,
      provenance: {
        userId: 'anonymous',
        requestId: chainId,
        timestamp: Date.now(),
        modelVersions: chain.embeddings.metadata.modelVersions,
        configHash: this.hashString(JSON.stringify(this.config))
      }
    };
  }

  private async buildEvidenceBundle(chain: ActiveChain): Promise<EvidenceBundle> {
    return {
      bundleId: `bundle-${chain.chainId}`,
      evidence: chain.evidence,
      decisionRecords: chain.decisions,
      provenance: {
        userId: 'anonymous',
        requestId: chain.chainId,
        timestamp: Date.now(),
        modelVersions: chain.embeddings.metadata.modelVersions,
        configHash: this.hashString(JSON.stringify(this.config))
      }
    };
  }

  private async verifyExecution(chain: ActiveChain): Promise<void> {
    // Verify evidence integrity
    for (const [id, evidence] of chain.evidence) {
      const computedHash = evidence.type === 'generation' 
        ? this.hashData(evidence.data) 
        : this.hashString(JSON.stringify(evidence.data));
      if (evidence.hash && evidence.hash !== computedHash) {
        throw new Error(`Evidence integrity check failed: ${id}`);
      }
    }
  }

  private async archiveEvidence(bundle: EvidenceBundle): Promise<string> {
    if (this.logModule) {
      return this.logModule.archive(bundle);
    }
    return `archived-${bundle.bundleId}`;
  }

  private async queryAudit(query: any): Promise<any[]> {
    if (this.logModule) {
      return this.logModule.queryAudit(query);
    }
    return [];
  }

  private async generateAuditReport(chainId: string): Promise<any> {
    if (this.logModule) {
      // Would generate full audit report
    }
    return { chainId, report: 'Generated' };
  }

  private buildResponse(chain: ActiveChain): GovernedResponse {
    const response: GovernedResponse = {
      metadata: {
        decisionRecord: chain.decisions[chain.decisions.length - 1],
        evidenceIds: Array.from(chain.evidence.keys()),
        modelVersions: chain.embeddings.metadata.modelVersions,
        executionTimeMs: Date.now() - chain.startTime,
        resourceUsage: { cpuMs: 0, peakMemoryMb: 0 }
      }
    };
    
    // Extract generated outputs from evidence
    for (const [id, evidence] of chain.evidence) {
      if (evidence.type === 'generation') {
        const data = evidence.data as any;
        if (data.imageData) {
          response.images = response.images || [];
          response.images.push(data.imageData);
        }
        if (data.audioData) {
          response.audio = response.audio || [];
          response.audio.push(data.audioData);
        }
        if (data.videoData) {
          response.video = response.video || [];
          response.video.push(data.videoData);
        }
        if (data.text) {
          response.text = data.text;
        }
      }
    }
    
    return response;
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  private parseIntent(input: SmeCoreInput): UserIntent {
    return {
      intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      modalities: this.detectModalities(input),
      goal: input.rawMedia.text || 'Process multimodal input',
      constraints: {},
      priority: 'normal'
    };
  }

  private detectModalities(input: SmeCoreInput): Modality[] {
    const modalities: Modality[] = [];
    if (input.rawMedia.text) modalities.push('text');
    if (input.rawMedia.images?.length) modalities.push('image');
    if (input.rawMedia.audio?.length) modalities.push('audio');
    if (input.rawMedia.video?.length) modalities.push('video');
    return modalities.length > 0 ? modalities : ['text'];
  }

  private generateChainId(): string {
    return `chain-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateEvidenceId(): EvidenceId {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EvidenceId;
  }

  private generateSignature(data: string): string {
    return require('crypto').createHash('sha256').update(data).digest('hex').slice(0, 32);
  }

  private hashData(data: Buffer | Uint8Array | string): string {
    const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    return require('crypto').createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  }

  private hashString(str: string): string {
    return require('crypto').createHash('sha256').update(str).digest('hex').slice(0, 32);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-CORE not initialized. Call initialize() first.');
    }
  }

  // ============================================================
  // CAPABILITY PLANNING HELPERS
  // ============================================================

  private buildUserRequest(input: SmeCoreInput): any {
    const modalities = this.detectModalities(input);
    const constraints: any = {};
    
    // Extract constraints from input
    if (input.rawMedia.text) constraints.text = true;
    if (input.rawMedia.images?.length) constraints.images = input.rawMedia.images.length;
    if (input.rawMedia.audio?.length) constraints.audio = input.rawMedia.audio.length;
    if (input.rawMedia.video?.length) constraints.video = input.rawMedia.video.length;
    
    // Add authority context as constraints
    if (input.authorityContext) {
      constraints.userId = input.authorityContext.userId;
      constraints.role = input.authorityContext.role;
    }
    
    return {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      intent: input.rawMedia.text || 'Process multimodal input',
      modalities,
      media: input.rawMedia,
      constraints,
      privacyLevel: 'internal',
      timestamp: Date.now()
    };
  }

  private hashObject(obj: any): string {
    return require('crypto').createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  registerModule(moduleId: string, module: SmeModule): void {
    this.registerModuleInternal(moduleId, module);
  }

  unregisterModule(moduleId: string): void {
    switch (moduleId) {
      case 'sme-txt': this.txtModule = null; break;
      case 'sme-vis': this.visModule = null; break;
      case 'sme-aud': this.audModule = null; break;
      case 'sme-vid': this.vidModule = null; break;
      case 'sme-gen': this.genModule = null; break;
      case 'sme-log': this.logModule = null; break;
    }
  }

  getModelInfo(): any {
    return {
      moduleId: this.moduleId,
      moduleType: this.moduleType,
      skiRuntime: this.skiRuntime,
      activeChains: this.activeChains.size,
      modules: {
        txt: !!this.txtModule,
        vis: !!this.visModule,
        aud: !!this.audModule,
        vid: !!this.vidModule,
        gen: !!this.genModule,
        log: !!this.logModule
      }
    };
  }

  async healthCheck(): Promise<any> {
    const modules: Record<string, any> = {};
    
    if (this.txtModule) modules.txt = await this.txtModule.healthCheck();
    if (this.visModule) modules.vis = await this.visModule.healthCheck();
    if (this.audModule) modules.aud = await this.audModule.healthCheck();
    if (this.vidModule) modules.vid = await this.vidModule.healthCheck();
    if (this.genModule) modules.gen = await this.genModule.healthCheck();
    if (this.logModule) modules.log = await this.logModule.healthCheck();
    
    return {
      moduleId: this.moduleId,
      healthy: Object.values(modules).every(m => m),
      modules,
      skiSubstrates: Array.from(this.skiRuntime?.['substrates'].keys() || [])
    };
  }

  async shutdown(): Promise<void> {
    for (const chain of this.activeChains.values()) {
      // Wait for active chains to complete
    }
    
    if (this.txtModule) await this.txtModule.shutdown();
    if (this.visModule) await this.visModule.shutdown();
    if (this.audModule) await this.audModule.shutdown();
    if (this.vidModule) await this.vidModule.shutdown();
    if (this.genModule) await this.genModule.shutdown();
    if (this.logModule) await this.logModule.shutdown();
    
    if (this.skiRuntime) {
      // Shutdown substrates
    }
    
    this.initialized = false;
    console.log('[SME-CORE] Shutdown complete');
  }
}

export default SmeCoreModule;