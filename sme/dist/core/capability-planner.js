/**
 * Capability Planner v1.0 - JavaScript Version
 * First stage of the constitutional execution chain
 */

const crypto = require('crypto');

class CapabilityPlanner {
  constructor(hardwareProfile, modelProfile, policyContext) {
    this.hardwareProfile = hardwareProfile;
    this.modelProfile = modelProfile;
    this.policyContext = policyContext;
    
    // Sovereign LLM v0.2 constants
    this.D_MODEL = 768;
    this.N_HEADS = 12;
    this.N_LAYERS = 16;
    this.FF_MULT = 4;
  }

  /**
   * Main planning function
   */
  async plan(request) {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    // 1. Determine required modalities
    const requiredModalities = this.determineRequiredModalities(request);
    const optionalModalities = this.determineOptionalModalities(request);
    
    // 2. Estimate resources
    const flopEstimate = this.estimateFLOPs(request, requiredModalities);
    const ramEstimate = this.estimateRAM(request, requiredModalities);
    const bandwidthEstimate = this.estimateBandwidth(request, requiredModalities);
    const latencyEstimate = this.estimateLatency(request, requiredModalities, flopEstimate);
    
    // 3. Determine execution mode
    const executionMode = this.determineExecutionMode(request, flopEstimate, ramEstimate, latencyEstimate);
    
    // 4. Select models
    const selectedModels = this.selectModels(executionMode, request.constraints);
    
    // 4. Generate substrate hints
    const substrateHints = this.generateSubstrateHints(request, executionMode, requiredModalities);
    
    // 5. Check feasibility
    const { feasible, issues } = this.checkFeasibility(
      executionMode, flopEstimate, ramEstimate, latencyEstimate, request.constraints
    );
    
    // 6. Generate plan evidence
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

  determineRequiredModalities(request) {
    const modalities = [];
    if (request.modalities.includes('text') || request.media.text) modalities.push('text');
    if (request.modalities.includes('image') || request.media.images?.length) modalities.push('image');
    if (request.modalities.includes('audio') || request.media.audio?.length) modalities.push('audio');
    if (request.modalities.includes('video') || request.media.video?.length) modalities.push('video');
    if (modalities.length === 0) modalities.push('text');
    return modalities;
  }

  determineOptionalModalities(request) {
    const all = ['text', 'image', 'audio', 'video'];
    const required = this.determineRequiredModalities(request);
    return all.filter(m => !required.includes(m));
  }

  estimateFLOPs(request, modalities) {
    const estimates = {};
    const byPrimitive = { MATMUL: 0, ATTENTION: 0, LAYER_NORM: 0, EMBED: 0, CONV: 0 };
    
    if (modalities.includes('text')) {
      const txtFlops = this.estimateTextFLOPs(request);
      estimates.txt = txtFlops.total;
      byPrimitive.MATMUL += txtFlops.byPrimitive.MATMUL;
      byPrimitive.ATTENTION += txtFlops.byPrimitive.ATTENTION;
      byPrimitive.LAYER_NORM += txtFlops.byPrimitive.LAYER_NORM;
    }
    
    if (modalities.includes('image')) {
      const visFlops = this.estimateVisionFLOPs(request);
      estimates.vis = visFlops.total;
      byPrimitive.CONV += visFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += visFlops.byPrimitive.MATMUL;
    }
    
    if (modalities.includes('audio')) {
      const audFlops = this.estimateAudioFLOPs(request);
      estimates.aud = audFlops.total;
      byPrimitive.CONV += audFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += audFlops.byPrimitive.MATMUL;
    }
    
    if (modalities.includes('video')) {
      const vidFlops = this.estimateVideoFLOPs(request);
      estimates.vid = vidFlops.total;
      byPrimitive.CONV += vidFlops.byPrimitive.CONV;
      byPrimitive.MATMUL += vidFlops.byPrimitive.MATMUL;
      byPrimitive.ATTENTION += vidFlops.byPrimitive.ATTENTION;
    }
    
    const total = Object.values(estimates).reduce((a, b) => a + b, 0);
    return {
      total,
      byModule: estimates,
      byPrimitive,
      peak: Math.max(...Object.values(estimates)),
      steadyState: total * 0.3
    };
  }

  estimateTextFLOPs(request) {
    const d = this.D_MODEL;
    const h = this.N_HEADS;
    const L = this.N_LAYERS;
    const ff = d * this.FF_MULT;
    
    const textTokens = request.media.text ? Math.ceil(request.media.text.length / 4) : 512;
    const modalityTokens = 256;
    const T = textTokens + modalityTokens;
    const B = 1;
    
    const embedFlops = B * T * d * (this.modelProfile?.txt?.parameters || 300000000);
    
    let matmulFlops = 0;
    let attentionFlops = 0;
    let layernormFlops = 0;
    
    for (let l = 0; l < this.N_LAYERS; l++) {
      layernormFlops += 2 * B * T * d;
      matmulFlops += 3 * B * T * d * d;
      attentionFlops += 4 * B * T * T * d;
      matmulFlops += B * T * d * d;
      const ff = d * this.FF_MULT;
      matmulFlops += 2 * B * T * d * ff;
    }
    
    const logitsFlops = B * T * d * (this.modelProfile?.txt?.parameters || 300000000);
    
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

  estimateVisionFLOPs(request) {
    const imageCount = request.media.images?.length || 1;
    const inputSize = this.modelProfile?.vis?.inputSize || 224;
    const convFlops = imageCount * this.estimateConvBackboneFLOPs(inputSize, 3);
    const matmulFlops = imageCount * 5000000;
    return {
      total: convFlops + matmulFlops,
      byPrimitive: { MATMUL: matmulFlops, ATTENTION: 0, LAYER_NORM: 0, EMBED: 0, CONV: convFlops }
    };
  }

  estimateAudioFLOPs(request) {
    const audioCount = request.media.audio?.length || 1;
    const durationSec = 30;
    const sampleRate = 16000;
    const samples = durationSec * sampleRate;
    const convFlops = audioCount * samples * 80 * 384 * 3;
    const attentionFlops = audioCount * 1500 * 1500 * 384 * 4;
    return {
      total: convFlops + attentionFlops,
      byPrimitive: { MATMUL: attentionFlops, ATTENTION: attentionFlops, LAYER_NORM: 0, EMBED: 0, CONV: convFlops }
    };
  }

  estimateVideoFLOPs(request) {
    const videoCount = request.media.video?.length || 1;
    const maxFrames = 16;
    const inputSize = 224;
    const perFrameFlops = this.estimateConvBackboneFLOPs(inputSize, 3);
    const convFlops = videoCount * maxFrames * perFrameFlops;
    const attentionFlops = videoCount * maxFrames * maxFrames * 512 * 4;
    return {
      total: convFlops + attentionFlops,
      byPrimitive: { MATMUL: attentionFlops, ATTENTION: attentionFlops, LAYER_NORM: 0, EMBED: 0, CONV: convFlops }
    };
  }

  estimateConvBackboneFLOPs(inputSize, channels) {
    const baseFlops = 500000000;
    const scale = (inputSize / 224) ** 2;
    return Math.round(baseFlops * scale);
  }

  estimateRAM(request, modalities) {
    const byModule = {};
    let modelWeightsGB = 0;
    let kvCacheGB = 0;
    let activationsGB = 0;
    
    if (modalities.includes('text')) {
      const txtRAM = (this.modelProfile?.txt?.estimatedRAMGB) || ((this.modelProfile?.txt?.parameters || 300000000) * 0.5 / 1e9);
      byModule.txt = txtRAM;
      modelWeightsGB += txtRAM;
      const T = 2048;
      const kvPerLayer = 2 * 768 * 2048 * 2 / 1e9;
      kvCacheGB += kvPerLayer * 16;
    }
    
    if (modalities.includes('image')) {
      const visRAM = this.modelProfile?.vis?.estimatedRAMGB || 0.1;
      byModule.vis = visRAM;
      modelWeightsGB += visRAM;
    }
    
    if (modalities.includes('audio')) {
      const audRAM = this.modelProfile?.aud?.estimatedRAMGB || 0.3;
      byModule.aud = audRAM;
      modelWeightsGB += audRAM;
    }
    
    if (modalities.includes('video')) {
      const vidRAM = this.modelProfile?.vid?.estimatedRAMGB || 0.2;
      byModule.vid = vidRAM;
      modelWeightsGB += vidRAM;
    }
    
    activationsGB = modelWeightsGB * 2;
    const peakGB = modelWeightsGB + kvCacheGB + activationsGB + 1;
    const steadyStateGB = modelWeightsGB + kvCacheGB + 0.5;
    
    return { peakGB, steadyStateGB, byModule, modelWeightsGB, kvCacheGB, activationsGB };
  }

  estimateBandwidth(request, modalities) {
    const ramEstimate = this.estimateRAM(request, modalities);
    const memoryGBps = ramEstimate.peakGB * 10;
    let ioMBps = 0;
    if (request.media.images) ioMBps += request.media.images.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    if (request.media.audio) ioMBps += request.media.audio.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    if (request.media.video) ioMBps += request.media.video.reduce((a, b) => a + b.length, 0) / (1024 * 1024);
    return { memoryGBps, ioMBps, peak: Math.max(memoryGBps, ioMBps / 1000) };
  }

  estimateLatency(request, modalities, flopEstimate) {
    const cpuGFLOPs = this.hardwareProfile?.cpu?.estimatedGFLOPs || 150;
    const effectiveGFLOPs = cpuGFLOPs;
    const computeLatencyMs = (flopEstimate.total / 1e9) / effectiveGFLOPs * 1000;
    
    const byPhase = { ingestion: 50, fusion: 20, inference: computeLatencyMs, generation: 0, evidence: 30 };
    const byModule = {};
    for (const [mod, flops] of Object.entries(this.estimateFLOPs(request, modalities).byModule)) {
      byModule[mod] = (flops / 1e9) / effectiveGFLOPs * 1000;
    }
    
    const totalMs = Object.values(byPhase).reduce((a, b) => a + b, 0);
    return { totalMs, byPhase, byModule, criticalPathMs: byPhase.ingestion + byPhase.fusion + byPhase.inference + byPhase.evidence };
  }

  determineExecutionMode(request, flopEstimate, ramEstimate, latencyEstimate) {
    if (request.constraints?.localOnly || request.constraints?.noOffload) return 'LOCAL';
    
    const noOffloadPolicy = this.policyContext?.privacyConstraints?.some(
      p => p.restriction === 'NO_OFFLOAD' || p.restriction === 'LOCAL_ONLY'
    );
    if (noOffloadPolicy) return 'LOCAL';
    
    const canRunLocal = this.canRunLocal(flopEstimate, ramEstimate, latencyEstimate);
    if (canRunLocal) {
      if (this.hardwareProfile?.gpu?.count > 0 && this.shouldUseHybrid(modalities)) return 'HYBRID';
      return 'LOCAL';
    }
    
    if (this.hardwareProfile?.offloadPolicy?.allowed && this.canOffload(request)) return 'OFFLOAD';
    return 'DEFER';
  }

  canRunLocal(flopEstimate, ramEstimate, latencyEstimate) {
    const maxRAM = this.hardwareProfile?.memory?.availableGB || (this.hardwareProfile?.memory?.ramGB * 0.8) || 6;
    const maxLatency = 30000;
    if (ramEstimate.peakGB > maxRAM) return false;
    if (latencyEstimate.totalMs > maxLatency) return false;
    if (flopEstimate.total > (this.hardwareProfile?.cpu?.estimatedGFLOPs || 150) * 1e9 * 30) return false;
    return true;
  }

  shouldUseHybrid(modalities) {
    return modalities.some(m => ['image', 'audio', 'video'].includes(m));
  }

  canOffload(request) {
    const policy = this.hardwareProfile?.offloadPolicy;
    if (!policy?.allowed) return false;
    const sensitiveData = request.privacyLevel === 'confidential' || request.privacyLevel === 'restricted';
    if (sensitiveData && !policy.allowedDataTypes.includes('sensitive')) return false;
    return true;
  }

  selectModels(executionMode, constraints) {
    const isLimited = executionMode === 'LOCAL' && 
      (this.hardwareProfile?.profileId === 'MINI_PC' || this.hardwareProfile?.profileId === 'LAPTOP');
    return {
      txt: { variant: isLimited ? 'sovereign-150M' : 'sovereign-300M', params: isLimited ? 150000000 : 300000000, contextWindow: isLimited ? 2048 : 4096 },
      vis: { variant: isLimited ? 'mobilevit-xxs' : 'mobilevit-xs', inputSize: isLimited ? 192 : 224 },
      aud: { variant: isLimited ? 'whisper-tiny' : 'whisper-base', maxDurationSec: isLimited ? 30 : 60 },
      vid: { variant: isLimited ? 'uniform-8frame' : 'keyframe-16frame', maxFrames: isLimited ? 8 : 16 },
      gen: { imageVariant: isLimited ? 'sdxl-turbo' : 'flux-schnell', audioVariant: 'coqui-tts', videoVariant: 'interpolation' }
    };
  }

  generateSubstrateHints(request, executionMode, modalities) {
    const hints = [];
    const hasGPU = this.hardwareProfile?.gpu?.count > 0 && executionMode !== 'LOCAL';
    
    hints.push({ primitive: 'MATMUL', preferredSubstrate: hasGPU && modalities.some(m => ['image', 'audio', 'video'].includes(m)) ? 'GPU_CUDA_10' : 'CPU_AVX2', reason: hasGPU ? 'GPU for batched vision/audio matmuls' : 'CPU for deterministic text matmuls', fallbackSubstrate: 'CPU_AVX2' });
    hints.push({ primitive: 'ATTENTION', preferredSubstrate: 'CPU_AVX2', reason: 'CPU guarantees deterministic KV cache operations', fallbackSubstrate: 'CPU_AVX2' });
    hints.push({ primitive: 'LAYER_NORM', preferredSubstrate: 'CPU_AVX2', reason: 'Lightweight, memory-bound operation', fallbackSubstrate: 'CPU_AVX2' });
    hints.push({ primitive: 'EMBED', preferredSubstrate: 'CPU_AVX2', reason: 'Memory-bound embedding lookup', fallbackSubstrate: 'CPU_AVX2' });
    hints.push({ primitive: 'CONV', preferredSubstrate: hasGPU ? 'GPU_CUDA_10' : 'CPU_AVX2', reason: hasGPU ? 'GPU accelerates vision/audio convolutions' : 'CPU fallback for convolutions', fallbackSubstrate: 'CPU_AVX2' });
    return hints;
  }

  checkFeasibility(executionMode, flopEstimate, ramEstimate, latencyEstimate, constraints) {
    const issues = [];
    if (executionMode === 'DEFER') { issues.push('Cannot execute locally or offload - deferred'); return { feasible: false, issues }; }
    if (executionMode === 'OFFLOAD' && !this.hardwareProfile?.offloadPolicy?.allowed) { issues.push('Offload required but not allowed by policy'); return { feasible: false, issues }; }
    const maxRAM = this.hardwareProfile?.memory?.availableGB || (this.hardwareProfile?.memory?.ramGB * 0.8) || 6;
    if (ramEstimate.peakGB > maxRAM) issues.push(`Peak RAM (${ramEstimate.peakGB.toFixed(1)}GB) exceeds available (${maxRAM}GB)`);
    if (constraints.maxLatencyMs && latencyEstimate.totalMs > constraints.maxLatencyMs) issues.push(`Estimated latency (${latencyEstimate.totalMs.toFixed(0)}ms) exceeds limit (${constraints.maxLatencyMs}ms)`);
    if (constraints.maxRAMGB && ramEstimate.peakGB > constraints.maxRAMGB) issues.push('Peak RAM exceeds constraint');
    return { feasible: issues.length === 0, issues };
  }

  generatePlanEvidence(request, executionMode) {
    return {
      evidenceId: `ev-plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      hardwareProfileHash: this.hashObject(this.hardwareProfile),
      modelProfileHash: this.hashObject(this.modelProfile),
      policyContextHash: this.hashObject(this.policyContext),
      estimationMethod: 'analytical-v1',
      assumptions: ['Batch size = 1', 'Text tokens estimated from character count', 'Vision: MobileViT-style backbone', 'Audio: Whisper-style encoder', 'Video: uniform frame sampling', 'CPU-only inference for latency estimates'],
      computedAt: Date.now()
    };
  }

  hashObject(obj) {
    return require('crypto').createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32);
  }
}

module.exports = { CapabilityPlanner };