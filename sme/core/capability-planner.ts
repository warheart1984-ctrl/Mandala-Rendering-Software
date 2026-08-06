/**
 * Capability Planner v1.0
 * First stage of the constitutional execution chain
 * Transforms USER_REQUEST into CapabilityPlan before Authority Engine
 */

import { 
  Modality, EvidenceId, ModelVersion,
  SmeTxtIFC, SmeVisIFC, SmeAudIFC, SmeVidIFC, SmeGenIFC,
  SmeModelInfo
} from '../contracts';

// ============================================================
// INPUT TYPES
// ============================================================

/** User request with intent and constraints */
export interface UserRequest {
  requestId: string;
  intent: string;
  modalities: Modality[];
  media: {
    text?: string;
    images?: Buffer[];
    audio?: Buffer[];
    video?: Buffer[];
  };
  constraints: RequestConstraints;
  privacyLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  timestamp: number;
}

/** Request constraints */
export interface RequestConstraints {
  maxLatencyMs?: number;
  localOnly?: boolean;
  noOffload?: boolean;
  maxFLOPs?: number;
  maxRAMGB?: number;
  executionMode?: 'LOCAL' | 'HYBRID' | 'OFFLOAD' | 'DEFER';
  preferDeterministic?: boolean;
  energyBudgetJoules?: number;
}

/** Hardware profile of the current node */
export interface HardwareProfile {
  profileId: 'MINI_PC' | 'LAPTOP' | 'WORKSTATION' | 'GPU_NODE';
  cpu: CPUProfile;
  gpu: GPUProfile;
  memory: MemoryProfile;
  storage: StorageProfile;
  determinismCapabilities: DeterminismCapabilities;
  energyConstraints: EnergyConstraints;
  offloadPolicy: OffloadPolicy;
  measuredAt: number;
}

/** CPU profile */
export interface CPUProfile {
  cores: number;
  threads: number;
  isa: 'AVX2' | 'AVX512' | 'NEON' | 'SVE';
  estimatedGFLOPs: number;
  hasAVX2: boolean;
  hasAVX512: boolean;
}

/** GPU profile */
export interface GPUProfile {
  count: number;
  vramGB: number;
  api: 'CUDA_10' | 'CUDA_11' | 'CUDA_12' | 'OPENCL_1_2' | 'OPENCL_2_0' | 'DIRECTML' | 'NONE';
  estimatedGFLOPs: number;
  hasTensorCores: boolean;
  deterministicKernelsAvailable: boolean;
}

/** Memory profile */
export interface MemoryProfile {
  ramGB: number;
  bandwidthGBps: number;
  availableGB: number;
}

/** Storage profile */
export interface StorageProfile {
  type: 'NVMe' | 'SSD' | 'HDD';
  ioBandwidthMBps: number;
  availableGB: number;
}

/** Determinism capabilities */
export interface DeterminismCapabilities {
  cpuDeterministic: boolean;
  gpuDeterministic: boolean;
  kvCacheDeterministic: boolean;
}

/** Energy constraints */
export interface EnergyConstraints {
  maxPowerWatts?: number;
  batteryMode?: boolean;
  thermalThrottling?: boolean;
}

/** Offload policy */
export interface OffloadPolicy {
  allowed: boolean;
  trustedEndpoints: string[];
  maxOffloadFLOPs?: number;
  requireEncryption: boolean;
  allowedDataTypes: string[];
}

/** Model profile for each SME module */
export interface ModelProfile {
  txt: ModuleModelInfo;
  vis: ModuleModelInfo;
  aud: ModuleModelInfo;
  vid: ModuleModelInfo;
  gen: ModuleModelInfo;
}

/** Individual module model info */
export interface ModuleModelInfo {
  modelName: string;
  modelVersion: ModelVersion;
  parameters: number;
  quantization: string;
  contextWindow: number;
  estimatedFLOPsPerToken: number;
  estimatedRAMGB: number;
  supportedModalities: Modality[];
}

