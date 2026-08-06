/**
 * SME-VID: Video Module - JavaScript Version
 * Native sme_vid (FFmpeg presets) for transcoding; frame sampling + vision encoder for analysis.
 */

const crypto = require('crypto');
const { spawn } = require('child_process');
const { vidLauncher, runVid } = require('../native-bridge');

class SmeVidModule {
  constructor() {
    this.moduleId = 'sme-vid';
    this.moduleType = 'vid';
    this.config = null;
    this.ffmpeg = null;
    this.modelInfo = null;
    this.initialized = false;
    this.nativeVid = null;
  }

  async initialize(config) {
    this.config = config;
    try {
      this.nativeVid = vidLauncher();
      await this.initFFmpeg();
      if (config.frameEmbedder) {
        await config.frameEmbedder.healthCheck();
      } else {
        console.warn('[SME-VID] no frameEmbedder; running in process-only mode');
      }

      this.modelInfo = { moduleId: this.moduleId, modelName: `video-${config.frameSampler || 'native'}-${config.temporalAggregator || 'ffmpeg'}`, modelVersion: this.generateModelVersion('video-module'), framework: this.nativeVid ? 'native' : 'custom', frameworkVersion: this.nativeVid ? '1.0.0-net10' : '1.0.0', parameters: 0, quantization: config.quantization, device: config.device, capabilities: ['video-transcode', 'video-embedding', 'frame-sampling', 'scene-detection', 'temporal-aggregation', 'action-recognition', 'event-extraction'], loaded: true };
      this.initialized = true;
      console.log(`[SME-VID] Initialized: ${this.nativeVid ? 'native sme_vid + ' : ''}${config.frameSampler} sampler, ${config.temporalAggregator} aggregator`);
    } catch (error) { console.error('[SME-VID] Init failed:', error); throw error; }
  }

  /**
   * Video processing via native sme_vid presets (transcode-h264 | extract-audio | trim).
   * Falls back to raw ffmpeg spawn when the native binary is absent.
   */
  async process(input) {
    this.assertInitialized();
    const preset = input.preset;
    const inputPath = input.inputPath;
    const outputPath = input.outputPath;
    const ffmpeg = input.ffmpeg;

    if (this.nativeVid) {
      const r = await runVid(preset, inputPath, outputPath, { ffmpeg });
      return { ok: true, preset, input: inputPath, output: outputPath, ffmpeg: r.ffmpeg || ffmpeg, intentId: r.intentId, evidenceId: this.generateEvidenceId() };
    }
    return this.processWithFfmpeg(preset, inputPath, outputPath, ffmpeg);
  }

