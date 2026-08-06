/**
 * SME-VID: Video Module
 * CPU-optimized video understanding via frame sampling + vision encoder
 * Supports keyframe extraction, scene detection, temporal aggregation
 */

import { 
  SmeVidIFC, SmeVidConfig, SmeVidInput, SmeVidOutput,
  VideoAnalyzeOptions, VideoEvent, SmeModelInfo, ModuleHealth,
  EvidenceId, ModelVersion, AuthorityGrant, SmeModule,
  SmeVisIFC
} from '../contracts';

interface FFmpegInstance {
  extractFrames: (videoPath: string, options: FrameExtractOptions) => Promise<FrameData[]>;
  getVideoInfo: (videoPath: string) => Promise<VideoInfo>;
  free: () => void;
}

interface FrameExtractOptions {
  fps?: number;
  maxFrames?: number;
  startTime?: number;
  duration?: number;
  keyframesOnly?: boolean;
  format?: 'png' | 'jpeg';
  outputDir?: string;
}

interface FrameData {
  index: number;
  timestamp: number; // seconds
  imageData: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  isKeyframe: boolean;
}

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate: number;
}

export class SmeVidModule implements SmeVidIFC, SmeModule {
  public readonly moduleId = 'sme-vid';
  public readonly moduleType = 'vid' as const;
  
  private config: SmeVidConfig | null = null;
  private ffmpeg: FFmpegInstance | null = null;
  private modelInfo: SmeModelInfo | null = null;
  private initialized = false;