/** Policy context */
export interface PolicyContext {
  ciemRules: PolicyRule[];
  offloadRules: OffloadRule[];
  safetyConstraints: SafetyConstraint[];
  privacyConstraints: PrivacyConstraint[];
}

/** Policy rule */
export interface PolicyRule {
  ruleId: string;
  condition: string; // Expression to evaluate
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'MODIFY';
  priority: number;
}

/** Offload rule */
export interface OffloadRule {
  ruleId: string;
  dataTypes: string[];
  allowedEndpoints: string[];
  requireEncryption: boolean;
  maxFLOPs: number;
}

/** Safety constraint */
export interface SafetyConstraint {
  constraintId: string;
  modality: Modality;
  check: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** Privacy constraint */
export interface PrivacyConstraint {
  constraintId: string;
  dataType: string;
  restriction: 'NO_OFFLOAD' | 'ENCRYPT_ONLY' | 'LOCAL_ONLY' | 'ALLOW';
}

// ============================================================
// OUTPUT TYPES
// ============================================================

/** Execution mode */
export type ExecutionMode = 'LOCAL' | 'HYBRID' | 'OFFLOAD' | 'DEFER';

/** Capability Plan - output of the planner */
export interface CapabilityPlan {
  planId: string;
  requestId: string;
  timestamp: number;
  
  // Resource estimates
  estimatedFLOPs: FLOPEstimate;
  estimatedRAM: RAMEstimate;
  estimatedBandwidth: BandwidthEstimate;
  estimatedLatency: LatencyEstimate;
  
  // Modality requirements
  requiredModalities: Modality[];
  optionalModalities: Modality[];
  
  // Execution plan
  executionMode: ExecutionMode;
  substrateHints: SubstrateHint[];
  
  // Model selection
  selectedModels: SelectedModels;
  
  // Feasibility
  feasible: boolean;
  feasibilityIssues: string[];
  
  // Evidence for replay
  planEvidence: PlanEvidence;
}

/** FLOP estimate breakdown */
export interface FLOPEstimate {
  total: number;
  byModule: Record<string, number>;
  byPrimitive: Record<string, number>;
  peak: number;
  steadyState: number;
}

/** RAM estimate breakdown */
export interface RAMEstimate {
  peakGB: number;
  steadyStateGB: number;
  byModule: Record<string, number>;
  modelWeightsGB: number;
  kvCacheGB: number;
  activationsGB: number;
}

/** Bandwidth estimate */
export interface BandwidthEstimate {
  memoryGBps: number;
  ioMBps: number;
  peak: number;
}

/** Latency estimate breakdown */
export interface LatencyEstimate {
  totalMs: number;
  byPhase: Record<string, number>;
  byModule: Record<string, number>;
  criticalPathMs: number;
}

/** Substrate hint per SKI primitive */
export interface SubstrateHint {
  primitive: 'MATMUL' | 'ATTENTION' | 'LAYER_NORM' | 'EMBED' | 'CONV';
  preferredSubstrate: string;
  reason: string;
  fallbackSubstrate?: string;
}

/** Selected models for execution */
export interface SelectedModels {
  txt: { variant: string; params: number; contextWindow: number };
  vis: { variant: string; inputSize: number };
  aud: { variant: string; maxDurationSec: number };
  vid: { variant: string; maxFrames: number };
  gen: { imageVariant?: string; audioVariant?: string; videoVariant?: string };
}

/** Plan evidence for replay */
export interface PlanEvidence {
  evidenceId: EvidenceId;
  hardwareProfileHash: string;
  modelProfileHash: string;
  policyContextHash: string;
  estimationMethod: string;
  assumptions: string[];
  computedAt: number;
}

// ============================================================
// CAPABILITY PLANNER IMPLEMENTATION
// ============================================================

export class CapabilityPlanner {
  private hardwareProfile: HardwareProfile;
  private modelProfile: ModelProfile;
  private policyContext: PolicyContext;
  
