/**
 * SME-VIS: Vision Module
 * CPU-optimized image encoding via MobileViT / ViT-tiny / EfficientNet
 * ONNX Runtime for cross-platform CPU inference
 */

import { 
  SmeVisIFC, SmeVisConfig, SmeVisInput, SmeVisOutput,
  SmeModelInfo, ModuleHealth, EvidenceId, ModelVersion,
  AuthorityGrant, VisionFeatures, DetectedObject,
  SceneLabel, AttributeLabel, ColorPalette, PreprocessingInfo,
  SmeModule
} from '../contracts';

interface OnnxVisionSession {
  session: any;
  inputName: string;
  outputName: string;
  inputShape: number[];
  free: () => void;
}

interface ImagePreprocessor {
  resize: (img: any, width: number, height: number) => any;
  normalize: (img: any, mean: number[], std: number[]) => any;
  toTensor: (img: any) => Float32Array;
}

export class SmeVisModule implements SmeVisIFC, SmeModule {
  public readonly moduleId = 'sme-vis';
  public readonly moduleType = 'vis' as const;
  
  private config: SmeVisConfig | null = null;
  private session: OnnxVisionSession | null = null;
  private preprocessor: ImagePreprocessor | null = null;
  private modelInfo: SmeModelInfo | null = null;
  private initialized = false;
  private classLabels: string[] = [];
  private featureLabels: Map<string, string[]> = new Map();

  async initialize(config: SmeVisConfig): Promise<void> {
    this.config = config;
    
    try {
      // Load ONNX Runtime
      const ort = await import('onnxruntime-node') as any;
      
      // Determine model path
      const modelPath = this.resolveModelPath(config);
      
      // Create session
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: this.getExecutionProviders(config.device),
        intraOpNumThreads: 4,
        interOpNumThreads: 2
      });
      
      // Get input/output info
      const inputMeta = session.inputNames[0];
      const outputMeta = session.outputNames[0];
      const inputShape = session.inputMetadata[inputMeta].dimensions;
      
      this.session = {
        session,
        inputName: inputMeta,
        outputName: outputMeta,
        inputShape,
        free: () => session.release()
      };
      
      // Setup preprocessor
      this.preprocessor = this.createPreprocessor(config.inputSize);
      
      // Load labels
      await this.loadLabels(config);
      
      // Warmup
      await this.warmup();
      
      this.modelInfo = {
        moduleId: this.moduleId,
        modelName: config.modelType,
        modelVersion: this.generateModelVersion(config.modelPath),
        framework: 'onnx',
        frameworkVersion: ort.version,
        parameters: this.estimateParams(config.modelType),
        quantization: config.quantization,
        device: config.device,
        capabilities: ['image-embedding', 'object-detection', 'scene-classification', 'feature-extraction'],
        loaded: true
      };
      
