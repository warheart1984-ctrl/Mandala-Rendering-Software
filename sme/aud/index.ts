/**
 * SME-AUD: Audio Module
 * CPU-optimized speech recognition via whisper.cpp / faster-whisper
 * Supports transcription, translation, and audio embedding
 */

import { 
  SmeAudIFC, SmeAudConfig, SmeAudInput, SmeAudOutput,
  SmeAudClassifyOutput, TranscribeOptions, TranscriptSegment,
  WordTimestamp, AudioLabel, SmeModelInfo, ModuleHealth,
  EvidenceId, ModelVersion, AuthorityGrant, SmeModule
} from '../contracts';

interface WhisperInstance {
  context: any;
  params: any;
  free: () => void;
}

interface FasterWhisperInstance {
  model: any;
  free: () => void;
}

export class SmeAudModule implements SmeAudIFC, SmeModule {
  public readonly moduleId = 'sme-aud';
  public readonly moduleType = 'aud' as const;
  
  private config: SmeAudConfig | null = null;
  private whisper: WhisperInstance | null = null;
  private fasterWhisper: FasterWhisperInstance | null = null;
  private modelInfo: SmeModelInfo | null = null;
  private initialized = false;
  private backend: 'whisper.cpp' | 'faster-whisper' = 'whisper.cpp';

