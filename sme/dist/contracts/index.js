/**
 * SME Contracts - Constitutional Interfaces for Sovereign Multimodal Engine
 * JavaScript version for Electron compatibility
 */

// Type definitions (as JSDoc comments for documentation)
/**
 * @typedef {string} EvidenceId
 * @typedef {string} ModelVersion
 * @typedef {string} KernelCallId
 * @typedef {string} SubstrateId
 * @typedef {'text'|'image'|'audio'|'video'} Modality
 * @typedef {'LOCAL'|'HYBRID'|'OFFLOAD'|'DEFER'} ExecutionMode
 */

// EvidenceRecord interface
/**
 * @typedef {Object} EvidenceRecord
 * @property {EvidenceId} evidenceId
 * @property {string} type
 * @property {string} moduleId
 * @property {*} data
 * @property {number} timestamp
 * @property {ModelVersion} modelVersion
 * @property {string} hash
 */

// DecisionRecord interface
/**
 * @typedef {Object} DecisionRecord
 * @property {string} decisionId
 * @property {number} timestamp
 * @property {UserIntent} intent
 * @property {AuthorityGrant} authorityGrant
 * @property {ValidationResult} validationResult
 * @property {ReasoningTrace} reasoningTrace
 * @property {ModuleOutput[]} outputs
 * @property {EvidenceId[]} evidenceIds
 * @property {string} signature
 */

// UserIntent interface
/**
 * @typedef {Object} UserIntent
 * @property {string} intentId
 * @property {Modality[]} modalities
 * @property {string} goal
 * @property {Object} constraints
 * @property {'low'|'normal'|'high'|'critical'} priority
 */

// AuthorityGrant interface
/**
 * @typedef {Object} AuthorityGrant
 * @property {string} grantId
 * @property {string} requester
 * @property {Modality[]} permittedModalities
 * @property {AuthorityConstraints} constraints
 * @property {number} expiresAt
 * @property {string} signature
 */

// AuthorityConstraints interface
/**
 * @typedef {Object} AuthorityConstraints
 * @property {number} [maxTokens]
 * @property {Object} [maxResolution]
 * @property {number} [maxDurationSec]
 * @property {string[]} [allowedModels]
 * @property {'strict'|'standard'|'permissive'} safetyLevel
 * @property {ResourceBudget} [resourceBudget]
 */

// ResourceBudget interface
/**
 * @typedef {Object} ResourceBudget
 * @property {number} [maxCpuPercent]
 * @property {number} [maxMemoryMb]
 * @property {number} [maxDurationMs]
 * @property {boolean} [allowGpuOffload]
 */

// ValidationResult interface
/**
 * @typedef {Object} ValidationResult
 * @property {boolean} passed
 * @property {ValidationCheck[]} checks
 * @property {string[]} warnings
 */

// ValidationCheck interface
/**
 * @typedef {Object} ValidationCheck
 * @property {string} checkId
 * @property {string} name
 * @property {boolean} passed
 * @property {string} [details]
 */

// ReasoningTrace interface
/**
 * @typedef {Object} ReasoningTrace
 * @property {ReasoningStep[]} steps
 * @property {ModelVersion} modelVersion
 * @property {number} seed
 */

// ReasoningStep interface
/**
 * @typedef {Object} ReasoningStep
 * @property {string} stepId
 * @property {string} description
 * @property {EvidenceId[]} inputRefs
 * @property {EvidenceId[]} outputRefs
 * @property {number} confidence
 */

// ModuleOutput interface
/**
 * @typedef {Object} ModuleOutput
 * @property {string} moduleId
 * @property {Modality} modality
 * @property {*} data
 * @property {EvidenceId} evidenceId
 * @property {ModelVersion} modelVersion
 * @property {number} timestamp
 */

// ConstitutionalTrace interface
/**
 * @typedef {Object} ConstitutionalTrace
 * @property {string} chainId
 * @property {TraceStage[]} stages
 * @property {number} startTime
 * @property {number} endTime
 * @property {boolean} success
 */