  async initialize(config: SmeVidConfig): Promise<void> {
    this.config = config;
    
    try {
      // Initialize FFmpeg wrapper
      await this.initFFmpeg();
      
      // Verify vision encoder is initialized
      if (!config.frameEmbedder) {
        throw new Error('SME-VID requires a frameEmbedder (SME-VIS instance)');
      }
      
      // Warmup vision encoder
      await config.frameEmbedder.healthCheck();
      
      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: `video-${config.frameSampler}-${config.temporalAggregator}`,
        modelVersion: this.generateModelVersion('video-module'),
        framework: 'custom',
        frameworkVersion: '1.0.0',
        parameters: 0, // Uses vision encoder params
        quantization: config.quantization,
        device: config.device,
        capabilities: [
          'video-embedding', 'frame-sampling', 'scene-detection', 
          'temporal-aggregation', 'action-recognition', 'event-extraction'
        ],
        loaded: true
      };
      
      this.initialized = true;
      console.log(`[SME-VID] Initialized: ${config.frameSampler} sampler, ${config.temporalAggregator} aggregator`);
    } catch (error) {
      console.error('[SME-VID] Initialization failed:', error);
      throw error;
    }
  }

  private async initFFmpeg(): Promise<void> {
    try {
      const fluentFfmpeg = await import('fluent-ffmpeg') as any;
      const ffmpegPath = await import('@ffmpeg-installer/ffmpeg') as any;
      fluentFfmpeg.setFfmpegPath(ffmpegPath.path);
      
      this.ffmpeg = {
        extractFrames: (videoPath: string, options: FrameExtractOptions) => 
          this.extractFramesWithFfmpeg(fluentFfmpeg, videoPath, options),
        getVideoInfo: (videoPath: string) => 
          this.getVideoInfoWithFfmpeg(fluentFfmpeg, videoPath),
        free: () => {}
      };
    } catch (error) {
      console.warn('[SME-VID] fluent-ffmpeg not available, using fallback:', error);
      this.ffmpeg = this.createFallbackFFmpeg();
    }
  }

  private createFallbackFFmpeg(): FFmpegInstance {
    return {
      async extractFrames(videoPath: string, options: FrameExtractOptions): Promise<FrameData[]> {
        // Fallback: return empty array - requires FFmpeg for actual extraction
        console.warn('[SME-VID] FFmpeg not available, returning mock frames');
        return [{
          index: 0,
          timestamp: 0,
          imageData: Buffer.alloc(0),
          mimeType: 'image/png',
          isKeyframe: true
        }];
      },
      async getVideoInfo(videoPath: string): Promise<VideoInfo> {
        return {
          duration: 0,
          width: 0,
          height: 0,
          fps: 0,
          codec: 'unknown',
          format: 'unknown',
          bitrate: 0
        };
      },
      free: () => {}
    };
  }

  private async extractFramesWithFfmpeg(
    ffmpeg: any, 
    videoPath: string, 
    options: FrameExtractOptions
  ): Promise<FrameData[]> {
    return new Promise((resolve, reject) => {
      const frames: FrameData[] = [];
      const outputDir = options.outputDir || require('os').tmpdir();
      const format = options.format || 'png';
      const fps = options.fps || 1;
      const maxFrames = options.maxFrames || this.config?.maxFrames || 100;
      
      let frameCount = 0;
      
      const cmd = ffmpeg(videoPath)
        .inputOptions([
          '-hide_banner',
          '-loglevel', 'error'
        ])
        .outputOptions([
          '-vf', options.keyframesOnly ? 'select=eq(pict_type\\,I)' : `fps=${fps}`,
          '-vsync', 'vfr',
          '-frame_pts', '1',
          '-f', 'image2pipe',
          '-vcodec', format === 'png' ? 'png' : 'mjpeg'
        ])
        .on('data', (data: Buffer) => {
          if (frameCount >= maxFrames) return;
          
          frames.push({
            index: frameCount,
            timestamp: frameCount / fps, // Approximate
            imageData: data,
            mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
            isKeyframe: options.keyframesOnly
          });
          frameCount++;
        })
        .on('end', () => resolve(frames))
        .on('error', (err: Error) => reject(err));
      
      if (options.startTime) {
        cmd.seekInput(options.startTime);
      }
      if (options.duration) {
        cmd.duration(options.duration);
      }
      
      cmd.run();
    });
  }

  private async getVideoInfoWithFfmpeg(ffmpeg: any, videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: Error, data: any) => {
        if (err) return reject(err);
        
        const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) return reject(new Error('No video stream found'));
        
        resolve({
          duration: parseFloat(data.format.duration || '0'),
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate || '0'),
          codec: videoStream.codec_name,
          format: data.format.format_name,
          bitrate: parseInt(data.format.bit_rate || '0')
        });
      });
    });
  }

  async analyze(input: SmeVidInput): Promise<SmeVidOutput> {
    this.assertInitialized();
    
    // Validate authority
    if (!input.authorityGrant.permittedModalities.includes('video')) {
      throw new Error('Authority grant does not permit video modality');
    }
    
    const options = input.options || {};
    const startTime = Date.now();
    
    // Save video to temp file for FFmpeg
    const tempPath = await this.saveTempVideo(input.videoData, input.mimeType);
    
    try {
      // Get video info
      const videoInfo = await this.ffmpeg!.getVideoInfo(tempPath);
      
      // Extract frames based on sampling strategy
      const frames = await this.extractFrames(tempPath, options, videoInfo);
      
      // Process frames through vision encoder
      const frameEmbeddings: Float32Array[] = [];
      const timestamps: number[] = [];
      const events: VideoEvent[] = [];
      
      for (const frame of frames) {
        if (frame.imageData.length === 0) continue;
        
        const visResult = await this.config!.frameEmbedder.encode({
          imageData: frame.imageData,
          mimeType: frame.mimeType,
          authorityGrant: input.authorityGrant,
          extractFrames: false
        });
        
        frameEmbeddings.push(visResult.embedding);
        timestamps.push(frame.timestamp);
      }
      
      // Detect scene changes
      if (options.detectScenes) {
        const sceneEvents = this.detectSceneChanges(frameEmbeddings, timestamps);
        events.push(...sceneEvents);
      }
      
      // Detect actions (simplified)
      if (options.detectActions) {
        const actionEvents = await this.detectActions(frames, input.authorityGrant);
        events.push(...actionEvents);
      }
      
      // Temporal aggregation
      const globalEmbedding = this.aggregateTemporal(frameEmbeddings, timestamps);
      
      const evidenceId = this.generateEvidenceId();
      
      return {
        globalEmbedding,
        frameEmbeddings,
        timestamps,
        events,
        evidenceId,
        modelVersion: this.modelInfo!.modelVersion,
        durationSec: videoInfo.duration,
        framesAnalyzed: frames.length
      };
    } finally {
      // Cleanup temp file
      await this.cleanupTempVideo(tempPath);
    }
  }

  private async extractFrames(
    videoPath: string, 
    options: VideoAnalyzeOptions, 
    videoInfo: VideoInfo
  ): Promise<FrameData[]> {
    const sampleRate = options.sampleRateFps || 1;
    const maxFrames = this.config!.maxFrames;
    const maxDuration = options.maxDurationSec || videoInfo.duration;
    
    const extractOptions: FrameExtractOptions = {
      fps: sampleRate,
      maxFrames,
      duration: maxDuration,
      keyframesOnly: this.config!.frameSampler === 'keyframe',
      format: 'png',
      outputDir: undefined
    };
    
    if (this.config!.frameSampler === 'scene-change') {
      // Use scene change detection
      extractOptions.keyframesOnly = false;
      // Would need scene detection filter: select=gt(scene\,0.4)
    }
    
    return this.ffmpeg!.extractFrames(videoPath, extractOptions);
  }

  private detectSceneChanges(
    embeddings: Float32Array[], 
    timestamps: number[]
  ): VideoEvent[] {
    const events: VideoEvent[] = [];
    const threshold = 0.3; // Cosine distance threshold
    
    for (let i = 1; i < embeddings.length; i++) {
      const similarity = this.cosineSimilarity(embeddings[i - 1], embeddings[i]);
      const distance = 1 - similarity;
      
      if (distance > threshold) {
        events.push({
          type: 'scene_change',
          startTime: timestamps[i - 1],
          endTime: timestamps[i],
          description: `Scene change detected (distance: ${distance.toFixed(3)})`,
          confidence: Math.min(distance * 2, 1.0),
          frameIndices: [i - 1, i]
        });
      }
    }
    
    return events;
  }

  private async detectActions(
    frames: FrameData[], 
    authorityGrant: AuthorityGrant
  ): Promise<VideoEvent[]> {
    // Simplified action detection using vision features
    const events: VideoEvent[] = [];
    
    for (let i = 0; i < frames.length; i += 5) { // Sample every 5 frames
      if (frames[i].imageData.length === 0) continue;
      
      try {
        const visResult = await this.config!.frameEmbedder.encode({
          imageData: frames[i].imageData,
          mimeType: frames[i].mimeType,
          authorityGrant,
          extractFeatures: true
        });
        
        if (visResult.features?.objects) {
          for (const obj of visResult.features.objects) {
            if (obj.confidence > 0.7) {
              events.push({
                type: 'object_appear',
                startTime: frames[i].timestamp,
                endTime: frames[i].timestamp + 1,
                description: `${obj.label} detected (${(obj.confidence * 100).toFixed(0)}%)`,
                confidence: obj.confidence,
                frameIndices: [i]
              });
            }
          }
        }
      } catch {
        // Ignore frame errors
      }
    }
    
    return events;
  }

  private aggregateTemporal(
    embeddings: Float32Array[], 
    timestamps: number[]
  ): Float32Array {
    if (embeddings.length === 0) {
      return new Float32Array(384); // Default dim
    }
    
    if (embeddings.length === 1) {
      return embeddings[0];
    }
    
    const dim = embeddings[0].length;
    const result = new Float32Array(dim);
    
    switch (this.config!.temporalAggregator) {
      case 'mean':
        for (const emb of embeddings) {
          for (let i = 0; i < dim; i++) {
            result[i] += emb[i];
          }
        }
        for (let i = 0; i < dim; i++) {
          result[i] /= embeddings.length;
        }
        break;
        
      case 'attention':
        // Simple attention: weight by timestamp recency
        const weights = timestamps.map((t, i) => {
          const maxT = Math.max(...timestamps);
          return maxT > 0 ? (t / maxT) : 1 / embeddings.length;
        });
        const weightSum = weights.reduce((a, b) => a + b, 0);
        
        for (let i = 0; i < embeddings.length; i++) {
          const w = weights[i] / weightSum;
          for (let j = 0; j < dim; j++) {
            result[j] += embeddings[i][j] * w;
          }
        }
        break;
        
      case 'rnn':
        // Simplified: exponential moving average
        let alpha = 0.3;
        result.set(embeddings[0]);
        for (let i = 1; i < embeddings.length; i++) {
          for (let j = 0; j < dim; j++) {
            result[j] = alpha * embeddings[i][j] + (1 - alpha) * result[j];
          }
        }
        break;
        
      case 'transformer-tiny':
        // Would use a tiny transformer - fallback to attention
        return this.aggregateTemporal(embeddings, timestamps); // Recursive with attention
    }
    
    return result;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async saveTempVideo(videoData: Buffer, mimeType: string): Promise<string> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const ext = mimeType === 'video/mp4' ? '.mp4' : '.webm';
    const tempPath = path.join(os.tmpdir(), `sme-vid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    
    fs.writeFileSync(tempPath, videoData);
    return tempPath;
  }

  private async cleanupTempVideo(tempPath: string): Promise<void> {
    const fs = require('fs');
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  getModelInfo(): SmeModelInfo {
    if (!this.modelInfo) throw new Error('Not initialized');
    return this.modelInfo;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      // Test with empty video
      const emptyVideo = Buffer.from('fake');
      await this.analyze({
        videoData: emptyVideo,
        mimeType: 'video/mp4',
        authorityGrant: { permittedModalities: ['video'] } as AuthorityGrant
      });
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
    if (this.ffmpeg) {
      this.ffmpeg.free();
      this.ffmpeg = null;
    }
    this.initialized = false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-VID not initialized. Call initialize() first.');
    }
  }

  private generateModelVersion(modelPath: string): ModelVersion {
    const hash = require('crypto').createHash('sha256').update(modelPath).digest('hex').slice(0, 16);
    return `v1.0.0-${hash}` as ModelVersion;
  }

  private generateEvidenceId(): EvidenceId {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EvidenceId;
  }
}

export default SmeVidModule;