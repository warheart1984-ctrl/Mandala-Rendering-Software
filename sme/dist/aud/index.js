/**
 * SME-AUD: Audio Module - JavaScript Version
 * Speech-to-text via native sme_aud (whisper.cpp) or JS whisper bindings.
 *
 * Backend selection (in order):
 *   1. native - sme-suite/build/modules/sme-aud/sme_aud.exe + GGML whisper model
 *   2. faster-whisper / whisper.cpp JS bindings
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { moduleExePath, runAud } = require('../native-bridge');

class SmeAudModule {
  constructor() {
    this.moduleId = 'sme-aud';
    this.moduleType = 'aud';
    this.config = null;
    this.whisper = null;
    this.fasterWhisper = null;
    this.modelInfo = null;
    this.initialized = false;
    this.backend = 'native';
    this.nativeExe = null;
  }

  async initialize(config) {
    this.config = config;
    try {
      if (this.tryNative(config)) {
        this.backend = 'native';
      } else if (await this.tryFasterWhisper(config)) {
        this.backend = 'faster-whisper';
      } else if (await this.tryWhisperCpp(config)) {
        this.backend = 'whisper.cpp';
      } else {
        throw new Error('No Whisper backend available (sme_aud.exe or JS bindings).');
      }

      this.modelInfo = { moduleId: this.moduleId, modelName: `whisper-${config.modelType}`, modelVersion: this.generateModelVersion(config.modelPath || this.nativeExe || 'whisper'), framework: this.backend, frameworkVersion: this.backend === 'native' ? '0.2.0-native' : this.backend === 'faster-whisper' ? '1.0+' : '1.5+', parameters: this.estimateParams(config.modelType), quantization: config.quantization, device: config.device, capabilities: ['transcription', 'translation', 'language-detection', 'voice-activity-detection', 'audio-embedding'], loaded: true };
      this.initialized = true;
      console.log(`[SME-AUD] Initialized with ${this.backend}: ${config.modelType}`);
    } catch (error) { console.error('[SME-AUD] Init failed:', error); throw error; }
  }

  tryNative(config) {
    this.nativeExe = moduleExePath('sme-aud');
    if (!this.nativeExe) { console.log('[SME-AUD] native sme_aud.exe not found'); return false; }
    if (config.modelPath && !fs.existsSync(config.modelPath)) { console.log('[SME-AUD] whisper model missing:', config.modelPath); return false; }
    console.log(`[SME-AUD] native backend: ${this.nativeExe}`);
    return true;
  }

  async tryFasterWhisper(config) {
    try { const fw = await import('faster-whisper-node').catch(() => null); if (!fw) return false; const map = { 'whisper-tiny': 'tiny', 'whisper-base': 'base', 'whisper-small': 'small', 'whisper-medium': 'medium', 'whisper-large': 'large-v3' }; this.fasterWhisper = { model: await fw.WhisperModel.create(map[config.modelType] || 'tiny', { device: config.device === 'cuda' ? 'cuda' : 'cpu', compute_type: config.computeType || 'int8', cpu_threads: 4, num_workers: 2 }), free: () => {} }; return true; } catch (e) { console.log('[SME-AUD] faster-whisper not available:', e.message); return false; }
  }

  async tryWhisperCpp(config) {
    try { const w = await import('whisper-node').catch(() => null); if (!w) return false; const map = { 'whisper-tiny': 'models/ggml-tiny.bin', 'whisper-base': 'models/ggml-base.bin', 'whisper-small': 'models/ggml-small.bin', 'whisper-medium': 'models/ggml-medium.bin', 'whisper-large': 'models/ggml-large-v3.bin' }; this.whisper = { context: await w.WhisperContext.create(map[config.modelType] || 'models/ggml-tiny.bin', { use_gpu: config.device === 'cuda', n_threads: 4 }), params: { language: config.language, translate: false, n_threads: 4, max_context: -1, max_len: 0 }, free: () => {} }; return true; } catch (e) { console.log('[SME-AUD] whisper.cpp not available:', e.message); return false; }
  }

  async transcribe(input) {
    this.assertInitialized();
    if (!input.authorityGrant.permittedModalities.includes('audio')) throw new Error('Authority grant does not permit audio modality');
    const opts = input.options || {};
    const lang = opts.language || this.config.language;
    const task = opts.task || 'transcribe';
    const wordTs = opts.wordTimestamps ?? true;
    const vadFilter = opts.vadFilter ?? true;

    let result;
    if (this.backend === 'native') result = await this.transcribeNative(input.audioData);
    else if (this.backend === 'faster-whisper') result = await this.transcribeFasterWhisper(input.audioData, { language: lang, task, word_timestamps: wordTs, vad_filter: vadFilter });
    else result = await this.transcribeWhisperCpp(input.audioData, { language: lang, translate: task === 'translate', word_timestamps: wordTs });

    const embedding = await this.generateEmbedding(result.text);
    return { transcript: result.text, segments: result.segments, embedding, evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, durationSec: result.duration };
  }

  async classify(input) { this.assertInitialized(); const t = await this.transcribe(input); const labels = await this.classifyAudio(t.transcript); return { labels, embedding: t.embedding, evidenceId: this.generateEvidenceId() }; }

  async transcribeNative(audioData) {
    if (!this.nativeExe) throw new Error('sme_aud not available');
    const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
    const tempPath = path.join(os.tmpdir(), `sme-aud-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.wav`);
    fs.writeFileSync(tempPath, buffer);
    try {
      const modelPath = this.config.modelPath;
      const r = await runAud(tempPath, { modelPath: modelPath || undefined, threads: this.config.threads || 4 });
      const text = (r.transcript || '').trim();
      return {
        text,
        segments: text ? [{ id: 0, start: 0, end: r.durationSec || 0, text, confidence: 0.9 }] : [],
        duration: r.durationSec || 0
      };
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  async transcribeFasterWhisper(audioData, opts) { if (!this.fasterWhisper?.model) throw new Error('faster-whisper not initialized'); const audioFloat32 = this.audioBufferToFloat32(audioData); const r = await this.fasterWhisper.model.transcribe(audioFloat32, { language: opts.language, task: opts.task || 'transcribe', word_timestamps: opts.word_timestamps ?? true, vad_filter: opts.vad_filter ?? true, vad_parameters: { min_silence_duration_ms: 500, speech_pad_ms: 400 } }); return { text: r.text, segments: r.segments.map((s, i) => ({ id: i, start: s.start, end: s.end, text: s.text.trim(), confidence: s.avg_logprob ? Math.exp(s.avg_logprob) : 0.9, words: s.words?.map(w => ({ word: w.word, start: w.start, end: w.end, confidence: w.probability || 0.9 })) })), duration: r.duration || r.segments[r.segments.length - 1]?.end || 0 }; }

  async transcribeWhisperCpp(audioData, opts) { if (!this.whisper?.context) throw new Error('whisper.cpp not initialized'); const audioFloat32 = this.audioBufferToFloat32(audioData); const r = await this.whisper.context.transcribe(audioFloat32, { language: opts.language, translate: opts.translate || false, word_timestamps: opts.word_timestamps ?? true, max_len: 0, max_context: -1 }); return { text: r.text, segments: r.segments.map((s, i) => ({ id: i, start: s.t0 / 100, end: s.t1 / 100, text: s.text.trim(), confidence: 0.9, words: s.words?.map(w => ({ word: w.word, start: w.t0 / 100, end: w.t1 / 100, confidence: w.probability || 0.9 })) })), duration: r.segments[r.segments.length - 1]?.end || 0 }; }

  audioBufferToFloat32(buf) { if (buf.length < 44) throw new Error('Invalid WAV: too small'); const sr = buf.readUInt32LE(24); const bps = buf.readUInt16LE(34); const ch = buf.readUInt16LE(22); if (bps !== 16) throw new Error(`Unsupported bit depth: ${bps}`); const samples = (buf.length - 44) / 2; const f = new Float32Array(samples); for (let i = 0; i < samples; i++) f[i] = buf.readInt16LE(44 + i * 2) / 32768.0; if (sr !== 16000) return this.resample(f, sr, 16000); return f; }

  resample(input, from, to) { if (from === to) return input; const ratio = from / to; const ol = Math.round(input.length / ratio); const o = new Float32Array(ol); for (let i = 0; i < ol; i++) { const si = i * ratio; const idx = Math.floor(si); const frac = si - idx; o[i] = idx + 1 < input.length ? input[idx] * (1 - frac) + input[idx + 1] * frac : input[idx]; } return o; }

  async generateEmbedding(text) { const hash = crypto.createHash('sha256').update(text).digest(); const e = new Float32Array(384); for (let i = 0; i < 384; i++) e[i] = (hash[i % 32] / 255 - 0.5) * 2; return e; }

  async classifyAudio(text) { const labels = []; const l = text.toLowerCase(); const cats = { speech: ['hello', 'hi', 'yes', 'no', 'what', 'how', 'why', 'when', 'where'], question: ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which'], command: ['do', 'make', 'create', 'run', 'start', 'stop', 'go', 'execute'], music: ['song', 'music', 'play', 'sing', 'melody', 'rhythm'], noise: ['noise', 'sound', 'loud', 'quiet', 'silence', 'background'] }; for (const [cat, kws] of Object.entries(cats)) { let m = 0; for (const kw of kws) if (l.includes(kw)) m++; if (m > 0) labels.push({ label: cat, confidence: Math.min(0.5 + m * 0.1, 0.95) }); } return labels; }

  getModelInfo() { if (!this.modelInfo) throw new Error('Not initialized'); return this.modelInfo; }
  async healthCheck() { if (!this.initialized) return false; if (this.backend === 'native') return !!this.nativeExe; try { const s = new Float32Array(16000); if (this.backend === 'faster-whisper' && this.fasterWhisper?.model) await this.fasterWhisper.model.transcribe(s, { language: 'en' }); else if (this.whisper?.context) await this.whisper.context.transcribe(s, { language: 'en' }); return true; } catch { return false; } }
  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: this.modelInfo?.modelVersion, backend: this.backend }; }
  async shutdown() { if (this.whisper) { this.whisper.context?.free?.(); this.whisper = null; } if (this.fasterWhisper) { this.fasterWhisper.model?.free?.(); this.fasterWhisper = null; } this.initialized = false; }
  assertInitialized() { if (!this.initialized) throw new Error('SME-AUD not initialized'); }
  generateModelVersion(p) { return `v1.0.0-${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}`; }
  estimateParams(t) { const m = { 'whisper-tiny': 39e6, 'whisper-base': 74e6, 'whisper-small': 244e6, 'whisper-medium': 769e6, 'whisper-large': 1.55e9 }; return m[t] || 39e6; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
}

module.exports = { SmeAudModule };