// TraceStage interface
/**
 * @typedef {Object} TraceStage
 * @property {'planning'|'authority'|'validation'|'fusion'|'decision'|'evidence'|'verification'|'replay'|'audit'|'failed'} stage
 * @property {string} moduleId
 * @property {EvidenceId[]} inputEvidenceIds
 * @property {EvidenceId[]} outputEvidenceIds
 * @property {number} durationMs
 * @property {boolean} success
 * @property {string[]} errors
 */

// GovernedResponse interface
/**
 * @typedef {Object} GovernedResponse
 * @property {string} [text]
 * @property {Buffer[]} [images]
 * @property {Buffer[]} [audio]
 * @property {Buffer[]} [video]
 * @property {ResponseMetadata} metadata
 */

// ResponseMetadata interface
/**
 * @typedef {Object} ResponseMetadata
 * @property {DecisionRecord} decisionRecord
 * @property {EvidenceId[]} evidenceIds
 * @property {Map<string,ModelVersion>} modelVersions
 * @property {number} executionTimeMs
 * @property {ResourceUsage} resourceUsage
 */

// ResourceUsage interface
/**
 * @typedef {Object} ResourceUsage
 * @property {number} cpuMs
 * @property {number} peakMemoryMb
 * @property {number} [gpuMs]
 * @property {number} [networkMs]
 */

// SmeModule base interface
/**
 * @typedef {Object} SmeModule
 * @property {string} moduleId
 * @property {string} moduleType
 * @property {function(*):Promise<void>} initialize
 * @property {function():Promise<ModuleHealth>} healthCheck
 * @property {function():Promise<void>} shutdown
 */

// ModuleHealth interface
/**
 * @typedef {Object} ModuleHealth
 * @property {string} moduleId
 * @property {boolean} healthy
 * @property {number} lastCheck
 * @property {string} [error]
 * @property {ModelVersion} [modelVersion]
 */

// SmeModelInfo interface
/**
 * @typedef {Object} SmeModelInfo
 * @property {string} moduleId
 * @property {string} modelName
 * @property {ModelVersion} modelVersion
 * @property {string} framework
 * @property {string} frameworkVersion
 * @property {number} parameters
 * @property {string} quantization
 * @property {string} device
 * @property {string[]} capabilities
 * @property {boolean} loaded
 * @property {number} [loadTimeMs]
 */

// CapabilityPlan interface
/**
 * @typedef {Object} CapabilityPlan
 * @property {string} planId
 * @property {string} requestId
 * @property {number} timestamp
 * @property {FLOPEstimate} estimatedFLOPs
 * @property {RAMEstimate} estimatedRAM
 * @property {BandwidthEstimate} estimatedBandwidth
 * @property {LatencyEstimate} estimatedLatency
 * @property {Modality[]} requiredModalities
 * @property {Modality[]} optionalModalities
 * @property {ExecutionMode} executionMode
 * @property {SubstrateHint[]} substrateHints
 * @property {SelectedModels} selectedModels
 * @property {boolean} feasible
 * @property {string[]} feasibilityIssues
 * @property {PlanEvidence} planEvidence
 */

// FLOPEstimate interface
/**
 * @typedef {Object} FLOPEstimate
 * @property {number} total
 * @property {Object.<string,number>} byModule
 * @property {Object.<string,number>} byPrimitive
 * @property {number} peak
 * @property {number} steadyState
 */

// RAMEstimate interface
/**
 * @typedef {Object} RAMEstimate
 * @property {number} peakGB
 * @property {number} steadyStateGB
 * @property {Object.<string,number>} byModule
 * @property {number} modelWeightsGB
 * @property {number} kvCacheGB
 * @property {number} activationsGB
 */

// BandwidthEstimate interface
/**
 * @typedef {Object} BandwidthEstimate
 * @property {number} memoryGBps
 * @property {number} ioMBps
 * @property {number} peak
 */