  async initialize(config: SmeAudConfig): Promise<void> {
    this.config = config;
    
    try {
      // Try faster-whisper first (better CPU performance)
      if (await this.tryFasterWhisper(config)) {
        this.backend = 'faster-whisper';
      } else if (await this.tryWhisperCpp(config)) {
        this.backend = 'whisper.cpp';
      } else {
        throw new Error('No supported Whisper backend available. Install whisper.cpp or faster-whisper.');
      }

      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: `whisper-${config.modelType}`,
        modelVersion: this.generateModelVersion(config.modelPath),
        framework: this.backend,
        frameworkVersion: this.backend === 'faster-whisper' ? '1.0+' : '1.5+',
        parameters: this.estimateParams(config.modelType),
        quantization: config.quantization,
        device: config.device,
        capabilities: ['transcription', 'translation', 'language-detection', 'voice-activity-detection', 'audio-embedding'],
        loaded: true
      };
      
      this.initialized = true;
      console.log(`[SME-AUD] Initialized with ${this.backend}: ${config.modelType}`);
    } catch (error) {
      console.error('[SME-AUD] Initialization failed:', error);
      throw error;
    }
  }

  private async tryFasterWhisper(config: SmeAudConfig): Promise<boolean> {
    try {
      // Dynamic import for faster-whisper
      const fw = await import('faster-whisper-node') as any;
      
      // Model paths for faster-whisper (ctranslate2 format)
      const modelMap: Record<string, string> = {
        'whisper-tiny': 'tiny',
        'whisper-base': 'base',
        'whisper-small': 'small',
        'whisper-medium': 'medium',
        'whisper-large': 'large-v3'
      };
      
      const modelName = modelMap[config.modelType] || 'tiny';
      
      this.fasterWhisper = {
        model: await fw.WhisperModel.create(modelName, {
          device: config.device === 'cuda' ? 'cuda' : 'cpu',
          compute_type: config.computeType || 'int8',
          cpu_threads: 4,
          num_workers: 2
        }),
        free: () => {}
      };
      
      return true;
    } catch (error) {
      console.log('[SME-AUD] faster-whisper not available:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async tryWhisperCpp(config: SmeAudConfig): Promise<boolean> {
    try {
      // Dynamic import for whisper.cpp
      const whisper = await import('whisper-node') as any;
      
      // Model path for whisper.cpp (ggml format)
      const modelPath = config.modelPath || this.getWhisperCppModelPath(config.modelType);
      
      this.whisper = {
        context: await whisper.WhisperContext.create(modelPath, {
          use_gpu: config.device === 'cuda',
          n_threads: 4
        }),
        params: {
          language: config.language,
          translate: false,
          n_threads: 4,
          max_context: -1,
          max_len: 0
        },
        free: () => {}
      };
      
      return true;
    } catch (error) {
      console.log('[SME-AUD] whisper.cpp not available:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private getWhisperCppModelPath(modelType: string): string {
    const modelMap: Record<string, string> = {
      'whisper-tiny': 'models/ggml-tiny.bin',
      'whisper-base': 'models/ggml-base.bin',
      'whisper-small': 'models/ggml-small.bin',
      'whisper-medium': 'models/ggml-medium.bin',
      'whisper-large': 'models/ggml-large-v3.bin'
    };
    return modelMap[modelType] || 'models/ggml-tiny.bin';
  }

  async transcribe(input: SmeAudInput): Promise<SmeAudOutput> {
    this.assertInitialized();
    
    // Validate authority
    if (!input.authorityGrant.permittedModalities.includes('audio')) {
      throw new Error('Authority grant does not permit audio modality');
    }
    
    const options = input.options || {};
    const language = options.language || this.config!.language;
    const task = options.task || 'transcribe';
    const wordTimestamps = options.wordTimestamps ?? true;
    const vadFilter = options.vadFilter ?? true;
    
    let result: { text: string; segments: TranscriptSegment[]; duration: number };
    
    if (this.backend === 'faster-whisper') {
      result = await this.transcribeFasterWhisper(input.audioData, {
        language,
        task,
        word_timestamps: wordTimestamps,
        vad_filter: vadFilter
      });
    } else {
      result = await this.transcribeWhisperCpp(input.audioData, {
        language,
        translate: task === 'translate',
        word_timestamps: wordTimestamps
      });
    }
    
    // Generate embedding from transcription
    const embedding = await this.generateEmbedding(result.text);
    const evidenceId = this.generateEvidenceId();
    
    return {
      transcript: result.text,
      segments: result.segments,
      embedding,
      evidenceId,
      modelVersion: this.modelInfo!.modelVersion,
      durationSec: result.duration
    };
  }

  async classify(input: SmeAudInput): Promise<SmeAudClassifyOutput> {
    this.assertInitialized();
    
    // Transcribe first
    const transcription = await this.transcribe(input);
    
    // Classify based on transcription content
    const labels = await this.classifyAudio(transcription.transcript);
    const embedding = transcription.embedding;
    const evidenceId = this.generateEvidenceId();
    
    return {
      labels,
      embedding,
      evidenceId
    };
  }

  private async transcribeFasterWhisper(
    audioData: Buffer, 
    options: { language?: string; task?: string; word_timestamps?: boolean; vad_filter?: boolean }
  ): Promise<{ text: string; segments: TranscriptSegment[]; duration: number }> {
    if (!this.fasterWhisper?.model) {
      throw new Error('faster-whisper not initialized');
    }
    
    // Convert audio buffer to format expected by faster-whisper
    // In production, use proper audio decoding (ffmpeg/wav)
    const audioFloat32 = this.audioBufferToFloat32(audioData);
    
    const result = await this.fasterWhisper.model.transcribe(audioFloat32, {
      language: options.language,
      task: options.task || 'transcribe',
      word_timestamps: options.word_timestamps ?? true,
      vad_filter: options.vad_filter ?? true,
      vad_parameters: {
        min_silence_duration_ms: 500,
        speech_pad_ms: 400
      }
    });
    
    const segments: TranscriptSegment[] = result.segments.map((seg: any, idx: number) => ({
      id: idx,
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.9,
      words: seg.words?.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.probability || 0.9
      }))
    }));
    
    return {
      text: result.text,
      segments,
      duration: result.duration || segments[segments.length - 1]?.end || 0
    };
  }

  private async transcribeWhisperCpp(
    audioData: Buffer, 
    options: { language?: string; translate?: boolean; word_timestamps?: boolean }
  ): Promise<{ text: string; segments: TranscriptSegment[]; duration: number }> {
    if (!this.whisper?.context) {
      throw new Error('whisper.cpp not initialized');
    }
    
    const audioFloat32 = this.audioBufferToFloat32(audioData);
    
    const result = await this.whisper.context.transcribe(audioFloat32, {
      language: options.language,
      translate: options.translate || false,
      word_timestamps: options.word_timestamps ?? true,
      max_len: 0,
      max_context: -1
    });
    
    const segments: TranscriptSegment[] = result.segments.map((seg: any, idx: number) => ({
      id: idx,
      start: seg.t0 / 100, // Convert to seconds
      end: seg.t1 / 100,
      text: seg.text.trim(),
      confidence: 0.9,
      words: seg.words?.map((w: any) => ({
        word: w.word,
        start: w.t0 / 100,
        end: w.t1 / 100,
        confidence: w.probability || 0.9
      }))
    }));
    
    return {
      text: result.text,
      segments,
      duration: segments[segments.length - 1]?.end || 0
    };
  }

  private audioBufferToFloat32(audioData: Buffer): Float32Array {
    // Simplified: assumes 16-bit PCM WAV
    // In production, use proper audio decoding (wav-decoder, ffmpeg)
    if (audioData.length < 44) {
      throw new Error('Invalid WAV file: too small');
    }
    
    // Parse WAV header
    const sampleRate = audioData.readUInt32LE(24);
    const bitsPerSample = audioData.readUInt16LE(34);
    const numChannels = audioData.readUInt16LE(22);
    const dataOffset = 44; // Standard WAV header size
    
    if (bitsPerSample !== 16) {
      throw new Error(`Unsupported bit depth: ${bitsPerSample}. Expected 16-bit PCM.`);
    }
    
    const samples = (audioData.length - dataOffset) / 2;
    const float32 = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      const sample = audioData.readInt16LE(dataOffset + i * 2);
      float32[i] = sample / 32768.0; // Normalize to [-1, 1]
    }
    
    // Resample to 16kHz if needed (Whisper expects 16kHz)
    if (sampleRate !== 16000) {
      return this.resample(float32, sampleRate, 16000);
    }
    
    return float32;
  }

  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return input;
    
    const ratio = fromRate / toRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const idx = Math.floor(srcIndex);
      const frac = srcIndex - idx;
      
      if (idx + 1 < input.length) {
        output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
      } else {
        output[i] = input[idx];
      }
    }
    
    return output;
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    // Generate embedding from transcription text
    // In production, use a sentence transformer model
    // For now, create a simple hash-based embedding
    const hash = require('crypto').createHash('sha256').update(text).digest();
    const embedding = new Float32Array(384); // Standard sentence embedding dim
    
    for (let i = 0; i < 384; i++) {
      embedding[i] = (hash[i % 32] / 255 - 0.5) * 2; // [-1, 1]
    }
    
    return embedding;
  }

  private async classifyAudio(text: string): Promise<AudioLabel[]> {
    // Simple keyword-based classification
    // In production, use a proper audio classification model
    const labels: AudioLabel[] = [];
    const lower = text.toLowerCase();
    
    const categories = {
      'speech': ['hello', 'hi', 'yes', 'no', 'what', 'how', 'why', 'when', 'where'],
      'question': ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which'],
      'command': ['do', 'make', 'create', 'run', 'start', 'stop', 'go', 'execute'],
      'music': ['song', 'music', 'play', 'sing', 'melody', 'rhythm'],
      'noise': ['noise', 'sound', 'loud', 'quiet', 'silence', 'background']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      let matches = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) matches++;
      }
      if (matches > 0) {
        labels.push({
          label: category,
          confidence: Math.min(0.5 + matches * 0.1, 0.95)
        });
      }
    }
    
    return labels;
  }

  getModelInfo(): SmeModelInfo {
    if (!this.modelInfo) throw new Error('Not initialized');
    return this.modelInfo;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      // Test with 1 second of silence
      const silence = new Float32Array(16000);
      const buffer = Buffer.from(silence.buffer);
      
      if (this.backend === 'faster-whisper' && this.fasterWhisper?.model) {
        await this.fasterWhisper.model.transcribe(silence, { language: 'en' });
      } else if (this.whisper?.context) {
        await this.whisper.context.transcribe(silence, { language: 'en' });
      }
      return true;
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
    if (this.whisper) {
      this.whisper.context?.free?.();
      this.whisper = null;
    }
    if (this.fasterWhisper) {
      this.fasterWhisper.model?.free?.();
      this.fasterWhisper = null;
    }
    this.initialized = false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-AUD not initialized. Call initialize() first.');
    }
  }

  private generateModelVersion(modelPath: string): ModelVersion {
    const hash = require('crypto').createHash('sha256').update(modelPath).digest('hex').slice(0, 16);
    return `v1.0.0-${hash}` as ModelVersion;
  }

  private estimateParams(modelType: string): number {
    const params: Record<string, number> = {
      'whisper-tiny': 39_000_000,
      'whisper-base': 74_000_000,
      'whisper-small': 244_000_000,
      'whisper-medium': 769_000_000,
      'whisper-large': 1_550_000_000
    };
    return params[modelType] || 39_000_000;
  }

  private generateEvidenceId(): EvidenceId {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EvidenceId;
  }
}

export default SmeAudModule;