  // Constants for estimation
  private static readonly FLOPS_PER_MATMUL = (m: number, k: number, n: number) => 2 * m * k * n;
  private static readonly FLOPS_PER_ATTENTION = (b: number, t: number, d: number, h: number) => 4 * b * t * t * d;
  private static readonly FLOPS_PER_CONV = (b: number, c: number, h: number, w: number, k: number) => 2 * b * c * h * w * k * k;
  private static readonly FLOPS_PER_FFN = (b: number, t: number, d: number, ff: number) => 2 * b * t * d * ff;
  
  // Sovereign LLM v0.2 constants
  private static readonly D_MODEL = 768;
  private static readonly N_HEADS = 12;
  private static readonly N_LAYERS = 16;
  private static readonly FF_MULT = 4;
  
  constructor(
    hardwareProfile: HardwareProfile,
    modelProfile: ModelProfile,
    policyContext: PolicyContext
  ) {
    this.hardwareProfile = hardwareProfile;
    this.modelProfile = modelProfile;
    this.policyContext = policyContext;
  }

  /**
   * Main planning function - transforms UserRequest into CapabilityPlan
   */
  async plan(request: UserRequest): Promise<CapabilityPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    // 1. Determine required modalities
    const requiredModalities = this.determineRequiredModalities(request);
    const optionalModalities = this.determineOptionalModalities(request);
    
    // 2. Estimate resources per modality
    const flopEstimate = this.estimateFLOPs(request, requiredModalities);
    const ramEstimate = this.estimateRAM(request, requiredModalities);
    const bandwidthEstimate = this.estimateBandwidth(request, requiredModalities);
    const latencyEstimate = this.estimateLatency(request, requiredModalities, flopEstimate);
    
    // 3. Determine execution mode
    const executionMode = this.determineExecutionMode(request, flopEstimate, ramEstimate, latencyEstimate);
    
    // 4. Select models based on hardware and constraints
    const selectedModels = this.selectModels(executionMode, request.constraints);
    
    // 5. Generate substrate hints
    const substrateHints = this.generateSubstrateHints(request, executionMode, requiredModalities);
    
    // 6. Check feasibility
    const { feasible, issues } = this.checkFeasibility(
      executionMode, 
      flopEstimate, 
      ramEstimate, 
      latencyEstimate, 
      request.constraints
    );
    
    // 7. Generate plan evidence
    const planEvidence = this.generatePlanEvidence(request, executionMode);
    
    return {
      planId: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      requestId: request.requestId,
      timestamp: Date.now(),
      estimatedFLOPs: flopEstimate,
      estimatedRAM: ramEstimate,
      estimatedBandwidth: bandwidthEstimate,
      estimatedLatency: latencyEstimate,
      requiredModalities,
      optionalModalities,
      executionMode,
      substrateHints,
      selectedModels,
      feasible,
      feasibilityIssues: issues,
      planEvidence
    };
  }

  /**
   * Determine required modalities from request
   */
  private determineRequiredModalities(request: UserRequest): Modality[] {
    const modalities: Modality[] = [];
    
    // Always need text for reasoning
    if (request.modalities.includes('text') || request.media.text) {
      modalities.push('text');
    }
    
    if (request.modalities.includes('image') || request.media.images?.length) {
      modalities.push('image');
    }
    
    if (request.modalities.includes('audio') || request.media.audio?.length) {
      modalities.push('audio');
    }
    
    if (request.modalities.includes('video') || request.media.video?.length) {
      modalities.push('video');
    }
    
    // Default to text if nothing specified
    if (modalities.length === 0) {
      modalities.push('text');
    }
    
    return modalities;
  }

  /**
   * Determine optional modalities
   */
  private determineOptionalModalities(request: UserRequest): Modality[] {
    const all: Modality[] = ['text', 'image', 'audio', 'video'];
    const required = this.determineRequiredModalities(request);
    return all.filter(m => !required.includes(m));
  }

