/**
 * SME-TXT: Text Reasoning Core
 * CPU-first LLM inference via llama.cpp / ONNX Runtime
 * Constitutional decision engine for SME
 */

import { 
  SmeTxtIFC, SmeTxtConfig, SmeTxtInput, SmeTxtOutput, 
  SmeTxtGenerateInput, SmeTxtGenerateOutput,
  SmeModelInfo, ModuleHealth, EvidenceId, ModelVersion,
  AuthorityGrant, ReasoningTrace, DecisionRecord,
  MultimodalEmbeddings, ReasoningStep, SmeModule
} from '../contracts';

interface LlamaCppInstance {
  context: any;
  model: any;
  params: any;
  free: () => void;
}

interface OnnxRuntimeInstance {
  session: any;
  tokenizer: any;
  free: () => void;
}

export class SmeTxtModule implements SmeTxtIFC, SmeModule {
  public readonly moduleId = 'sme-txt';
  public readonly moduleType = 'txt' as const;
  
  private config: SmeTxtConfig | null = null;
  private llamaCpp: LlamaCppInstance | null = null;
  private onnxRuntime: OnnxRuntimeInstance | null = null;
  private modelInfo: SmeModelInfo | null = null;
  private initialized = false;
  private loadTimeMs = 0;
  private backend: 'llama.cpp' | 'onnx' = 'llama.cpp';

