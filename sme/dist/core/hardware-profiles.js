/**
 * Hardware Profiles v1.0 - JavaScript Version
 */

const crypto = require('crypto');

// Canonical hardware profiles
const CANONICAL_PROFILES = {
  MINI_PC: {
    profileId: 'MINI_PC',
    cpu: { cores: 4, threads: 4, isa: 'AVX2', estimatedGFLOPs: 150, hasAVX2: true, hasAVX512: false },
    gpu: { count: 0, vramGB: 0, api: 'NONE', estimatedGFLOPs: 0, hasTensorCores: false, deterministicKernelsAvailable: false },
    memory: { ramGB: 8, bandwidthGBps: 25, availableGB: 6 },
    storage: { type: 'SSD', ioBandwidthMBps: 500, availableGB: 100 },
    determinismCapabilities: { cpuDeterministic: true, gpuDeterministic: false, kvCacheDeterministic: true },
    energyConstraints: { maxPowerWatts: 35, batteryMode: false, thermalThrottling: true },
    offloadPolicy: { allowed: true, trustedEndpoints: [], maxOffloadFLOPs: 1e12, requireEncryption: true, allowedDataTypes: ['public', 'internal'] },
    measuredAt: Date.now()
  },
  
  LAPTOP: {
    profileId: 'LAPTOP',
    cpu: { cores: 8, threads: 16, isa: 'AVX512', estimatedGFLOPs: 500, hasAVX2: true, hasAVX512: true },
    gpu: { count: 1, vramGB: 8, api: 'CUDA_11', estimatedGFLOPs: 2000, hasTensorCores: true, deterministicKernelsAvailable: false },
    memory: { ramGB: 32, bandwidthGBps: 50, availableGB: 24 },
    storage: { type: 'NVMe', ioBandwidthMBps: 3000, availableGB: 500 },
    determinismCapabilities: { cpuDeterministic: true, gpuDeterministic: false, kvCacheDeterministic: true },
    energyConstraints: { maxPowerWatts: 100, batteryMode: true, thermalThrottling: true },
    offloadPolicy: { allowed: true, trustedEndpoints: [], maxOffloadFLOPs: 1e13, requireEncryption: true, allowedDataTypes: ['public', 'internal'] },
    measuredAt: Date.now()
  },
  
  WORKSTATION: {
    profileId: 'WORKSTATION',
    cpu: { cores: 16, threads: 32, isa: 'AVX512', estimatedGFLOPs: 2000, hasAVX2: true, hasAVX512: true },
    gpu: { count: 1, vramGB: 24, api: 'CUDA_11', estimatedGFLOPs: 15000, hasTensorCores: true, deterministicKernelsAvailable: true },
    memory: { ramGB: 64, bandwidthGBps: 100, availableGB: 50 },
    storage: { type: 'NVMe', ioBandwidthMBps: 7000, availableGB: 2000 },
    determinismCapabilities: { cpuDeterministic: true, gpuDeterministic: true, kvCacheDeterministic: true },
    energyConstraints: { maxPowerWatts: 500, batteryMode: false, thermalThrottling: false },
    offloadPolicy: { allowed: true, trustedEndpoints: ['gpu-node-1', 'gpu-node-2'], maxOffloadFLOPs: 1e14, requireEncryption: true, allowedDataTypes: ['public', 'internal', 'confidential'] },
    measuredAt: Date.now()
  },
  
  GPU_NODE: {
    profileId: 'GPU_NODE',
    cpu: { cores: 8, threads: 16, isa: 'AVX2', estimatedGFLOPs: 400, hasAVX2: true, hasAVX512: false },
    gpu: { count: 8, vramGB: 80, api: 'CUDA_11', estimatedGFLOPs: 120000, hasTensorCores: true, deterministicKernelsAvailable: true },
    memory: { ramGB: 128, bandwidthGBps: 200, availableGB: 100 },
    storage: { type: 'NVMe', ioBandwidthMBps: 14000, availableGB: 4000 },
    determinismCapabilities: { cpuDeterministic: true, gpuDeterministic: true, kvCacheDeterministic: true },
    energyConstraints: { maxPowerWatts: 3000, batteryMode: false, thermalThrottling: false },
    offloadPolicy: { allowed: true, trustedEndpoints: [], maxOffloadFLOPs: 1e15, requireEncryption: true, allowedDataTypes: ['public', 'internal', 'confidential', 'restricted'] },
    measuredAt: Date.now()
  }
};