  /**
   * Estimate FLOPs for the request
   */
  private estimateFLOPs(request: UserRequest, modalities: Modality[]): FLOPEstimate {
    const estimates: Record<string, number> = {};
    const byPrimitive: Record<string, number> = {
      MATMUL: 0,
      ATTENTION: 0,
      LAYER_NORM: 0,
      EMBED: 0,
      CONV: 0
    };
    
    // Text (SME-TXT - Sovereign LLM v0.2)
    if (modalities.includes('text')) {
      const txtFlops = this.estimateTextFLOPs(request);
      estimates.txt = txtFlops.total;
      byPrimitive.MATMUL += txtFlops.byPrimitive.MATMUL;
      byPrimitive.ATTENTION += txtFlops.byPrimitive.ATTENTION;
      byPrimitive.LAYER_NORM += txtFlops.byPrimitive.LAYER_NORM;
    }
    
    // Vision (SME-VIS)
    if (modalities.includes('image')) {
      const visFlops = this.estimateVisionFLOPs(request);
      estimates.vis = visFlops.total;
      byPrimitive.CONV += visFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += visFlops.byPrimitive.MATMUL;
    }
    
    // Audio (SME-AUD)
    if (modalities.includes('audio')) {
      const audFlops = this.estimateAudioFLOPs(request);
      estimates.aud = audFlops.total;
      byPrimitive.CONV += audFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += audFlops.byPrimitive.MATMUL;
    }
    
    // Video (SME-VID)
    if (modalities.includes('video')) {
      const vidFlops = this.estimateVideoFLOPs(request);
      estimates.vid = vidFlops.total;
      byPrimitive.CONV += vidFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += vidFlops.byPrimitive.MATMUL;
      byPrimitive.ATTENTION += vidFlops.byPrimitive.ATTENTION;
    }
    
    // Generation (SME-GEN)
    if (modalities.includes('image') || modalities.includes('audio') || modalities.includes('video')) {
      // Generation FLOPs estimated separately when triggered
      estimates.gen = 0;
    }
    
    const total = Object.values(estimates).reduce((a, b) => a + b, 0);
    const peak = Math.max(...Object.values(estimates));
    
    return {
      total,
      byModule: estimates,
      byPrimitive,
      peak,
      steadyState: total * 0.3 // Rough estimate
    };
  }

  /**
   * Estimate text FLOPs (Sovereign LLM v0.2)
   */
  private estimateTextFLOPs(request: UserRequest): { total: number; byPrimitive: Record<string, number> } {
    const d = CapabilityPlanner.D_MODEL;
    const h = CapabilityPlanner.N_HEADS;
    const L = CapabilityPlanner.N_LAYERS;
    const ff = d * CapabilityPlanner.FF_MULT;
    
    // Estimate sequence length
    const textTokens = request.media.text ? Math.ceil(request.media.text.length / 4) : 512;
    const modalityTokens = 256; // Fusion tokens for VIS/AUD/VID
    const T = textTokens + modalityTokens;
    const B = 1; // Batch size
    
    // Embedding
    const embedFlops = B * T * this.D_MODEL * this.modelProfile.txt.parameters;
    
    // Per layer
    let matmulFlops = 0;
    let attentionFlops = 0;
    let layernormFlops = 0;
    
    for (let l = 0; l < CapabilityPlanner.N_LAYERS; l++) {
      // LayerNorm (2x per layer)
      layernormFlops += 2 * B * T * this.D_MODEL;
      
      // QKV projection
      matmulFlops += 3 * B * T * this.D_MODEL * this.D_MODEL;
      
      // Attention
      attentionFlops += CapabilityPlanner.FLOPS_PER_ATTENTION(B, T, this.D_MODEL, this.N_HEADS);
      
      // Output projection
      matmulFlops += B * T * this.D_MODEL * this.D_MODEL;
      
      // FFN
      const ff = this.D_MODEL * CapabilityPlanner.FF_MULT;
      matmulFlops += 2 * B * T * this.D_MODEL * ff; // up + down
    }
    
    // Logits
    const logitsFlops = B * T * this.D_MODEL * this.modelProfile.txt.parameters;
    
    const total = embedFlops + matmulFlops + attentionFlops + layernormFlops + logitsFlops;
    
    return {
      total,
      byPrimitive: {
        MATMUL: matmulFlops + embedFlops + logitsFlops,
        ATTENTION: attentionFlops,
        LAYER_NORM: layernormFlops,
        EMBED: embedFlops,
        CONV: 0
      }
    };
  }