      this.initialized = true;
      console.log(`[SME-VIS] Initialized: ${config.modelType} on ${config.device}`);
    } catch (error) {
      console.error('[SME-VIS] Initialization failed:', error);
      throw error;
    }
  }

  private resolveModelPath(config: SmeVisConfig): string {
    // In production, download from model zoo or use local path
    const modelMap: Record<string, string> = {
      'mobilevit': 'models/mobilevit_xxs.onnx',
      'efficientnet': 'models/efficientnet_b0.onnx',
      'vit-tiny': 'models/vit_tiny_patch16_224.onnx',
      'vit-small': 'models/vit_small_patch16_224.onnx',
      'resnet-pruned': 'models/resnet18_pruned.onnx'
    };
    
    return modelMap[config.modelType] || config.modelPath;
  }

  private getExecutionProviders(device: string): string[] {
    switch (device) {
      case 'cuda': return ['cuda', 'cpu'];
      case 'directml': return ['dml', 'cpu'];
      case 'cpu':
      default: return ['cpu'];
    }
  }

  private createPreprocessor(inputSize: { width: number; height: number }): ImagePreprocessor {
    // Using sharp for image processing
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      console.warn('[SME-VIS] sharp not installed, using fallback');
    }
    
    return {
      async resize(imgBuffer: Buffer, width: number, height: number): Promise<Buffer> {
        if (sharp) {
          return sharp(imgBuffer).resize(width, height, { fit: 'inside', withoutEnlargement: true }).toBuffer();
        }
        // Fallback: return as-is (will fail if wrong size)
        return imgBuffer;
      },
      
      normalize(imgData: Uint8Array, mean: number[], std: number[]): Float32Array {
        const float = new Float32Array(imgData.length);
        for (let i = 0; i < imgData.length; i++) {
          const c = i % 3;
          float[i] = (imgData[i] / 255 - mean[c]) / std[c];
        }
        return float;
      },
      
      toTensor(imgData: Uint8Array): Float32Array {
        // Convert HWC to CHW
        const channels = 3;
        const height = Math.sqrt(imgData.length / channels);
        const width = height;
        const tensor = new Float32Array(channels * height * width);
        
        for (let c = 0; c < channels; c++) {
          for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) {
              tensor[c * height * width + h * width + w] = imgData[(h * width + w) * channels + c];
            }
          }
        }
        return tensor;
      }
    };
  }

  private async loadLabels(config: SmeVisConfig): Promise<void> {
    // Load ImageNet labels for classification
    try {
      const response = await fetch('https://raw.githubusercontent.com/anishathalye/imagenet-simple-labels/master/imagenet-simple-labels.json');
      this.classLabels = await response.json();
    } catch {
      // Fallback minimal labels
      this.classLabels = ['object', 'scene', 'person', 'animal', 'vehicle', 'building', 'nature', 'indoor'];
    }
    
    // Feature labels
    this.featureLabels.set('objects', [
      'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
      'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
      'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
      'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball'
    ]);
    
    this.featureLabels.set('scenes', [
      'indoor', 'outdoor', 'urban', 'rural', 'nature', 'office', 'home', 'street', 'park',
      'beach', 'mountain', 'forest', 'desert', 'water', 'sky', 'building', 'room'
    ]);
    
    this.featureLabels.set('attributes', [
      'bright', 'dark', 'colorful', 'monochrome', 'sharp', 'blurry', 'close-up', 'wide-angle',
      'portrait', 'landscape', 'macro', 'architectural', 'natural', 'artificial'
    ]);
    
    this.featureLabels.set('colors', [
      'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'gray'
    ]);
  }

  private async warmup(): Promise<void> {
    if (!this.session || !this.preprocessor) return;
    
    // Create dummy input
    const dummy = new Uint8Array(this.config!.inputSize.width * this.config!.inputSize.height * 3);
    for (let i = 0; i < dummy.length; i++) dummy[i] = Math.floor(Math.random() * 255);
    
    try {
      await this.encodeInternal(dummy, 'image/png', { permittedModalities: ['image'] } as AuthorityGrant);
    } catch {
      // Warmup failure is non-fatal
    }
  }

  async encode(input: SmeVisInput): Promise<SmeVisOutput> {
    this.assertInitialized();
    
    // Validate authority
    if (!input.authorityGrant.permittedModalities.includes('image')) {
      throw new Error('Authority grant does not permit image modality');
    }
    
    return this.encodeInternal(input.imageData, input.mimeType, input.authorityGrant, input.extractFeatures);
  }

  async encodeBatch(inputs: SmeVisInput[]): Promise<SmeVisOutput[]> {
    this.assertInitialized();
    
    const results = await Promise.all(inputs.map(input => 
      this.encodeInternal(input.imageData, input.mimeType, input.authorityGrant, input.extractFeatures)
    ));
    
    return results;
  }

  private async encodeInternal(
    imageData: Buffer | Uint8Array, 
    mimeType: string, 
    authorityGrant: AuthorityGrant,
    extractFeatures = false
  ): Promise<SmeVisOutput> {
    if (!this.session || !this.preprocessor) {
      throw new Error('SME-VIS not initialized');
    }
    
    const startTime = Date.now();
    
    // Decode image
    let imgBuffer: Buffer;
    if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      imgBuffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData);
    } else {
      throw new Error(`Unsupported image format: ${mimeType}`);
    }
    
    // Preprocess
    const resized = await this.preprocessor!.resize(imgBuffer, this.config!.inputSize.width, this.config!.inputSize.height);
    
    // Convert to tensor (simplified - in production use sharp/canvas)
    const tensor = this.imageToTensor(resized);
    
    // Normalize (ImageNet stats)
    const normalized = this.preprocessor!.normalize(
      new Uint8Array(tensor.buffer), 
      [0.485, 0.456, 0.406], 
      [0.229, 0.224, 0.225]
    );
    
    // Run inference
    const ort = await import('onnxruntime-node') as any;
    const inputTensor = new ort.Tensor('float32', normalized, [1, 3, this.config!.inputSize.height, this.config!.inputSize.width]);
    
    const results = await this.session!.session.run({ [this.session!.inputName]: inputTensor });
    const output = results[this.session!.outputName];
    
    // Extract embedding (last hidden state or pooled output)
    const embedding = this.extractEmbedding(output.data);
    
    // Extract features if requested
    let features: VisionFeatures | undefined;
    if (extractFeatures) {
      features = await this.extractFeatures(output.data);
    }
    
    const evidenceId = this.generateEvidenceId();
    const preprocessingInfo: PreprocessingInfo = {
      originalSize: { width: 0, height: 0 }, // Would track actual
      resizedSize: this.config!.inputSize,
      normalization: 'ImageNet (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])'
    };
    
    return {
      embedding,
      features,
      evidenceId,
      modelVersion: this.modelInfo!.modelVersion,
      preprocessing: preprocessingInfo
    };
  }

  private imageToTensor(imgBuffer: Buffer): Float32Array {
    // Simplified: assumes RGB buffer
    // In production, use sharp/canvas to decode properly
    const float = new Float32Array(imgBuffer.length);
    for (let i = 0; i < imgBuffer.length; i++) {
      float[i] = imgBuffer[i] / 255.0;
    }
    return float;
  }

  private extractEmbedding(outputData: Float32Array): Float32Array {
    // For ViT: use [CLS] token (first token)
    // For CNN: use global average pooled features
    // For MobileViT: use final layer output
    
    // Assuming output shape: [1, seq_len, hidden_dim] or [1, hidden_dim]
    if (outputData.length > this.config!.inputSize.width * this.config!.inputSize.height) {
      // Likely [1, seq_len, hidden_dim] - take first token (CLS)
      const hiddenDim = outputData.length / (this.config!.inputSize.width * this.config!.inputSize.height / 16); // Rough estimate
      return outputData.slice(0, hiddenDim);
    }
    return outputData;
  }

  private async extractFeatures(outputData: Float32Array): Promise<VisionFeatures> {
    // Simplified feature extraction
    // In production, use detection heads or separate classifiers
    
    // Mock implementation - replace with actual detection/classification
    const objects: DetectedObject[] = [];
    const scenes: SceneLabel[] = [];
    const attributes: AttributeLabel[] = [];
    
    // Top-5 classification
    const probs = this.softmax(Array.from(outputData.slice(0, 1000)));
    const top5 = probs
      .map((p, i) => ({ prob: p, index: i }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5);
    
    for (const item of top5) {
      if (item.index < this.classLabels.length) {
        scenes.push({
          label: this.classLabels[item.index],
          confidence: item.prob
        });
      }
    }
    
    // Mock attributes based on activation patterns
    const meanAct = outputData.reduce((a, b) => a + b, 0) / outputData.length;
    if (meanAct > 0.5) attributes.push({ label: 'bright', confidence: 0.8 });
    if (meanAct < 0.2) attributes.push({ label: 'dark', confidence: 0.7 });
    
    return {
      objects,
      scenes,
      attributes,
      colors: { dominant: ['blue', 'gray'], accent: ['white'] }
    };
  }

  private softmax(logits: number[]): number[] {
    const max = Math.max(...logits);
    const exp = logits.map(l => Math.exp(l - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(e => e / sum);
  }

  getModelInfo(): SmeModelInfo {
    if (!this.modelInfo) throw new Error('Not initialized');
    return this.modelInfo;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const dummy = new Uint8Array(this.config!.inputSize.width * this.config!.inputSize.height * 3);
      await this.encodeInternal(dummy, 'image/png', { permittedModalities: ['image'] } as AuthorityGrant);
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
    if (this.session) {
      this.session.free();
      this.session = null;
    }
    this.initialized = false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-VIS not initialized. Call initialize() first.');
    }
  }

  private generateModelVersion(modelPath: string): ModelVersion {
    const hash = require('crypto').createHash('sha256').update(modelPath).digest('hex').slice(0, 16);
    return `v1.0.0-${hash}` as ModelVersion;
  }

  private estimateParams(modelType: string): number {
    const params: Record<string, number> = {
      'mobilevit': 1_300_000,
      'efficientnet': 5_300_000,
      'vit-tiny': 5_700_000,
      'vit-small': 22_000_000,
      'resnet-pruned': 11_000_000
    };
    return params[modelType] || 5_000_000;
  }

  private generateEvidenceId(): EvidenceId {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as EvidenceId;
  }
}

export default SmeVisModule;