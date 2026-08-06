/**
 * SME-VIS: Vision Module - JavaScript Version
 * Image classification via native sme_vis (ONNX Runtime MobileNetV2/MobileViT).
 *
 * Backend selection (in order):
 *   1. native - sme-suite/build/modules/sme-vis/sme_vis.exe + ImageNet ONNX model
 *   2. onnx   - onnxruntime-node JS session
 *   3. cloud  - CloudAIClient.vision (config.cloudClient), LocalFailure -> CloudFallback
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { moduleExePath, runVis } = require('../native-bridge');

class SmeVisModule {
  constructor() {
    this.moduleId = 'sme-vis';
    this.moduleType = 'vis';
    this.config = null;
    this.session = null;
    this.preprocessor = null;
    this.modelInfo = null;
    this.initialized = false;
    this.classLabels = [];
    this.featureLabels = new Map();
    this.backend = 'native';
    this.nativeExe = null;
    this.cloud = null;
    this.cloudFallback = null;
    this.lastFallback = null;
  }

  async initialize(config) {
    this.config = config;
    this.cloud = config.cloudClient || null;
    this.cloudFallback = { provider: config.cloudProvider || null, model: config.cloudModel || null };

    try {
      if (this.tryNative()) {
        this.backend = 'native';
      } else if (await this.tryOnnx(config)) {
        this.backend = 'onnx';
      } else if (this.cloud) {
        this.backend = 'cloud';
        console.log('[SME-VIS] Local vision unavailable; using cloud fallback.');
      } else {
        throw new Error('No vision backend available (sme_vis.exe, onnxruntime-node, or cloud client).');
      }

      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: config.modelType || 'classifier',
        modelVersion: this.generateModelVersion(config.modelPath || this.nativeExe || 'cloud'),
        framework: this.backend === 'cloud' ? 'cloud' : this.backend === 'native' ? 'native-onnx' : 'onnx',
        frameworkVersion: this.backend === 'native' ? '0.2.0-native' : '1.21+',
        parameters: this.estimateParams(config.modelType),
        quantization: config.quantization,
        device: this.backend === 'cloud' ? 'cloud' : 'cpu',
        capabilities: ['image-embedding', 'object-detection', 'scene-classification', 'feature-extraction'],
        loaded: true
      };
      this.initialized = true;
      console.log(`[SME-VIS] Initialized: ${config.modelType} on ${this.backend}`);
    } catch (error) { console.error('[SME-VIS] Init failed:', error); throw error; }
  }

  tryNative() {
    this.nativeExe = moduleExePath('sme-vis');
    if (!this.nativeExe) { console.log('[SME-VIS] native sme_vis.exe not found'); return false; }
    console.log(`[SME-VIS] native backend: ${this.nativeExe}`);
    return true;
  }

  async tryOnnx(config) {
    try {
      const ort = await import('onnxruntime-node').catch(() => null);
      if (!ort) throw new Error('onnxruntime-node not available');

      const modelPath = this.resolveModelPath(config);
      if (!fs.existsSync(modelPath)) throw new Error(`model not found: ${modelPath}`);
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: this.getExecutionProviders(config.device),
        intraOpNumThreads: 4, interOpNumThreads: 2
      });

      const inputMeta = session.inputNames[0];
      const inputShape = session.inputMetadata[inputMeta].dimensions;

      this.session = { session, inputName: inputMeta, outputName: session.outputNames[0], inputShape, free: () => session.release() };
      this.preprocessor = this.createPreprocessor(config.inputSize);
      await this.loadLabels(config);
      await this.warmup();
      return true;
    } catch (error) {
      console.log('[SME-VIS] onnxruntime-node not available:', error.message);
      return false;
    }
  }

  resolveModelPath(config) {
    const map = { 'mobilevit': 'models/mobilevit_xxs.onnx', 'efficientnet': 'models/efficientnet_b0.onnx', 'vit-tiny': 'models/vit_tiny_patch16_224.onnx', 'vit-small': 'models/vit_small_patch16_224.onnx', 'resnet-pruned': 'models/resnet18_pruned.onnx' };
    const rel = map[config.modelType];
    if (rel) {
      const candidates = [
        path.join(process.cwd(), rel),
        path.join(__dirname, '..', '..', rel),
        path.join(__dirname, '..', '..', 'models', rel)
      ];
      for (const c of candidates) if (fs.existsSync(c)) return c;
    }
    return config.modelPath || rel || 'models/mobilenetv2-12.onnx';
  }

  getExecutionProviders(device) { switch (device) { case 'cuda': return ['cuda', 'cpu']; case 'directml': return ['dml', 'cpu']; default: return ['cpu']; } }

  createPreprocessor(inputSize) {
    let sharp; try { sharp = require('sharp'); } catch { console.warn('[SME-VIS] sharp not installed'); }
    return {
      async resize(imgBuffer, w, h) { if (sharp) return sharp(imgBuffer).resize(w, h, { fit: 'inside', withoutEnlargement: true }).toBuffer(); return imgBuffer; },
      normalize(data, mean, std) { const f = new Float32Array(data.length); for (let i = 0; i < data.length; i++) { const c = i % 3; f[i] = (data[i] / 255 - mean[c]) / std[c]; } return f; },
      toTensor(data) { const c = 3; const h = Math.sqrt(data.length / c); const w = h; const t = new Float32Array(c * h * w); for (let c = 0; c < 3; c++) for (let h = 0; h < h; h++) for (let w = 0; w < w; w++) t[c * h * w + h * w + w] = data[(h * w + w) * 3 + c]; return t; }
    };
  }

  async loadLabels(config) {
    try { const r = await fetch('https://raw.githubusercontent.com/anishathalye/imagenet-simple-labels/master/imagenet-simple-labels.json'); this.classLabels = await r.json(); } catch { this.classLabels = ['object', 'scene', 'person', 'animal', 'vehicle', 'building', 'nature', 'indoor']; }
    this.featureLabels.set('objects', ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball']);
    this.featureLabels.set('scenes', ['indoor', 'outdoor', 'urban', 'rural', 'nature', 'office', 'home', 'street', 'park', 'beach', 'mountain', 'forest', 'desert', 'water', 'sky', 'building', 'room']);
    this.featureLabels.set('attributes', ['bright', 'dark', 'colorful', 'monochrome', 'sharp', 'blurry', 'close-up', 'wide-angle', 'portrait', 'landscape', 'macro', 'architectural', 'natural', 'artificial']);
    this.featureLabels.set('colors', ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'gray']);
  }

  async warmup() { if (!this.session || !this.preprocessor) return; const dummy = new Uint8Array(this.config.inputSize.width * this.config.inputSize.height * 3); try { await this.encodeInternal(dummy, 'image/png', { permittedModalities: ['image'] }); } catch {} }

  async encode(input) { this.assertInitialized(); if (!input.authorityGrant.permittedModalities.includes('image')) throw new Error('Authority grant does not permit image modality'); return this.encodeInternal(input.imageData, input.mimeType, input.authorityGrant, input.extractFeatures); }

  async encodeBatch(inputs) { this.assertInitialized(); return Promise.all(inputs.map(i => this.encodeInternal(i.imageData, i.mimeType, i.authorityGrant, i.extractFeatures))); }

  async encodeInternal(imageData, mimeType, authorityGrant, extractFeatures = false) {
    if (!this.session && !this.nativeExe && !this.cloud) throw new Error('SME-VIS not initialized');

    const imgBuffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData);
    const tempPath = this.saveTempImage(imgBuffer, mimeType);

    try {
      if (this.backend === 'native') return await this.encodeNative(tempPath, extractFeatures);
      if (this.backend === 'cloud') return await this.encodeCloud(imgBuffer, extractFeatures);
      return await this.encodeOnnx(imgBuffer, extractFeatures);
    } catch (error) {
      if (this.backend === 'native' && this.cloud) {
        console.warn('[SME-VIS] native failure -> cloud fallback:', error.message);
        this.lastFallback = { from: 'native', to: 'cloud', reason: error.message, at: Date.now() };
        return this.encodeCloud(imgBuffer, extractFeatures);
      }
      throw error;
    } finally {
      this.cleanupTempImage(tempPath);
    }
  }

  saveTempImage(buffer, mimeType) {
    const ext = mimeType && mimeType.includes('jpeg') ? '.jpg' : mimeType && mimeType.includes('webp') ? '.webp' : '.png';
    const p = path.join(os.tmpdir(), `sme-vis-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    fs.writeFileSync(p, buffer);
    return p;
  }

  cleanupTempImage(p) { try { fs.unlinkSync(p); } catch {} }

  async encodeNative(imagePath, extractFeatures) {
    const r = await runVis(imagePath, { topK: 5 });
    const topK = (r.top_k || []).map(item => ({ label: item.label, confidence: item.confidence }));
    const scenes = topK;
    const embedding = this.embeddingFromLabels(topK);
    let features;
    if (extractFeatures) {
      features = {
        objects: [],
        scenes,
        attributes: topK[0] && topK[0].confidence > 0.5 ? [{ label: 'classified', confidence: topK[0].confidence }] : [],
        colors: { dominant: ['blue', 'gray'], accent: ['white'] }
      };
    }
    return {
      embedding,
      features,
      evidenceId: this.generateEvidenceId(),
      modelVersion: this.modelInfo.modelVersion,
      backend: 'native',
      intentId: r.intentId,
      preprocessing: { originalSize: { width: 0, height: 0 }, resizedSize: this.config.inputSize, normalization: 'ImageNet (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])' }
    };
  }

  async encodeCloud(imgBuffer, extractFeatures) {
    if (!this.cloud) throw new Error('cloud vision fallback not configured');
    const provider = this.pickCloudProvider();
    const model = this.cloudFallback.model || this.pickCloudModel(provider);
    const content = await this.cloud.vision(provider, model,
      'Describe this image in one concise sentence: subject, setting, lighting, mood.',
      imgBuffer.toString('base64'), { timeout: 120000 });
    const scenes = [{ label: content.split('.')[0].trim().slice(0, 80), confidence: 0.8 }];
    const embedding = this.embeddingFromText(content);
    const features = extractFeatures ? { objects: [], scenes, attributes: [], colors: {} } : undefined;
    return {
      embedding,
      features,
      evidenceId: this.generateEvidenceId(),
      modelVersion: this.modelInfo.modelVersion,
      backend: 'cloud',
      cloudProvider: provider,
      cloudModel: model,
      description: content,
      preprocessing: { originalSize: { width: 0, height: 0 }, resizedSize: this.config.inputSize, normalization: 'none (cloud)' }
    };
  }

  async encodeOnnx(imgBuffer, extractFeatures) {
    if (!this.session || !this.preprocessor) throw new Error('SME-VIS onnx session not initialized');
    const resized = await this.preprocessor.resize(imgBuffer, this.config.inputSize.width, this.config.inputSize.height);
    const tensor = this.imageToTensor(resized);
    const normalized = this.preprocessor.normalize(new Uint8Array(tensor.buffer), [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
    const ort = await import('onnxruntime-node');
    const inputTensor = new ort.Tensor('float32', normalized, [1, 3, this.config.inputSize.height, this.config.inputSize.width]);
    const results = await this.session.session.run({ [this.session.inputName]: inputTensor });
    const output = results[this.session.outputName];
    const embedding = this.extractEmbedding(output.data);
    let features; if (extractFeatures) features = await this.extractFeatures(output.data);
    return { embedding, features, evidenceId: this.generateEvidenceId(), modelVersion: this.modelInfo.modelVersion, backend: 'onnx', preprocessing: { originalSize: { width: 0, height: 0 }, resizedSize: this.config.inputSize, normalization: 'ImageNet (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])' } };
  }

  imageToTensor(buf) { const f = new Float32Array(buf.length); for (let i = 0; i < buf.length; i++) f[i] = buf[i] / 255.0; return f; }

  extractEmbedding(data) { if (data.length > this.config.inputSize.width * this.config.inputSize.height) { const hd = data.length / (this.config.inputSize.width * this.config.inputSize.height / 16); return data.slice(0, hd); } return data; }

  async extractFeatures(data) { const probs = this.softmax(Array.from(data.slice(0, 1000))); const top5 = probs.map((p, i) => ({ prob: p, index: i })).sort((a, b) => b.prob - a.prob).slice(0, 5); const scenes = top5.map(item => item.index < this.classLabels.length ? { label: this.classLabels[item.index], confidence: item.prob } : null).filter(Boolean); const meanAct = data.reduce((a, b) => a + b, 0) / data.length; const attributes = []; if (meanAct > 0.5) attributes.push({ label: 'bright', confidence: 0.8 }); if (meanAct < 0.2) attributes.push({ label: 'dark', confidence: 0.7 }); return { objects: [], scenes, attributes, colors: { dominant: ['blue', 'gray'], accent: ['white'] } }; }

  softmax(logits) { const max = Math.max(...logits); const exp = logits.map(l => Math.exp(l - max)); const sum = exp.reduce((a, b) => a + b, 0); return exp.map(e => e / sum); }

  /** Deterministic 384-dim embedding from label texts (P4 replayable). */
  embeddingFromLabels(topK) {
    const text = topK.map(t => t.label).join(' ');
    return this.embeddingFromText(text);
  }

  embeddingFromText(text) {
    const e = new Float32Array(384);
    const bytes = crypto.createHash('sha256').update(text).digest();
    for (let i = 0; i < 384; i++) {
      const k = Math.floor(i / 12);
      e[i] = ((bytes[i % 32] ^ (k * 31)) / 255 - 0.5) * 2;
    }
    return e;
  }

  pickCloudProvider() {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    if (this.cloudFallback.provider && available.some(p => p.id === this.cloudFallback.provider)) return this.cloudFallback.provider;
    if (available.length > 0) return available[0].id;
    throw new Error('No configured cloud provider with a token (use cloud:set-token).');
  }

  pickCloudModel(providerId) {
    const available = this.cloud.getAvailableProviders ? this.cloud.getAvailableProviders() : [];
    const p = available.find(p => p.id === providerId);
    if (!p || !p.models || !p.models.length) return null;
    const prefs = ['qwen-vl', 'llava', 'llama-vision', 'clip'];
    for (const pref of prefs) { const hit = p.models.find(m => m.toLowerCase().includes(pref)); if (hit) return hit; }
    return p.models[0];
  }

  getModelInfo() { if (!this.modelInfo) throw new Error('Not initialized'); return this.modelInfo; }
  makeHealthPng() { const w = this.config.inputSize.width, h = this.config.inputSize.height; const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 128; raw[i + 1] = 128; raw[i + 2] = 128; } } const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([t, data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); }; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); return png; }
  async healthCheck() { if (!this.initialized) return false; try { const dummy = this.makeHealthPng(); await this.encodeInternal(dummy, 'image/png', { permittedModalities: ['image'] }); return true; } catch (e) { console.warn('[SME-VIS] health check failed:', e.message); return false; } }
  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: this.modelInfo?.modelVersion, backend: this.backend }; }
  async shutdown() { if (this.session) { this.session.free(); this.session = null; } this.initialized = false; }
  assertInitialized() { if (!this.initialized) throw new Error('SME-VIS not initialized'); }
  generateModelVersion(p) { return `v1.0.0-${crypto.createHash('sha256').update(p).digest('hex').slice(0, 16)}`; }
  estimateParams(t) { const m = { 'mobilevit': 1300000, 'efficientnet': 5300000, 'vit-tiny': 5700000, 'vit-small': 22000000, 'resnet-pruned': 11000000 }; return m[t] || 5000000; }
  generateEvidenceId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`; }
}

module.exports = { SmeVisModule };