  /**
   * Estimate vision FLOPs
   */
  private estimateVisionFLOPs(request: UserRequest): { total: number; byPrimitive: Record<string, number> } {
    const imageCount = request.media.images?.length || 1;
    const inputSize = this.modelProfile.vis.inputSize || 224;
    const channels = 3;
    
    // MobileViT/EfficientNet style backbone
    const convFlops = imageCount * this.estimateConvBackboneFLOPs(inputSize, channels);
    const matmulFlops = imageCount * 5000000; // Classifier head
    
    return {
      total: convFlops + matmulFlops,
      byPrimitive: {
        MATMUL: matmulFlops,
        ATTENTION: 0,
        LAYER_NORM: 0,
        EMBED: 0,
        CONV: convFlops
      }
    };
  }

  /**
   * Estimate audio FLOPs
   */
  private estimateAudioFLOPs(request: UserRequest): { total: number; byPrimitive: Record<string, number> } {
    const audioCount = request.media.audio?.length || 1;
    const durationSec = 30; // Default assumption
    const sampleRate = 16000;
    const samples = durationSec * sampleRate;
    
    // Whisper-style encoder
    const convFlops = audioCount * samples * 80 * 384 * 3; // Rough encoder estimate
    const attentionFlops = audioCount * 1500 * 1500 * 384 * 4; // Encoder-decoder attention
    
    return {
      total: convFlops + attentionFlops,
      byPrimitive: {
        MATMUL: attentionFlops,
        ATTENTION: attentionFlops,
        LAYER_NORM: 0,
        EMBED: 0,
        CONV: convFlops
      }
    };
  }

  /**
   * Estimate video FLOPs
   */
  private estimateVideoFLOPs(request: UserRequest): { total: number; byPrimitive: Record<string, number> } {
    const videoCount = request.media.video?.length || 1;
    const maxFrames = this.modelProfile.vid.maxFrames || 32;
    const inputSize = 224;
    
    // Frame sampling + vision encoder per frame
    const perFrameFlops = this.estimateConvBackboneFLOPs(inputSize, 3);
    const convFlops = videoCount * maxFrames * perFrameFlops;
    
    // Temporal aggregation
    const attentionFlops = videoCount * maxFrames * maxFrames * 512 * 4;
    
    return {
      total: convFlops + attentionFlops,
      byPrimitive: {
        MATMUL: attentionFlops,
        ATTENTION: attentionFlops,
        LAYER_NORM: 0,
        EMBED: 0,
        CONV: convFlops
      }
    };
  }

  /**
   * Estimate convolution backbone FLOPs
   */
  private estimateConvBackboneFLOPs(inputSize: number, channels: number): number {
    // Simplified: MobileViT XXS ~ 1.3M params, ~500MFLOPs for 224x224
    const baseFlops = 500_000_000;
    const scale = (inputSize / 224) ** 2;
    return Math.round(baseFlops * scale);
  }