class HardwareProfileManager {
  constructor() {
    this.profiles = new Map();
    this.customProfiles = new Map();
    this.activeProfile = null;
    
    // Load canonical profiles
    for (const [id, profile] of Object.entries(CANONICAL_PROFILES)) {
      this.profiles.set(id, { ...profile, measuredAt: Date.now() });
    }
  }

  async detectProfile() {
    // In production, would query system APIs
    const detected = await this.autoDetect();
    this.activeProfile = detected;
    return detected;
  }

  async autoDetect() {
    // Default to LAPTOP for now
    return { ...CANONICAL_PROFILES.LAPTOP, measuredAt: Date.now() };
  }

  getProfile(id) {
    return this.customProfiles.get(id) || this.profiles.get(id);
  }

  setActiveProfile(id) {
    const profile = this.getProfile(id);
    if (profile) {
      this.activeProfile = { ...profile, measuredAt: Date.now() };
      return true;
    }
    return false;
  }

  getActiveProfile() {
    return this.activeProfile;
  }

  registerProfile(profile) {
    this.customProfiles.set(profile.profileId, profile);
    this.profiles.set(profile.profileId, profile);
  }

  async updateProfile(id) {
    const profile = this.getProfile(id);
    if (!profile) return null;
    const updated = await this.measureProfile(profile);
    this.profiles.set(id, updated);
    if (this.activeProfile?.profileId === id) {
      this.activeProfile = updated;
    }
    return updated;
  }

  async measureProfile(base) {
    return {
      ...base,
      measuredAt: Date.now(),
      memory: { ...base.memory, availableGB: base.memory.ramGB * 0.8 }
    };
  }

  matchCapabilityPlan(plan) {
    const profile = this.activeProfile || CANONICAL_PROFILES.LAPTOP;
    const issues = [];
    const recommendations = [];
    
    if (plan.estimatedRAM?.peakGB > profile.memory.availableGB) {
      issues.push(`Peak RAM ${plan.estimatedRAM.peakGB}GB > available ${profile.memory.availableGB}GB`);
      recommendations.push('Use smaller model variant or enable offload');
    }
    
    const requiredGFLOPs = plan.estimatedFLOPs?.total / 1e9 || 0;
    const availableGFLOPs = profile.cpu.estimatedGFLOPs + profile.gpu.estimatedGFLOPs;
    if (requiredGFLOPs > availableGFLOPs * 30) {
      issues.push(`Required FLOPs (${requiredGFLOPs.toFixed(1)} GFLOPs) may exceed 30s budget`);
      recommendations.push('Consider offload or smaller model');
    }
    
    if (plan.executionMode === 'HYBRID' && profile.gpu.count === 0) {
      issues.push('HYBRID mode requested but no GPU available');
      recommendations.push('Use LOCAL mode or add GPU');
    }
    
    if (plan.executionMode === 'OFFLOAD' && !this.canOffload(profile)) {
      issues.push('OFFLOAD requested but not allowed by policy');
      recommendations.push('Enable offload in policy or use LOCAL/HYBRID');
    }
    
    return { compatible: issues.length === 0, issues, recommendations };
  }

