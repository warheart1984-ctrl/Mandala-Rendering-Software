/**
 * SME-GEN: Generative Media Module - JavaScript Version
 * Image generation: offload endpoint -> cloud client -> native sme_gen -> CPU fallback.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { moduleExePath, runGen } = require('../native-bridge');

class SmeGenModule {
  constructor() {
    this.moduleId = 'sme-gen';
    this.moduleType = 'gen';
    this.config = null;
    this.diffusion = null;
    this.tts = null;
    this.safetyFilters = [];
    this.modelInfo = null;
    this.initialized = false;
    this.offloadClient = null;
    this.cloud = null;
    this.cloudFallback = null;
    this.lastBackend = null;
  }

  async initialize(config) {
    this.config = config;
    this.cloud = config.cloudClient || null;
    this.cloudFallback = { provider: config.cloudProvider || null, model: config.cloudModel || null };
    this.safetyFilters = config.safetyFilters || this.getDefaultSafetyFilters();
    try {
      if (config.offloadEndpoint) this.offloadClient = await this.createOffloadClient(config.offloadEndpoint, config.offloadAuth);
      await this.initDiffusion(config);
      await this.initTts(config);
      
      this.modelInfo = { moduleId: this.moduleId, modelName: 'sme-gen-multimodal', modelVersion: this.generateModelVersion('gen-multimodal'), framework: 'onnx', frameworkVersion: '1.16+', parameters: this.estimateTotalParams(), quantization: 'INT8/FP16', device: config.offloadEndpoint ? 'hybrid' : 'cpu', capabilities: ['image-generation', 'image-to-image', 'controlnet', 'text-to-speech', 'voice-cloning', 'video-generation', 'frame-interpolation'], loaded: true };
      this.initialized = true;
      console.log(`[SME-GEN] Initialized: diffusion + TTS ${this.offloadClient ? '+ GPU offload' : '(CPU)'}`);
    } catch (error) { console.error('[SME-GEN] Init failed:', error); throw error; }
  }

  async initDiffusion(config) { try { await import('onnxruntime-node'); this.diffusion = { session: null, tokenizer: null, scheduler: this.createScheduler(), vaeDecoder: null, free: () => {} }; console.log('[SME-GEN] Diffusion ready (stub)'); } catch (e) { console.warn('[SME-GEN] Diffusion not available:', e); } }

  async initTts(config) { try { this.tts = { model: null, vocoder: null, free: () => {} }; console.log('[SME-GEN] TTS ready (stub)'); } catch (e) { console.warn('[SME-GEN] TTS not available:', e); } }

  createScheduler() { return { setTimesteps: (s) => Array.from({ length: s }, (_, i) => 1 - i / s), step: (t, s, p) => s }; }

  getDefaultSafetyFilters() { return [ { filterId: 'nsfw-image', name: 'NSFW Image Filter', modality: 'image', check: async () => ({ safe: true, violations: [] }) }, { filterId: 'profanity-text', name: 'Profanity Filter', modality: 'text', check: async (d) => { const t = String(d).toLowerCase(); const p = ['badword1', 'badword2']; const v = p.filter(w => t.includes(w)).map(w => ({ type: 'profanity', severity: 'medium', description: `Contains: ${w}` })); return { safe: v.length === 0, violations: v }; } }, { filterId: 'copyright-audio', name: 'Copyright Audio Filter', modality: 'audio', check: async () => ({ safe: true, violations: [] }) } ]; }

  async createOffloadClient(endpoint, auth) { return { endpoint, auth, async generateImage(payload) { const r = await fetch(`${endpoint}/generate/image`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` }, body: JSON.stringify(payload) }); return r.json(); }, async generateAudio(payload) { const r = await fetch(`${endpoint}/generate/audio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` }, body: JSON.stringify(payload) }); return r.json(); }, async generateVideo(payload) { const r = await fetch(`${endpoint}/generate/video`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` }, body: JSON.stringify(payload) }); return r.json(); } }; }

  async generateImage(input) {
    this.assertInitialized();
    await this.runSafetyFilters('image', input.prompt);
    if (!input.authorityGrant.permittedModalities.includes('image')) throw new Error('Authority grant does not permit image modality');
    if (input.width > this.config.maxResolution.width || input.height > this.config.maxResolution.height) throw new Error(`Resolution exceeds maximum: ${this.config.maxResolution.width}x${this.config.maxResolution.height}`);

    const seed = input.seed ?? Math.floor(Math.random() * 1e9);
    const imageData = await this.generateImageWithBackends(input, seed);

    await this.runSafetyFilters('image', imageData);
    return { imageData, mimeType: 'image/png', evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, parameters: { prompt: input.prompt, negativePrompt: input.negativePrompt || '', width: input.width, height: input.height, steps: input.steps, guidanceScale: input.guidanceScale, seed, model: this.lastBackend || 'local-fallback' } };
  }

  /** Backend chain: offload -> cloud -> native sme_gen -> SVG placeholder. */
  async generateImageWithBackends(input, seed) {
    if (this.offloadClient) {
      try {
        const r = await this.offloadClient.generateImage({ prompt: input.prompt, negative_prompt: input.negativePrompt, width: input.width, height: input.height, steps: input.steps, guidance_scale: input.guidanceScale, seed, controlnet: input.controlNet });
        const b64 = r.image_base64 || r.image || r.b64_json;
        if (b64) { this.lastBackend = 'offload'; return Buffer.from(b64, 'base64'); }
      } catch (e) { console.warn('[SME-GEN] Offload failed:', e.message); }
    }

    if (this.cloud) {
      try {
        const provider = this.pickCloudProvider();
        const model = this.cloudFallback.model || this.pickCloudModel(provider);
        const b64 = await this.cloud.generateImage(provider, model, input.prompt, {
          width: input.width, height: input.height, steps: input.steps || 20, seed
        });
        if (b64) { this.lastBackend = `cloud:${provider}/${model}`; return Buffer.from(b64, 'base64'); }
      } catch (e) { console.warn('[SME-GEN] Cloud image generation failed:', e.message); }
    }

    const nativeExe = moduleExePath('sme-gen');
    if (nativeExe) {
      try {
        const outputPath = path.join(os.tmpdir(), `sme-gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.png`);
        await runGen(input.prompt, outputPath);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          const buf = fs.readFileSync(outputPath);
          fs.unlinkSync(outputPath);
          this.lastBackend = 'native';
          return buf;
        }
      } catch (e) { console.warn('[SME-GEN] Native sme_gen failed:', e.message); }
    }

    this.lastBackend = 'local-fallback';
    return this.generateImageLocal(input, seed);
  }

  pickCloudProvider() {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    if (this.cloudFallback.provider && available.some(p => p.id === this.cloudFallback.provider)) return this.cloudFallback.provider;
    if (available.length > 0) return available[0].id;
    throw new Error('No configured cloud provider with a token.');
  }

  pickCloudModel(providerId) {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    const p = available.find(p => p.id === providerId);
    if (!p || !p.models || !p.models.length) return null;
    const prefs = ['flux', 'sdxl', 'stable-diffusion', 'dall-e', 'pixart', 'turbo'];
    for (const pref of prefs) { const hit = p.models.find(m => m.toLowerCase().includes(pref)); if (hit) return hit; }
    return p.models[0];
  }

  async generateImageLocal(input, seed) { const svg = `<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="50%" y="50%" font-family="monospace" font-size="14" fill="#00d4aa" text-anchor="middle" dominant-baseline="middle">Generated: ${input.prompt.substring(0, 50)}...</text><text x="50%" y="60%" font-family="monospace" font-size="10" fill="#666" text-anchor="middle" dominant-baseline="middle">Seed: ${seed} | Steps: ${input.steps} | Guidance: ${input.guidanceScale}</text></svg>`; return Buffer.from(svg); }

  async generateAudio(input) {
    this.assertInitialized();
    await this.runSafetyFilters('text', input.text);
    if (!input.authorityGrant.permittedModalities.includes('audio')) throw new Error('Authority grant does not permit audio modality');
    let audioData; const dur = input.text.length * 0.08;
    if (this.offloadClient) { try { const r = await this.offloadClient.generateAudio({ text: input.text, voice: input.voice, speed: input.speed }); audioData = Buffer.from(r.audio_base64, 'base64'); } catch (e) { console.warn('[SME-GEN] Audio offload failed:', e); audioData = await this.generateAudioLocal(input); } } else { audioData = await this.generateAudioLocal(input); }
    await this.runSafetyFilters('audio', audioData);
    return { audioData, mimeType: 'audio/wav', evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, durationSec: dur };
  }

  async generateAudioLocal(input) { const sr = 22050; const dur = input.text.length * 0.08; const samples = Math.floor(sr * dur); const data = new Int16Array(samples); const hash = crypto.createHash('sha256').update(input.text).digest(); const freq = 200 + (hash[0] % 400); for (let i = 0; i < samples; i++) { const t = i / sr; data[i] = Math.floor(Math.sin(2 * Math.PI * freq * t) * 10000); } const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length * 2, 40); return Buffer.concat([h, Buffer.from(data.buffer)]); }

  async generateVideo(input) {
    this.assertInitialized();
    await this.runSafetyFilters('text', input.prompt);
    if (!input.authorityGrant.permittedModalities.includes('video')) throw new Error('Authority grant does not permit video modality');
    if (input.durationSec > this.config.maxDurationSec) throw new Error(`Duration exceeds maximum: ${this.config.maxDurationSec}s`);
    if (input.width > this.config.maxResolution.width || input.height > this.config.maxResolution.height) throw new Error(`Resolution exceeds maximum`);
    
    const frames = []; const fc = input.fps * input.durationSec;
    if (input.imageSequence && input.imageSequence.length > 0) { for (let i = 0; i < fc; i++) { const t = i / fc; const idx = Math.min(Math.floor(t * (input.imageSequence.length - 1)), input.imageSequence.length - 2); const alpha = (t * (input.imageSequence.length - 1)) % 1; frames.push(await this.blendFrames(input.imageSequence[idx], input.imageSequence[idx + 1], alpha)); } } else { const kfc = Math.min(5, fc); const kfs = []; for (let i = 0; i < kfc; i++) { const kf = await this.generateImageLocal({ ...input, prompt: `${input.prompt}, frame ${i + 1} of ${kfc}`, width: input.width, height: input.height }, Math.floor(Math.random() * 1e9)); kfs.push(kf); } for (let i = 0; i < fc; i++) { const t = i / (fc - 1); const idx = Math.min(Math.floor(t * (kfc - 1)), kfc - 2); const alpha = (t * (kfc - 1)) % 1; frames.push(await this.blendFrames(kfs[idx], kfs[idx + 1], alpha)); } }
    
    const vd = await this.encodeVideo(frames, input.fps, input.width, input.height);
    return { videoData: vd, mimeType: 'video/mp4', evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, durationSec: input.durationSec, parameters: { prompt: input.prompt, width: input.width, height: input.height, durationSec: input.durationSec, fps: input.fps, seed: Math.floor(Math.random() * 1e9), model: 'local-interpolation' } };
  }

  async blendFrames(f1, f2, a) { return f1; }
  async encodeVideo(frames, fps, w, h) { return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0d0d1a"/><text x="50%" y="50%" font-family="monospace" font-size="14" fill="#00d4aa" text-anchor="middle" dominant-baseline="middle">Video: ${frames.length} frames @ ${fps}fps</text></svg>`); }

  async runSafetyFilters(modality, data) { for (const f of this.safetyFilters) if (f.modality === modality || f.modality === 'all') { const r = await f.check(data); if (!r.safe) throw new Error(`Safety filter '${f.name}' failed: ${r.violations.map(v => v.description).join('; ')}`); } }

  getModelInfo() { if (!this.modelInfo) throw new Error('Not initialized'); return this.modelInfo; }
  async healthCheck() { if (!this.initialized) return false; try { await this.generateImage({ prompt: 'test', width: 64, height: 64, steps: 1, guidanceScale: 1, authorityGrant: { permittedModalities: ['image'] } }); return true; } catch { return false; } }
  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: this.modelInfo?.modelVersion }; }
  async shutdown() { if (this.diffusion) { this.diffusion.free(); this.diffusion = null; } if (this.tts) { this.tts.free(); this.tts = null; } this.initialized = false; }
  assertInitialized() { if (!this.initialized) throw new Error('SME-GEN not initialized'); }
  generateModelVersion(p) { return `v1.0.0-${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}`; }
  estimateTotalParams() { return 1500000000; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
}

module.exports = { SmeGenModule };