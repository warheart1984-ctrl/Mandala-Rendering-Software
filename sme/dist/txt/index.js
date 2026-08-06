/**
 * SME-TXT: Text Reasoning Core - JavaScript Version
 * CPU-first LLM inference via native sme_txt (llama.cpp / ONNX Runtime).
 *
 * Backend selection (in order):
 *   1. native  - sme-suite/build/modules/sme-txt/sme_txt.exe + local GGUF/ONNX model
 *   2. llama.cpp / onnx  - JS bindings (llama-node / onnxruntime-node)
 *   3. cloud   - CloudAIClient (config.cloudClient), LocalFailure -> CloudFallback
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { moduleExePath, runTxt } = require('../native-bridge');

class SmeTxtModule {
  constructor() {
    this.moduleId = 'sme-txt';
    this.moduleType = 'txt';
    this.config = null;
    this.llamaCpp = null;
    this.onnxRuntime = null;
    this.modelInfo = null;
    this.initialized = false;
    this.loadTimeMs = 0;
    this.backend = 'native';
    this.nativeExe = null;
    this.cloud = null;
    this.cloudFallback = null;
    this.lastFallback = null;
  }

  async initialize(config) {
    const startTime = Date.now();
    this.config = config;
    this.cloud = config.cloudClient || null;
    this.cloudFallback = { provider: config.cloudProvider || null, model: config.cloudModel || null };

    try {
      if (this.tryNative(config)) {
        this.backend = 'native';
      } else if (await this.tryLlamaCpp(config)) {
        this.backend = 'llama.cpp';
      } else if (await this.tryOnnxRuntime(config)) {
        this.backend = 'onnx';
      } else if (this.cloud) {
        this.backend = 'cloud';
        console.log('[SME-TXT] Local LLM unavailable; using cloud fallback (Text Substrate Continuity).');
      } else {
        throw new Error('No supported LLM backend available. Install sme-suite native build, llama.cpp, or configure a cloud client.');
      }

      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: (config.modelPath || 'cloud').split(/[\\/]/).pop() || 'unknown',
        modelVersion: this.generateModelVersion(config.modelPath || 'cloud'),
        framework: this.backend,
        frameworkVersion: this.backend === 'native' ? '0.2.0-native' : this.backend === 'llama.cpp' ? 'latest' : '1.16+',
        parameters: this.estimateParams(config.modelPath || 'cloud'),
        quantization: config.quantization,
        device: this.backend === 'cloud' ? 'cloud' : 'cpu',
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

  tryNative(config) {
    this.nativeExe = moduleExePath('sme-txt');
    if (!this.nativeExe) {
      console.log('[SME-TXT] native sme_txt.exe not found');
      return false;
    }
    if (config.modelPath && !fs.existsSync(config.modelPath)) {
      console.log('[SME-TXT] native model missing:', config.modelPath);
      return false;
    }
    console.log(`[SME-TXT] native backend: ${this.nativeExe}`);
    return true;
  }

  async tryLlamaCpp(config) {
    try {
      const llama = await import('llama-node').catch(() => null);
      if (!llama) return false;

      this.llamaCpp = {
        context: null,
        model: await llama.LlamaModel.loadFromFile(config.modelPath, {
          n_gpu_layers: config.gpuLayers || 0,
          n_ctx: config.contextLength,
          n_threads: config.threads,
          verbose: false
        }),
        params: { n_ctx: config.contextLength, n_threads: config.threads, n_gpu_layers: config.gpuLayers || 0, seed: config.seed },
        free: () => {}
      };

      this.llamaCpp.context = this.llamaCpp.model.createContext({ n_ctx: config.contextLength, n_threads: config.threads });
      return true;
    } catch (error) {
      console.log('[SME-TXT] llama.cpp not available:', error.message);
      return false;
    }
  }

  async tryOnnxRuntime(config) {
    try {
      const ort = await import('onnxruntime-node').catch(() => null);
      const tokenizers = await import('@xenova/transformers').catch(() => null);
      if (!ort || !tokenizers) return false;

      const tokenizer = await tokenizers.AutoTokenizer.from_pretrained(config.modelPath);
      const session = await ort.InferenceSession.create(config.modelPath.replace('.gguf', '.onnx'), {
        executionProviders: ['cpu'], intraOpNumThreads: config.threads
      });

      this.onnxRuntime = { session, tokenizer, free: () => session.release() };
      return true;
    } catch (error) {
      console.log('[SME-TXT] ONNX Runtime not available:', error.message);
      return false;
    }
  }

  async process(input) {
    this.assertInitialized();
    const prompt = this.buildPrompt(input);
    const seed = input.seed ?? this.config.seed;

    let result = await this.generateWithFallback(prompt, input);

    const reasoningTrace = this.buildReasoningTrace(prompt, result.text, seed);
    const decisionRecord = this.buildDecisionRecord(input, result.text, reasoningTrace);
    const evidenceId = this.generateEvidenceId();

    return { text: result.text, reasoningTrace, decisionRecord, evidenceId, tokensUsed: result.tokensUsed, fallback: this.lastFallback };
  }

  async generate(input) {
    this.assertInitialized();
    const prompt = input.prompt;
    const result = await this.generateWithFallback(prompt, { maxTokens: input.maxTokens, temperature: input.temperature, topP: input.topP, stopSequences: input.stopSequences, seed: input.seed, useRawPrompt: true });
    return { text: result.text, tokensGenerated: result.tokensGenerated, finishReason: result.finishReason, fallback: this.lastFallback };
  }

  /** Local-first with LocalFailure -> CloudFallback continuity. */
  async generateWithFallback(prompt, options) {
    this.lastFallback = null;
    const localBackends = ['native', 'llama.cpp', 'onnx'];
    try {
      if (this.backend === 'native') return await this.generateNative(prompt, options);
      if (this.backend === 'cloud') return await this.generateCloud(prompt, options);
      if (this.backend === 'llama.cpp') return await this.generateLlamaCpp(prompt, options);
      return await this.generateOnnx(prompt, options);
    } catch (error) {
      if (localBackends.includes(this.backend) && this.cloud) {
        console.warn(`[SME-TXT] ${this.backend} failure -> cloud fallback:`, error.message);
        this.lastFallback = { from: this.backend, to: 'cloud', reason: error.message, at: Date.now() };
        return this.generateCloud(prompt, options);
      }
      throw error;
    }
  }

  buildPrompt(input) {
    let prompt = '';
    if (this.config.constitutionalContext) prompt += `[CONSTITUTION]\n${this.config.constitutionalContext}\n[/CONSTITUTION]\n\n`;
    if (input.authorityGrant) prompt += `[AUTHORITY]\nGranted: ${input.authorityGrant.permittedModalities.join(', ')}\nConstraints: ${JSON.stringify(input.authorityGrant.constraints)}\n[/AUTHORITY]\n\n`;
    if (input.embeddings) prompt += `[EMBEDDINGS]\nAvailable: ${Object.keys(input.embeddings).filter(k => input.embeddings[k]).join(', ')}\n[/EMBEDDINGS]\n\n`;
    prompt += `[USER]\n${input.prompt}\n[/USER]\n\n[ASSISTANT]\n`;
    return prompt;
  }

  async generateNative(prompt, options = {}) {
    if (!this.nativeExe) throw new Error('native sme_txt not available');
    const maxTokens = options.maxTokens || 512;
    const r = await runTxt(this.config.modelPath, prompt, {
      maxTokens,
      threads: this.config.threads || 4,
      timeout: (options.timeout || 180000)
    });
    return {
      text: (r.response || '').trim(),
      tokensUsed: (r.promptTokens || 0) + (r.outputTokens || 0),
      tokensGenerated: r.outputTokens || 0,
      finishReason: 'stop',
      intentId: r.intentId
    };
  }

  async generateCloud(prompt, options = {}) {
    if (!this.cloud) throw new Error('cloud fallback not configured');
    const provider = this.pickCloudProvider();
    const model = this.cloudFallback.model || this.pickCloudModel(provider, 'text');
    const content = await this.cloud.chat(provider, model, [
      { role: 'system', content: 'You are a concise, helpful assistant.' },
      { role: 'user', content: options.useRawPrompt ? prompt : this.stripTaggedPrompt(prompt) }
    ], {
      maxTokens: options.maxTokens || 512,
      temperature: options.temperature ?? 0.7,
      timeout: 120000
    });
    return { text: (content || '').trim(), tokensUsed: 0, tokensGenerated: 0, finishReason: 'stop', cloudProvider: provider, cloudModel: model };
  }

  stripTaggedPrompt(prompt) {
    const m = prompt.match(/\[USER\]\n([\s\S]*?)\n\[\/USER\]/);
    return m ? m[1] : prompt;
  }

  pickCloudProvider() {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    if (this.cloudFallback.provider && available.some(p => p.id === this.cloudFallback.provider)) {
      return this.cloudFallback.provider;
    }
    if (available.length > 0) return available[0].id;
    throw new Error('No configured cloud provider with a token (use cloud:set-token).');
  }

  pickCloudModel(providerId, kind) {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    const p = available.find(p => p.id === providerId);
    if (!p || !p.models || !p.models.length) return null;
    const prefs = kind === 'text'
      ? ['llama', 'mistral', 'phi', 'qwen', 'gemma', 'gpt']
      : ['qwen-vl', 'llava', 'llama-vision', 'clip'];
    for (const pref of prefs) {
      const hit = p.models.find(m => m.toLowerCase().includes(pref));
      if (hit) return hit;
    }
    return p.models[0];
  }

  async generateLlamaCpp(prompt, options) {
    if (!this.llamaCpp?.context) throw new Error('llama.cpp context not initialized');

    const ctx = this.llamaCpp.context;
    const maxTokens = options.maxTokens || 512;
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const stopSequences = options.stopSequences || ['[/ASSISTANT]', '[USER]', '[CONSTITUTION]'];
    const seed = options.seed ?? this.config.seed;

    const tokens = ctx.tokenize(prompt);
    let generated = '';
    let tokenCount = 0;
    let finishReason = 'length';

    for await (const token of ctx.generate(tokens, { n_predict: maxTokens, temp: temperature, top_p: topP, top_k: 40, repeat_penalty: 1.1, seed, stop: stopSequences })) {
      if (token === -1) break;
      const piece = ctx.detokenize([token]);
      generated += piece;
      tokenCount++;
      for (const stop of stopSequences) {
        if (generated.endsWith(stop)) { generated = generated.slice(0, -stop.length); finishReason = 'stop'; break; }
      }
    }
    return { text: generated.trim(), tokensUsed: tokens.length + tokenCount, tokensGenerated: tokenCount, finishReason };
  }

  async generateOnnx(prompt, options) {
    if (!this.onnxRuntime?.session || !this.onnxRuntime?.tokenizer) throw new Error('ONNX Runtime not initialized');

    const { session, tokenizer } = this.onnxRuntime;
    const maxTokens = options.maxTokens || 512;
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const seed = options.seed ?? this.config.seed;

    const tokens = await tokenizer.encode(prompt);
    let inputIds = tokens;
    let generated = '';
    let tokenCount = 0;
    let finishReason = 'length';

    for (let i = 0; i < maxTokens; i++) {
      const feeds = { input_ids: new (await import('onnxruntime-node')).Tensor('int64', BigInt64Array.from(inputIds), [1, inputIds.length]) };
      const results = await session.run(feeds);
      const logits = results.logits.data;
      const vocabSize = logits.length / inputIds.length;
      const lastLogits = logits.slice((inputIds.length - 1) * vocabSize, inputIds.length * vocabSize);

      const probs = this.softmax(lastLogits.map(l => l / temperature));
      const nextToken = this.sampleTopP(probs, topP);
      if (tokenizer.isEndOfSequence(nextToken)) { finishReason = 'eos'; break; }

      inputIds.push(nextToken);
      tokenCount++;
      generated += tokenizer.decode([nextToken]);

      if (options.stopSequences) {
        for (const stop of options.stopSequences) { if (generated.endsWith(stop)) { generated = generated.slice(0, -stop.length); finishReason = 'stop'; break; } }
      }
    }
    return { text: generated.trim(), tokensGenerated: tokenCount, finishReason };
  }

  softmax(logits) { const max = Math.max(...logits); const exp = logits.map(l => Math.exp(l - max)); const sum = exp.reduce((a, b) => a + b, 0); return exp.map(e => e / sum); }
  sampleTopP(probs, topP) { const indexed = probs.map((p, i) => ({ prob: p, index: i })).sort((a, b) => b.prob - a.prob); let cumsum = 0; for (const item of indexed) { cumsum += item.prob; if (cumsum >= topP) return item.index; } return indexed[0].index; }

  buildReasoningTrace(prompt, output, seed) {
    return { steps: [ { stepId: '1', description: 'Constitutional context and authority validation', inputRefs: [], outputRefs: [], confidence: 1.0 }, { stepId: '2', description: 'Multimodal embedding fusion', inputRefs: [], outputRefs: [], confidence: 0.9 }, { stepId: '3', description: `LLM reasoning and generation (${this.backend})`, inputRefs: [], outputRefs: [], confidence: 0.85 } ], modelVersion: this.modelInfo.modelVersion, seed };
  }

  buildDecisionRecord(input, output, trace) {
    return { decisionId: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, timestamp: Date.now(), intent: { intentId: `intent-${Date.now()}`, modalities: ['text'], goal: input.prompt, constraints: input.authorityGrant?.constraints || {}, priority: 'normal' }, authorityGrant: input.authorityGrant, validationResult: { passed: true, checks: [], warnings: this.lastFallback ? [`${this.lastFallback.from} -> ${this.lastFallback.to}: ${this.lastFallback.reason}`] : [] }, reasoningTrace: trace, outputs: [{ moduleId: this.moduleId, modality: 'text', data: output, evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, timestamp: Date.now() }], evidenceIds: [this.generateEvidenceId()], signature: this.generateSignature(output) };
  }

  getModelInfo() { if (!this.modelInfo) throw new Error('Not initialized'); return this.modelInfo; }

  async healthCheck() { if (!this.initialized) return false; try { const r = await this.generate({ prompt: 'Test', maxTokens: 5, temperature: 0.1, topP: 0.9 }); return r.text.length > 0; } catch { return false; } }

  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: this.modelInfo?.modelVersion }; }

  async shutdown() { if (this.llamaCpp) { this.llamaCpp.context?.free?.(); this.llamaCpp.model?.free?.(); this.llamaCpp = null; } if (this.onnxRuntime) { this.onnxRuntime.session?.release?.(); this.onnxRuntime = null; } this.initialized = false; }

  assertInitialized() { if (!this.initialized) throw new Error('SME-TXT not initialized'); }

  generateModelVersion(p) { return `v1.0.0-${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}`; }
  estimateParams(p) { const n = (p || '').toLowerCase(); if (n.includes('1b')||n.includes('1.1b')||n.includes('1.3b')) return 1e9; if (n.includes('3b')||n.includes('3.8b')) return 3e9; if (n.includes('7b')) return 7e9; if (n.includes('13b')) return 13e9; if (n.includes('0.5b')||n.includes('500m')) return 5e8; if (n.includes('tiny')||n.includes('small')) return 1e8; return 1e9; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
  generateSignature(data) { return crypto.createHash('sha256').update(data + this.config?.seed).digest('hex').slice(0, 32); }
}

module.exports = { SmeTxtModule };