  canOffload(profile) {
    return profile.offloadPolicy.allowed && profile.offloadPolicy.trustedEndpoints.length > 0;
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  getRecommendations(plan) {
    const profile = this.activeProfile || CANONICAL_PROFILES.LAPTOP;
    const recs = [];
    
    if (plan.executionMode === 'LOCAL' && profile.gpu.count > 0) {
      recs.push('Consider HYBRID mode to leverage GPU for vision/audio');
    }
    
    if (plan.estimatedRAM?.peakGB > profile.memory.ramGB * 0.6) {
      recs.push('High RAM usage - consider smaller model or quantization');
    }
    
    if (plan.estimatedLatency?.totalMs > 10000) {
      recs.push('High latency - consider HYBRID or OFFLOAD mode');
    }
    
    return recs;
  }

  exportProfile(profileId) {
    const profile = profileId ? this.getProfile(profileId) : this.activeProfile;
    if (!profile) throw new Error('No profile to export');
    return JSON.stringify(profile, null, 2);
  }

  importProfile(json) {
    const profile = JSON.parse(json);
    const required = ['profileId', 'cpu', 'gpu', 'memory', 'storage', 'determinismCapabilities', 'energyConstraints', 'offloadPolicy'];
    for (const field of required) {
      if (!profile[field]) throw new Error(`Missing required field: ${field}`);
    }
    this.registerProfile(profile);
    return profile;
  }

  registerProfile(profile) {
    this.customProfiles.set(profile.profileId, profile);
    this.profiles.set(profile.profileId, profile);
  }
}

function createDefaultHardwareProfile() {
  return { ...CANONICAL_PROFILES.LAPTOP, measuredAt: Date.now() };
}

function createCapabilityPlanner(hardwareProfile, modelProfile, policyContext) {
  const CapabilityPlanner = require('./capability-planner').CapabilityPlanner;
  const hp = hardwareProfile || createDefaultHardwareProfile();
  const defaultModelProfile = createDefaultModelProfile();
  const defaultPolicyContext = createDefaultPolicyContext();
  return new CapabilityPlanner(hardwareProfile || hp, modelProfile || defaultModelProfile, policyContext || defaultPolicyContext);
}

function createDefaultModelProfile() {
  return {
    txt: { modelName: 'sovereign-300M', modelVersion: 'v0.2.0', parameters: 300000000, quantization: 'Q4_K_M', contextWindow: 4096, estimatedFLOPsPerToken: 600000000, estimatedRAMGB: 1.5, supportedModalities: ['text'] },
    vis: { modelName: 'mobilevit-xs', modelVersion: 'v1.0.0', parameters: 2300000, quantization: 'INT8', contextWindow: 224 * 224 * 3, estimatedFLOPsPerToken: 500000000, estimatedRAMGB: 0.1, supportedModalities: ['image'] },
    aud: { modelName: 'whisper-base', modelVersion: 'v1.0.0', parameters: 74000000, quantization: 'INT8', contextWindow: 30 * 16000, estimatedFLOPsPerToken: 1000000000, estimatedRAMGB: 0.3, supportedModalities: ['audio'] },
    vid: { modelName: 'uniform-16frame', modelVersion: 'v1.0.0', parameters: 5000000, quantization: 'INT8', contextWindow: 16 * 224 * 224 * 3, estimatedFLOPsPerToken: 2000000000, estimatedRAMGB: 0.2, supportedModalities: ['video'] },
    gen: { modelName: 'flux-schnell', modelVersion: 'v1.0.0', parameters: 12000000000, quantization: 'FP16', contextWindow: 1024 * 1024 * 3, estimatedFLOPsPerToken: 10000000000, estimatedRAMGB: 8, supportedModalities: ['image', 'audio', 'video'] }
  };
}

function createDefaultPolicyContext() {
  return {
    ciemRules: [],
    offloadRules: [{ ruleId: 'default-offload', dataTypes: ['public', 'internal'], allowedEndpoints: [], requireEncryption: true, maxFLOPs: 1e13 }],
    safetyConstraints: [],
    privacyConstraints: []
  };
}

module.exports = { HardwareProfileManager, CANONICAL_PROFILES, createDefaultHardwareProfile, createCapabilityPlanner };