  /**
   * Estimate RAM requirements
   */
  private estimateRAM(request: UserRequest, modalities: Modality[]): RAMEstimate {
    const byModule: Record<string, number> = {};
    let modelWeightsGB = 0;
    let kvCacheGB = 0;
    let activationsGB = 0;
    
    // Text model
    if (modalities.includes('text')) {
      const txtRAM = this.modelProfile.txt.estimatedRAMGB || (this.modelProfile.txt.parameters * 0.5 / 1e9); // Q4
      byModule.txt = txtRAM;
      modelWeightsGB += txtRAM;
      
      // KV cache for text
      const T = 2048; // Context window
      const kvPerLayer = 2 * CapabilityPlanner.D_MODEL * 2048 * 2 / 1e9; // FP16
      kvCacheGB += kvPerLayer * CapabilityPlanner.N_LAYERS;
    }
    
    // Vision model
    if (modalities.includes('image')) {
      const visRAM = this.modelProfile.vis.estimatedRAMGB || 0.1;
      byModule.vis = visRAM;
      modelWeightsGB += visRAM;
    }
    
    // Audio model
    if (modalities.includes('audio')) {
      const audRAM = this.modelProfile.aud.estimatedRAMGB || 0.3;
      byModule.aud = audRAM;
      modelWeightsGB += audRAM;
    }
    
    // Video model
    if (modalities.includes('video')) {
      const vidRAM = this.modelProfile.vid.estimatedRAMGB || 0.2;
      byModule.vid = vidRAM;
      modelWeightsGB += vidRAM;
    }
    
    // Activations (roughly 2x model weights during inference)
    activationsGB = modelWeightsGB * 2;
    
    const peakGB = modelWeightsGB + kvCacheGB + activationsGB + 1; // +1GB system
    const steadyStateGB = modelWeightsGB + kvCacheGB + 0.5;
    
    return {
      peakGB,
      steadyStateGB,
      byModule,
      modelWeightsGB,
      kvCacheGB,
      activationsGB
    };
  }

  /**
   * Estimate bandwidth requirements
   */
  private estimateBandwidth(request: UserRequest, modalities: Modality[]): BandwidthEstimate {
    // Memory bandwidth for model weights + activations
    const ramEstimate = this.estimateRAM(request, modalities);
    const memoryGBps = ramEstimate.peakGB * 10; // 10x peak for inference
    
    // I/O bandwidth for media
    let ioMBps = 0;
    if (request.media.images) {
      ioMBps += request.media.images.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    }
    if (request.media.audio) {
      ioMBps += request.media.audio.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    }
    if (request.media.video) {
      ioMBps += request.media.video.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    }
    
    return {
      memoryGBps,
      ioMBps,
      peak: Math.max(memoryGBps, ioMBps / 1000)
    };
  }

  /**
   * Estimate latency
   */
  private estimateLatency(request: UserRequest, modalities: Modality[], flopEstimate: FLOPEstimate): LatencyEstimate {
    const cpuGFLOPs = this.hardwareProfile.cpu.estimatedGFLOPs;
    const gpuGFLOPs = this.hardwareProfile.gpu.estimatedGFLOPs;
    
    // Use CPU for text (deterministic), GPU for vision/audio if available
    const effectiveGFLOPs = cpuGFLOPs; // Conservative: CPU only
    
    const computeLatencyMs = (flopEstimate.total / 1e9) / effectiveGFLOPs * 1000;
    
    const byPhase: Record<string, number> = {
      ingestion: 50,
      fusion: 20,
      inference: computeLatencyMs,
      generation: 0,
      evidence: 30
    };
    
    const byModule: Record<string, number> = {};
    for (const [mod, flops] of Object.entries(this.estimateFLOPs(request, modalities).byModule)) {
      byModule[mod] = (flops / 1e9) / effectiveGFLOPs * 1000;
    }
    
    const totalMs = Object.values(byPhase).reduce((a, b) => a + b, 0);
    const criticalPathMs = byPhase.ingestion + byPhase.fusion + byPhase.inference + byPhase.evidence;
    
    return {
      totalMs,
      byPhase,
      byModule,
      criticalPathMs
    };
  }