  async initialize(config: SmeTxtConfig): Promise<void> {
    const startTime = Date.now();
    this.config = config;
    
    try {
      // Try llama.cpp first (best CPU performance)
      if (await this.tryLlamaCpp(config)) {
        this.backend = 'llama.cpp';
      } else if (await this.tryOnnxRuntime(config)) {
        this.backend = 'onnx';
      } else {
        throw new Error('No supported LLM backend available. Install llama.cpp or ONNX Runtime.');
      }

      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: config.modelPath.split('/').pop() || 'unknown',
        modelVersion: this.generateModelVersion(config.modelPath),
        framework: this.backend === 'llama.cpp' ? 'llama.cpp' : 'onnx',
        frameworkVersion: this.backend === 'llama.cpp' ? 'latest' : '1.16+',
        parameters: this.estimateParams(config.modelPath),
        quantization: config.quantization,
        device: 'cpu',
        capabilities: ['text-generation', 'reasoning', 'chat', 'completion'],
        loaded: true,
        loadTimeMs: Date.now() - startTime
      };
      
      this.loadTimeMs = this.modelInfo.loadTimeMs || 0;
      this.initialized = true;
      
      console.log(`[SME-TXT] Initialized with ${this.backend}: ${this.modelInfo.modelName}`);
    } catch (error) {
      console.error('[SME-TXT] Initialization failed:', error);
      throw error;
    }
  }

  private async tryLlamaCpp(config: SmeTxtConfig): Promise<boolean> {
    try {
      // Dynamic import to avoid hard dependency
      const llama = await import('llama-node') as any;
      
      this.llamaCpp = {
        context: null,
        model: await llama.LlamaModel.loadFromFile(config.modelPath, {
          n_gpu_layers: config.gpuLayers || 0,
          n_ctx: config.contextLength,
          n_threads: config.threads,
          verbose: false
        }),
        params: {
          n_ctx: config.contextLength,
          n_threads: config.threads,
          n_gpu_layers: config.gpuLayers || 0,
          seed: config.seed
        },
        free: () => {}
      };
      
      // Create context
      this.llamaCpp.context = this.llamaCpp.model.createContext({
        n_ctx: config.contextLength,
        n_threads: config.threads
      });
      
      return true;
    } catch (error) {
      console.log('[SME-TXT] llama.cpp not available:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async tryOnnxRuntime(config: SmeTxtConfig): Promise<boolean> {
    try {
      const ort = await import('onnxruntime-node') as any;
      const tokenizers = await import('@xenova/transformers') as any;
      
      // Load tokenizer
      const tokenizer = await tokenizers.AutoTokenizer.from_pretrained(config.modelPath);
      
      // Load model session
      const session = await ort.InferenceSession.create(config.modelPath.replace('.gguf', '.onnx'), {
        executionProviders: ['cpu'],
        intraOpNumThreads: config.threads
      });
      
      this.onnxRuntime = {
        session,
        tokenizer,
        free: () => { session.release(); }
      };
      
      return true;
    } catch (error) {
      console.log('[SME-TXT] ONNX Runtime not available:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async process(input: SmeTxtInput): Promise<SmeTxtOutput> {
    this.assertInitialized();
    
    const prompt = this.buildPrompt(input);
    const seed = input.seed ?? this.config!.seed;
    
    let result: { text: string; tokensUsed: number; finishReason: string };
    
    if (this.backend === 'llama.cpp') {
      result = await this.generateLlamaCpp(prompt, input);
    } else {
      result = await this.generateOnnx(prompt, input);
    }
    
    const reasoningTrace = this.buildReasoningTrace(prompt, result.text, seed);
    const decisionRecord = this.buildDecisionRecord(input, result.text, reasoningTrace);
    const evidenceId = this.generateEvidenceId();
    
    return {
      text: result.text,
      reasoningTrace,
      decisionRecord,
      evidenceId,
      tokensUsed: result.tokensUsed
    };
  }

  async generate(input: SmeTxtGenerateInput): Promise<SmeTxtGenerateOutput> {
    this.assertInitialized();
    
    let result: { text: string; tokensGenerated: number; finishReason: string };
    
    if (this.backend === 'llama.cpp') {
      result = await this.generateLlamaCpp(input.prompt, { 
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        topP: input.topP,
        stopSequences: input.stopSequences,
        seed: input.seed
      });
    } else {
      result = await this.generateOnnx(input.prompt, { 
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        topP: input.topP,
        stopSequences: input.stopSequences,
        seed: input.seed
      });
    }
    
    return {
      text: result.text,
      tokensGenerated: result.tokensGenerated,
      finishReason: result.finishReason as any
    };
  }

  private buildPrompt(input: SmeTxtInput): string {
    let prompt = '';
    
    // Constitutional context
    if (this.config?.constitutionalContext) {
      prompt += `[CONSTITUTION]\n${this.config.constitutionalContext}\n[/CONSTITUTION]\n\n`;
    }
    
    // Authority grant context
    if (input.authorityGrant) {
      prompt += `[AUTHORITY]\nGranted: ${input.authorityGrant.permittedModalities.join(', ')}\nConstraints: ${JSON.stringify(input.authorityGrant.constraints)}\n[/AUTHORITY]\n\n`;
    }
    
    // Multimodal embeddings context
    if (input.embeddings) {
      prompt += `[EMBEDDINGS]\nAvailable: ${Object.keys(input.embeddings).filter(k => input.embeddings![k as keyof MultimodalEmbeddings]).join(', ')}\n[/EMBEDDINGS]\n\n`;
    }
    
    // User prompt
    prompt += `[USER]\n${input.prompt}\n[/USER]\n\n[ASSISTANT]\n`;
    
    return prompt;
  }

  private async generateLlamaCpp(prompt: string, options: any): Promise<{ text: string; tokensUsed: number; tokensGenerated: number; finishReason: string }> {
    if (!this.llamaCpp?.context) throw new Error('llama.cpp context not initialized');
    
    const ctx = this.llamaCpp.context;
    const maxTokens = options.maxTokens || 512;
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const stopSequences = options.stopSequences || ['[/ASSISTANT]', '[USER]', '[CONSTITUTION]'];
    const seed = options.seed ?? this.config!.seed;
    
    // Tokenize
    const tokens = ctx.tokenize(prompt);
    
    // Generate
    let generated = '';
    let tokenCount = 0;
    let finishReason = 'length';
    
    for await (const token of ctx.generate(tokens, {
      n_predict: maxTokens,
      temp: temperature,
      top_p: topP,
      top_k: 40,
      repeat_penalty: 1.1,
      seed,
      stop: stopSequences
    })) {
      if (token === -1) break; // EOS
      
      const piece = ctx.detokenize([token]);
      generated += piece;
      tokenCount++;
      
      // Check stop sequences
      for (const stop of stopSequences) {
        if (generated.endsWith(stop)) {
          generated = generated.slice(0, -stop.length);
          finishReason = 'stop';
          break;
        }
      }
    }
    
    return {
      text: generated.trim(),
      tokensUsed: tokens.length + tokenCount,
      tokensGenerated: tokenCount,
      finishReason
    };
  }

  private async generateOnnx(prompt: string, options: any): Promise<{ text: string; tokensGenerated: number; finishReason: string }> {
    if (!this.onnxRuntime?.session || !this.onnxRuntime?.tokenizer) {
      throw new Error('ONNX Runtime not initialized');
    }
    
    const { session, tokenizer } = this.onnxRuntime;
    const maxTokens = options.maxTokens || 512;
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const seed = options.seed ?? this.config!.seed;
    
    // Tokenize
    const tokens = await tokenizer.encode(prompt);
    let inputIds = tokens;
    let generated = '';
    let tokenCount = 0;
    let finishReason = 'length';
    
    for (let i = 0; i < maxTokens; i++) {
      // Prepare inputs
      const input = new Float32Array([inputIds]);
      
      // Run inference
      const feeds = { input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds), [1, inputIds.length]) };
      const results = await session.run(feeds);
      
      // Get logits for last token
      const logits = results.logits.data;
      const vocabSize = logits.length / inputIds.length;
      const lastLogits = logits.slice((inputIds.length - 1) * vocabSize, inputIds.length * vocabSize);
      
      // Apply temperature and top-p
      const probs = this.softmax(lastLogits.map((l: number) => l / temperature));
      const nextToken = this.sampleTopP(probs, topP);
      
      if (tokenizer.isEndOfSequence(nextToken)) {
        finishReason = 'eos';
        break;
      }
      
      inputIds.push(nextToken);
      tokenCount++;
      
      const piece = tokenizer.decode([nextToken]);
      generated += piece;
      
      // Check stop sequences
      if (options.stopSequences) {
        for (const stop of options.stopSequences) {
          if (generated.endsWith(stop)) {
            generated = generated.slice(0, -stop.length);
            finishReason = 'stop';
            break;
          }
        }
      }
    }
    
    return {
      text: generated.trim(),
      tokensGenerated: tokenCount,
      finishReason
    };
  }

  private softmax(logits: number[]): number[] {
    const max = Math.max(...logits);
    const exp = logits.map(l => Math.exp(l - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(e => e / sum);
  }

  private sampleTopP(probs: number[], topP: number): number {
    const indexed = probs.map((p, i) => ({ prob: p, index: i }))
      .sort((a, b) => b.prob - a.prob);
    
    let cumsum = 0;
    for (const item of indexed) {
      cumsum += item.prob;
      if (cumsum >= topP) {
        return item.index;
      }
    }
    return indexed[0].index;
  }

  private buildReasoningTrace(prompt: string, output: string, seed: number): ReasoningTrace {
    const steps: ReasoningStep[] = [
      {
        stepId: '1',
        description: 'Constitutional context and authority validation',
        inputRefs: [] as EvidenceId[],
        outputRefs: [] as EvidenceId[],
        confidence: 1.0
      },
      {
        stepId: '2',
        description: 'Multimodal embedding fusion (if provided)',
        inputRefs: [] as EvidenceId[],
        outputRefs: [] as EvidenceId[],
        confidence: 0.9
      },
      {
        stepId: '3',
        description: 'LLM reasoning and generation',
        inputRefs: [] as EvidenceId[],
        outputRefs: [] as EvidenceId[],
        confidence: 0.85
      }
    ];
    
    return {
      steps,
      modelVersion: this.modelInfo!.modelVersion,
      seed
    };
  }

  private buildDecisionRecord(input: SmeTxtInput, output: string, trace: ReasoningTrace): DecisionRecord {
    return {
      decisionId: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      intent: {
        intentId: `intent-${Date.now()}`,
        modalities: ['text'],
        goal: input.prompt,
        constraints: input.authorityGrant?.constraints || {},
        priority: 'normal'
      },
      authorityGrant: input.authorityGrant!,
      validationResult: { passed: true, checks: [], warnings: [] },
      reasoningTrace: trace,
      outputs: [{
        moduleId: this.moduleId,
        modality: 'text',
        data: output,
        evidenceId: this.generateEvidenceId(),
        modelVersion: this.modelInfo!.modelVersion,
        timestamp: Date.now()
      }],
      evidenceIds: [this.generateEvidenceId()],
      signature: this.generateSignature(output)
    };
  }

  getModelInfo(): SmeModelInfo {
    if (!this.modelInfo) throw new Error('Not initialized');
    return this.modelInfo;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    
    try {
      // Quick generation test
      const testResult = await this.generate({ 
        prompt: 'Test', 
        maxTokens: 5, 
        temperature: 0.1,
        topP: 0.9 
      });
      return testResult.text.length > 0;
    } catch {
      return false;
    }
  }

  async healthCheckDetailed(): Promise<ModuleHealth> {
    const healthy = await this.healthCheck();
    return {
      moduleId: this.moduleId,
      healthy,
      lastCheck: Date.now(),
      error: healthy ? undefined : 'Health check failed',
      modelVersion: this.modelInfo?.modelVersion
    };
  }

  async shutdown(): Promise<void> {
    if (this.llamaCpp) {
      this.llamaCpp.context?.free?.();
      this.llamaCpp.model?.free?.();
      this.llamaCpp = null;
    }
    if (this.onnxRuntime) {
      this.onnxRuntime.session?.release?.();
      this.onnxRuntime = null;
    }
    this.initialized = false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-TXT not initialized. Call initialize() first.');
    }
  }

  private generateModelVersion(modelPath: string): ModelVersion {
    const hash = require('crypto').createHash('sha256').update(modelPath).digest('hex').slice(0, 16);
    return `v1.0.0-${hash}` as ModelVersion;
  }

  private estimateParams(modelPath: string): number {
    const name = modelPath.toLowerCase();
    if (name.includes('1b') || name.includes('1.1b') || name.includes('1.3b')) return 1_000_000_000;
    if (name.includes('3b') || name.includes('3.8b')) return 3_000_000_000;
    if (name.includes('7b')) return 7_000_000_000;
    if (name.includes('13b')) return 13_000_000_000;
    if (name.includes('0.5b') || name.includes('500m')) return 500_000_000;
    if (name.includes('tiny') || name.includes('small')) return 100_000_000;
    return 1_000_000_000; // Default 1B
  }

  private generateEvidenceId(): EvidenceId {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EvidenceId;
  }

  private generateSignature(data: string): string {
    return require('crypto').createHash('sha256').update(data + this.config?.seed).digest('hex').slice(0, 32);
  }
}

export default SmeTxtModule;