// LatencyEstimate interface
/**
 * @typedef {Object} LatencyEstimate
 * @property {number} totalMs
 * @property {Object.<string,number>} byPhase
 * @property {Object.<string,number>} byModule
 * @property {number} criticalPathMs
 */

// SubstrateHint interface
/**
 * @typedef {Object} SubstrateHint
 * @property {'MATMUL'|'ATTENTION'|'LAYER_NORM'|'EMBED'|'CONV'} primitive
 * @property {string} preferredSubstrate
 * @property {string} reason
 * @property {string} [fallbackSubstrate]
 */

// SelectedModels interface
/**
 * @typedef {Object} SelectedModels
 * @property {Object} txt
 * @property {Object} vis
 * @property {Object} aud
 * @property {Object} vid
 * @property {Object} gen
 */

// PlanEvidence interface
/**
 * @typedef {Object} PlanEvidence
 * @property {EvidenceId} evidenceId
 * @property {string} hardwareProfileHash
 * @property {string} modelProfileHash
 * @property {string} policyContextHash
 * @property {string} estimationMethod
 * @property {string[]} assumptions
 * @property {number} computedAt
 */

// HardwareProfile interface
/**
 * @typedef {Object} HardwareProfile
 * @property {'MINI_PC'|'LAPTOP'|'WORKSTATION'|'GPU_NODE'} profileId
 * @property {CPUProfile} cpu
 * @property {GPUProfile} gpu
 * @property {MemoryProfile} memory
 * @property {StorageProfile} storage
 * @property {DeterminismCapabilities} determinismCapabilities
 * @property {EnergyConstraints} energyConstraints
 * @property {OffloadPolicy} offloadPolicy
 * @property {number} measuredAt
 */

// CPUProfile interface
/**
 * @typedef {Object} CPUProfile
 * @property {number} cores
 * @property {number} threads
 * @property {'AVX2'|'AVX512'|'NEON'|'SVE'} isa
 * @property {number} estimatedGFLOPs
 * @property {boolean} hasAVX2
 * @property {boolean} hasAVX512
 */

// GPUProfile interface
/**
 * @typedef {Object} GPUProfile
 * @property {number} count
 * @property {number} vramGB
 * @property {'CUDA_10'|'CUDA_11'|'CUDA_12'|'OPENCL_1_2'|'OPENCL_2_0'|'DIRECTML'|'NONE'} api
 * @property {number} estimatedGFLOPs
 * @property {boolean} hasTensorCores
 * @property {boolean} deterministicKernelsAvailable
 */

// MemoryProfile interface
/**
 * @typedef {Object} MemoryProfile
 * @property {number} ramGB
 * @property {number} bandwidthGBps
 * @property {number} availableGB
 */

// StorageProfile interface
/**
 * @typedef {Object} StorageProfile
 * @property {'NVMe'|'SSD'|'HDD'} type
 * @property {number} ioBandwidthMBps
 * @property {number} availableGB
 */

// DeterminismCapabilities interface
/**
 * @typedef {Object} DeterminismCapabilities
 * @property {boolean} cpuDeterministic
 * @property {boolean} gpuDeterministic
 * @property {boolean} kvCacheDeterministic
 */

// EnergyConstraints interface
/**
 * @typedef {Object} EnergyConstraints
 * @property {number} [maxPowerWatts]
 * @property {boolean} [batteryMode]
 * @property {boolean} [thermalThrottling]
 */

// OffloadPolicy interface
/**
 * @typedef {Object} OffloadPolicy
 * @property {boolean} allowed
 * @property {string[]} trustedEndpoints
 * @property {number} [maxOffloadFLOPs]
 * @property {boolean} requireEncryption
 * @property {string[]} allowedDataTypes
 */

module.exports = {
  // Types are defined as JSDoc comments above
  // This file serves as documentation and runtime type reference
};