  /**
   * Determine execution mode
   */
  private determineExecutionMode(
    request: UserRequest, 
    flopEstimate: FLOPEstimate, 
    ramEstimate: RAMEstimate,
    latencyEstimate: LatencyEstimate
  ): ExecutionMode {
    // Check constraints
    if (request.constraints.localOnly || request.constraints.noOffload) {
      return 'LOCAL';
    }
    
    // Check privacy constraints
    const noOffloadPolicy = this.policyContext.privacyConstraints.some(
      p => p.restriction === 'NO_OFFLOAD' || p.restriction === 'LOCAL_ONLY'
    );
    if (noOffloadPolicy) {
      return 'LOCAL';
    }
    
    // Check hardware capability
    const canRunLocal = this.canRunLocal(flopEstimate, ramEstimate, latencyEstimate);
    
    if (canRunLocal) {
      // Check if hybrid would be better
      if (this.hardwareProfile.gpu.count > 0 && this.shouldUseHybrid(modalities)) {
        return 'HYBRID';
      }
      return 'LOCAL';
    }
    
    // Check offload policy
    if (this.hardwareProfile.offloadPolicy.allowed && this.canOffload(request)) {
      return 'OFFLOAD';
    }
    
    // Default to defer if can't run locally and can't offload
    return 'DEFER';
  }

  /**
   * Check if can run locally
   */
  private canRunLocal(flopEstimate: FLOPEstimate, ramEstimate: RAMEstimate, latencyEstimate: LatencyEstimate): boolean {
    const maxRAM = this.hardwareProfile.memory.availableGB || this.hardwareProfile.memory.ramGB * 0.8;
    const maxLatency = 30000; // 30s default
    
    if (ramEstimate.peakGB > maxRAM) return false;
    if (latencyEstimate.totalMs > maxLatency) return false;
    if (flopEstimate.total > this.hardwareProfile.cpu.estimatedGFLOPs * 1e9 * 30) return false; // 30s budget
    
    return true;
  }

  /**
   * Check if should use hybrid mode
   */
  private shouldUseHybrid(modalities: Modality[]): boolean {
    // Use GPU for vision/audio/video encoders
    return modalities.some(m => ['image', 'audio', 'video'].includes(m));
  }

  /**
   * Check if can offload
   */
  private canOffload(request: UserRequest): boolean {
    const policy = this.hardwareProfile.offloadPolicy;
    if (!policy.allowed) return false;
    
    // Check privacy constraints
    const sensitiveData = request.privacyLevel === 'confidential' || request.privacyLevel === 'restricted';
    if (sensitiveData && !policy.allowedDataTypes.includes('sensitive')) return false;
    
    return true;
  }

  /**
   * Select models based on execution mode and constraints
   */
  private selectModels(executionMode: ExecutionMode, constraints: RequestConstraints): SelectedModels {
    // For LOCAL/HYBRID on limited hardware, use smaller variants
    const isLimited = executionMode === 'LOCAL' && 
      (this.hardwareProfile.profileId === 'MINI_PC' || this.hardwareProfile.profileId === 'LAPTOP');
    
    return {
      txt: {
        variant: isLimited ? 'sovereign-150M' : 'sovereign-300M',
        params: isLimited ? 150_000_000 : 300_000_000,
        contextWindow: isLimited ? 2048 : 4096
      },
      vis: {
        variant: isLimited ? 'mobilevit-xxs' : 'mobilevit-xs',
        inputSize: isLimited ? 192 : 224
      },
      aud: {
        variant: isLimited ? 'whisper-tiny' : 'whisper-base',
        maxDurationSec: isLimited ? 30 : 60
      },
      vid: {
        variant: isLimited ? 'uniform-8frame' : 'keyframe-16frame',
        maxFrames: isLimited ? 8 : 16
      },
      gen: {
        imageVariant: isLimited ? 'sdxl-turbo' : 'flux-schnell',
        audioVariant: 'coqui-tts',
        videoVariant: 'interpolation'
      }
    };
  }