  processWithFfmpeg(preset, inputPath, outputPath, ffmpeg = 'ffmpeg') {
    return new Promise((resolve, reject) => {
      let args;
      switch (preset) {
        case 'transcode-h264': args = ['-y', '-i', inputPath, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', outputPath]; break;
        case 'extract-audio': args = ['-y', '-i', inputPath, '-vn', '-acodec', 'copy', outputPath]; break;
        case 'trim': args = ['-y', '-i', inputPath, '-c', 'copy', outputPath]; break;
        default: reject(new Error(`unknown preset: ${preset}`)); return;
      }
      const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', d => { stderr += d; });
      child.on('error', err => reject(err));
      child.on('close', code => {
        if (code === 0) resolve({ ok: true, preset, input: inputPath, output: outputPath, evidenceId: this.generateEvidenceId() });
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      });
    });
  }

  async initFFmpeg() {
    try { const m = await import('fluent-ffmpeg').catch(() => null); const ff = m && (m.default || m); const fm = await import('@ffmpeg-installer/ffmpeg').catch(() => null); const fp = fm && (fm.default || fm); if (ff && fp) { ff.setFfmpegPath(fp.path); this.ffmpeg = { extractFrames: (p, o) => this.extractFramesWithFfmpeg(ff, p, o), getVideoInfo: (p) => this.getVideoInfoWithFfmpeg(p), free: () => {} }; } else { console.warn('[SME-VID] fluent-ffmpeg not available'); this.ffmpeg = this.createFallbackFFmpeg(); }     } catch (e) { console.warn('[SME-VID] FFmpeg init failed:', e); this.ffmpeg = this.createFallbackFFmpeg(); }
  }

  createFallbackFFmpeg() { return { async extractFrames() { console.warn('[SME-VID] FFmpeg not available'); return [{ index: 0, timestamp: 0, imageData: Buffer.alloc(0), mimeType: 'image/png', isKeyframe: true }]; }, async getVideoInfo() { return { duration: 0, width: 0, height: 0, fps: 0, codec: 'unknown', format: 'unknown', bitrate: 0 }; }, free: () => {} }; }

  async extractFramesWithFfmpeg(ffmpeg, videoPath, options) { return new Promise((resolve, reject) => { const frames = []; const fmt = options.format || 'png'; const fps = options.fps || 1; const maxFrames = options.maxFrames || this.config.maxFrames || 100; let fc = 0; const cmd = ffmpeg(videoPath).inputOptions(['-hide_banner', '-loglevel', 'error']).outputOptions(['-vf', options.keyframesOnly ? 'select=eq(pict_type\\,I)' : `fps=${fps}`, '-vsync', 'vfr', '-frame_pts', '1', '-f', 'image2pipe', '-vcodec', fmt === 'png' ? 'png' : 'mjpeg']).on('data', (data) => { if (fc >= maxFrames) return; frames.push({ index: fc, timestamp: fc / fps, imageData: data, mimeType: fmt === 'png' ? 'image/png' : 'image/jpeg', isKeyframe: options.keyframesOnly }); fc++; }).on('end', () => resolve(frames)).on('error', (err) => reject(err)); if (options.startTime) cmd.seekInput(options.startTime); if (options.duration) cmd.duration(options.duration); cmd.run(); }); }

  async getVideoInfoWithFfmpeg(videoPath) { const ff = await import('fluent-ffmpeg').catch(() => null); const f = ff && (ff.default || ff); return new Promise((resolve, reject) => { if (!f || !f.ffprobe) return reject(new Error('fluent-ffmpeg not available')); f.ffprobe(videoPath, (err, data) => { if (err) return reject(err); const vs = data.streams.find(s => s.codec_type === 'video'); if (!vs) return reject(new Error('No video stream')); resolve({ duration: parseFloat(data.format.duration || '0'), width: vs.width, height: vs.height, fps: eval(vs.r_frame_rate || '0'), codec: vs.codec_name, format: data.format.format_name, bitrate: parseInt(data.format.bit_rate || '0') }); }); }); }

  async analyze(input) {
    this.assertInitialized();
    if (!input.authorityGrant.permittedModalities.includes('video')) throw new Error('Authority grant does not permit video modality');
    const opts = input.options || {};
    const tempPath = await this.saveTempVideo(input.videoData, input.mimeType);
    try {
      const vinfo = await this.ffmpeg.getVideoInfo(tempPath);
      const frames = await this.extractFrames(tempPath, opts, vinfo);
      const frameEmbeddings = []; const timestamps = []; const events = [];
      for (const frame of frames) { if (frame.imageData.length === 0) continue; const vr = await this.config.frameEmbedder.encode({ imageData: frame.imageData, mimeType: frame.mimeType, authorityGrant: input.authorityGrant, extractFeatures: false }); frameEmbeddings.push(vr.embedding); timestamps.push(frame.timestamp); }
      if (opts.detectScenes) { const sc = this.detectSceneChanges(frameEmbeddings, timestamps); events.push(...sc); }
      if (opts.detectActions) { const ac = await this.detectActions(frames, input.authorityGrant); events.push(...ac); }
      const globalEmb = this.aggregateTemporal(frameEmbeddings, timestamps);
      return { globalEmbedding: globalEmb, frameEmbeddings, timestamps, events, evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, durationSec: vinfo.duration, framesAnalyzed: frames.length };
    } finally { await this.cleanupTempVideo(tempPath); }
  }

  async extractFrames(videoPath, opts, vinfo) { const fps = opts.sampleRateFps || 1; const maxFrames = this.config.maxFrames; const dur = opts.maxDurationSec || vinfo.duration; const o = { fps, maxFrames, duration: dur, keyframesOnly: this.config.frameSampler === 'keyframe', format: 'png' }; if (this.config.frameSampler === 'scene-change') o.keyframesOnly = false; return this.ffmpeg.extractFrames(videoPath, o); }

  detectSceneChanges(embeddings, timestamps) { const events = []; const thresh = 0.3; for (let i = 1; i < embeddings.length; i++) { const sim = this.cosineSimilarity(embeddings[i - 1], embeddings[i]); const dist = 1 - sim; if (dist > thresh) events.push({ type: 'scene_change', startTime: timestamps[i - 1], endTime: timestamps[i], description: `Scene change (dist: ${dist.toFixed(3)})`, confidence: Math.min(dist * 2, 1.0), frameIndices: [i - 1, i] }); } return events; }

  async detectActions(frames, grant) { const events = []; for (let i = 0; i < frames.length; i += 5) { if (frames[i].imageData.length === 0) continue; try { const vr = await this.config.frameEmbedder.encode({ imageData: frames[i].imageData, mimeType: frames[i].mimeType, authorityGrant: grant, extractFeatures: true }); if (vr.features?.objects) for (const obj of vr.features.objects) if (obj.confidence > 0.7) events.push({ type: 'object_appear', startTime: frames[i].timestamp, endTime: frames[i].timestamp + 1, description: `${obj.label} (${(obj.confidence * 100).toFixed(0)}%)`, confidence: obj.confidence, frameIndices: [i] }); } catch {} } return events; }

  aggregateTemporal(embeddings, timestamps) { if (!embeddings.length) return new Float32Array(384); if (embeddings.length === 1) return embeddings[0]; const dim = embeddings[0].length; const r = new Float32Array(dim); switch (this.config.temporalAggregator) { case 'mean': for (const e of embeddings) for (let i = 0; i < dim; i++) r[i] += e[i]; for (let i = 0; i < dim; i++) r[i] /= embeddings.length; break; case 'attention': const ws = timestamps.map(t => { const mt = Math.max(...timestamps); return mt > 0 ? t / mt : 1 / embeddings.length; }); const wsum = ws.reduce((a, b) => a + b, 0); for (let i = 0; i < embeddings.length; i++) { const w = ws[i] / wsum; for (let j = 0; j < dim; j++) r[j] += embeddings[i][j] * w; } break; case 'rnn': let a = 0.3; r.set(embeddings[0]); for (let i = 1; i < embeddings.length; i++) for (let j = 0; j < dim; j++) r[j] = a * embeddings[i][j] + (1 - a) * r[j]; break; default: return this.aggregateTemporal(embeddings, timestamps); } return r; }

  cosineSimilarity(a, b) { let dot = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return dot / (Math.sqrt(na) * Math.sqrt(nb)); }

  async saveTempVideo(data, mime) { const fs = require('fs'); const path = require('path'); const os = require('os'); const ext = mime === 'video/mp4' ? '.mp4' : '.webm'; const p = path.join(os.tmpdir(), `sme-vid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`); fs.writeFileSync(p, data); return p; }
  async cleanupTempVideo(p) { const fs = require('fs'); try { fs.unlinkSync(p); } catch {} }

  getModelInfo() { if (!this.modelInfo) throw new Error('Not initialized'); return this.modelInfo; }
  async healthCheck() { if (!this.initialized) return false; if (this.nativeVid) return true; try { await this.analyze({ videoData: Buffer.from('fake'), mimeType: 'video/mp4', authorityGrant: { permittedModalities: ['video'] } }); return true; } catch { return false; } }
  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: this.modelInfo?.modelVersion, backend: this.nativeVid ? 'native' : 'ffmpeg' }; }
  async shutdown() { if (this.ffmpeg) { this.ffmpeg.free(); this.ffmpeg = null; } this.initialized = false; }
  assertInitialized() { if (!this.initialized) throw new Error('SME-VID not initialized'); }
  generateModelVersion(p) { return `v1.0.0-${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}`; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
}

module.exports = { SmeVidModule };