  /**
   * Generate substrate hints
   */
  private generateSubstrateHints(request: UserRequest, executionMode: ExecutionMode, modalities: Modality[]): SubstrateHint[] {
    const hints: SubstrateHint[] = [];
    const hasGPU = this.hardwareProfile.gpu.count > 0 && executionMode !== 'LOCAL';
    
    // MATMUL: CPU for text (deterministic), GPU for vision/audio
    hints.push({
      primitive: 'MATMUL',
      preferredSubstrate: hasGPU && modalities.some(m => ['image', 'audio', 'video'].includes(m)) ? 'GPU_CUDA_10' : 'CPU_AVX2',
      reason: hasGPU ? 'GPU for batched vision/audio matmuls' : 'CPU for deterministic text matmuls',
      fallbackSubstrate: 'CPU_AVX2'
    });
    
    // ATTENTION: CPU for deterministic KV cache
    hints.push({
      primitive: 'ATTENTION',
      preferredSubstrate: 'CPU_AVX2',
      reason: 'CPU guarantees deterministic KV cache operations',
      fallbackSubstrate: 'CPU_AVX2'
    });
    
    // LAYER_NORM: CPU (lightweight)
    hints.push({
      primitive: 'LAYER_NORM',
      preferredSubstrate: 'CPU_AVX2',
      reason: 'Lightweight, memory-bound operation',
      fallbackSubstrate: 'CPU_AVX2'
    });
    
    // EMBED: CPU (memory-bound lookup)
    hints.push({
      primitive: 'EMBED',
      preferredSubstrate: 'CPU_AVX2',
      reason: 'Memory-bound embedding lookup',
      fallbackSubstrate: 'CPU_AVX2'
    });
    
    // CONV: GPU for vision/audio encoders
    hints.push({
      primitive: 'CONV',
      preferredSubstrate: hasGPU ? 'GPU_CUDA_10' : 'CPU_AVX2',
      reason: hasGPU ? 'GPU accelerates vision/audio convolutions' : 'CPU fallback for convolutions',
      fallbackSubstrate: 'CPU_AVX2'
    });
    
    return hints;
  }

  /**
   * Check feasibility
   */
  private checkFeasibility(
    executionMode: ExecutionMode,
    flopEstimate: FLOPEstimate,
    ramEstimate: RAMEstimate,
    latencyEstimate: LatencyEstimate,
    constraints: RequestConstraints
  ): { feasible: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (executionMode === 'DEFER') {
      issues.push('Cannot execute locally or offload - deferred');
      return { feasible: false, issues };
    }
    
    if (executionMode === 'OFFLOAD' && !this.hardwareProfile.offloadPolicy.allowed) {
      issues.push('Offload required but not allowed by policy');
      return { feasible: false, issues };
    }
    
    const maxRAM = this.hardwareProfile.memory.availableGB || this.hardwareProfile.memory.ramGB * 0.8;
    if (ramEstimate.peakGB > maxRAM) {
      issues.push(`Peak RAM (${ramEstimate.peakGB.toFixed(1)}GB) exceeds available (${maxRAM}GB)`);
    }
    
    if (constraints.maxLatencyMs && latencyEstimate.totalMs > constraints.maxLatencyMs) {
      issues.push(`Estimated latency (${latencyEstimate.totalMs.toFixed(0)}ms) exceeds limit (${constraints.maxLatencyMs}ms)`);
    }
    
    if (constraints.maxRAMGB && ramEstimate.peakGB > constraints.maxRAMGB) {
      issues.push(`Peak RAM exceeds constraint`);
    }
    
    return { feasible: issues.length === 0, issues };
  }

  /**
   * Generate plan evidence for replay
   */
  private generatePlanEvidence(request: UserRequest, executionMode: ExecutionMode): PlanEvidence {
    const hardwareHash = this.hashObject(this.hardwareProfile);
    const modelHash = this.hashObject(this.modelProfile);
    const policyHash = this.hashObject(this.policyContext);
    
    return {
      evidenceId: `ev-plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as EvidenceId,
      hardwareProfileHash: hardwareHash,
      modelProfileHash: modelHash,
      policyContextHash: policyHash,
      estimationMethod: 'analytical-v1',
      assumptions: [
        'Batch size = 1',
        'Text tokens estimated from character count',
        'Vision: MobileViT-style backbone',
        'Audio: Whisper-style encoder',
        'Video: uniform frame sampling',
        'CPU-only inference for latency estimates'
      ],
      computedAt: Date.now()
    };
  }

  /**
   * Hash object for evidence
   */
  private hashObject(obj: any): string {
    return require('crypto').createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32);
  }
}

export default CapabilityPlanner;