/**
 * Axiom Compute ABI v0.1 — TypeScript Contract
 * 
 * Sovereign compute abstraction. No ROCm dependency.
 * Every backend implements this interface.
 * 
 * DESIGN PRINCIPLE: Capability-first, vendor-second.
 * Axiom-X asks "can this substrate satisfy the computation?" not "is this an AMD GPU?"
 */

// ============================================================================
// VERSIONING
// ============================================================================

export const AXIOM_ABI_VERSION = "0.1.0";
export const AXIOM_ABI_NAME = "Axiom Compute ABI";

export interface AxiomComputeABI {
  abiVersion: string;  // "0.1.0"
  device: AxiomDevice;
}

// ============================================================================
// CAPABILITY MODEL (capability-first, vendor-second)
// ============================================================================

export type Vendor = "amd" | "nvidia" | "intel" | "cpu" | "unknown";
export type ISA = "gcn" | "rdna" | "cdna" | "nvptx" | "spirv" | "llvm" | "unknown";
export type ExecutionModel = "gpu" | "cpu";

export interface CapabilityFeature {
  name: string;
  supported: boolean;
  version?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// CAPABILITY NEGOTIATION
// ============================================================================

export type RequirementLevel = "required" | "optional" | "preferred";

export interface FeatureRequirement {
  feature: string;
  level: RequirementLevel;
  minVersion?: string;
  details?: Record<string, unknown>;
}

export interface WorkloadRequirements {
  required: FeatureRequirement[];
  optional: FeatureRequirement[];
  preferred: FeatureRequirement[];
}

export interface CapabilityNegotiationResult {
  satisfied: boolean;
  satisfiedRequired: boolean;
  satisfiedOptional: boolean;
  satisfiedPreferred: boolean;
  missingRequired: FeatureRequirement[];
  missingOptional: FeatureRequirement[];
  missingPreferred: FeatureRequirement[];
  deviceCapability: CapabilityReport;
}

export function negotiateCapabilities(
  workload: WorkloadRequirements,
  device: CapabilityReport
): CapabilityNegotiationResult {
  const allFeatures = new Map<string, CapabilityFeature>();
  for (const f of device.target.features) {
    allFeatures.set(f.name, f);
  }
  
  const checkFeature = (req: FeatureRequirement): boolean => {
    const feature = allFeatures.get(req.feature);
    if (!feature || !feature.supported) return false;
    if (req.minVersion && feature.version) {
      return compareVersions(feature.version, req.minVersion) >= 0;
    }
    return true;
  };
  
  const missingRequired = workload.required.filter(r => !checkFeature(r));
  const missingOptional = workload.optional.filter(r => !checkFeature(r));
  const missingPreferred = workload.preferred.filter(r => !checkFeature(r));
  
  return {
    satisfied: missingRequired.length === 0,
    satisfiedRequired: missingRequired.length === 0,
    satisfiedOptional: missingOptional.length === 0,
    satisfiedPreferred: missingPreferred.length === 0,
    missingRequired,
    missingOptional,
    missingPreferred,
    deviceCapability: device,
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export interface CapabilityFeature {
  name: string;
  supported: boolean;
  version?: string;
  details?: Record<string, unknown>;
}

export interface SubgroupCapability {
  supported: boolean;
  minSize?: number;
  maxSize?: number;
  arithmetic?: boolean;
  ballot?: boolean;
  shuffle?: boolean;
  quad?: boolean;
}

export interface MemoryCapability {
  globalBytes: number;
  localBytes: number;
  constantBytes: number;
  unified: boolean;           // CPU/GPU unified memory
  hostMapping: boolean;       // Can map device memory to host
  atomicSupport: boolean;
  bufferOffsetAlignment: number;
}

export interface NumericCapability {
  fp16: boolean;
  fp32: boolean;
  fp64: boolean;
  bf16: boolean;
  int8: boolean;
  int16: boolean;
  int32: boolean;
  int64: boolean;
  tf32?: boolean;
}

export interface CapabilityTarget {
  executionModel: ExecutionModel;
  addressBits: 32 | 64;
  
  features: Set<CapabilityFeature>;
  
  subgroup: SubgroupCapability;
  memory: MemoryCapability;
  numeric: NumericCapability;
  
  maxWorkgroupSize: number;
  maxWorkgroupDimensions: { x: number; y: number; z: number };
  maxComputeUnits: number;
  clockFrequencyMHz: number;
  
  backend: {
    name: string;
    version: string;
  };
  
  targetIdentity: {
    vendor: string;
    architecture?: string;
    isa?: string;
    deviceName: string;
    driverVersion: string;
    runtimeVersion: string;
  };
}

export interface CapabilityReport {
  backendId: string;
  backendType: BackendType;
  target: CapabilityTarget;
  kernelsSupported: string[];
  timestamp: string;
  abiVersion: string;
  provenance: {
    detectedBy: string;
    detectionDurationMs: number;
  };
}

export type BackendType = "opencl" | "hip" | "vulkan" | "cuda" | "axiom-native" | "cpu-reference";

// ============================================================================
// MEMORY MODEL
// ============================================================================

export type MemoryFlags = 
  | "read-write" 
  | "read-only" 
  | "write-only" 
  | "host-visible" 
  | "host-coherent" 
  | "device-local"
  | "atomic";

export interface AxiomBufferDescriptor {
  sizeBytes: number;
  flags: MemoryFlags[];
  usage?: "storage" | "uniform" | "vertex" | "index" | "indirect" | "acceleration-structure";
  name?: string;
}

export interface AxiomAllocation {
  allocationId: string;
  buffer: AxiomBufferDescriptor;
  deviceAddress?: bigint;  // GPU virtual address
  hostPointer?: number;    // Mapped host pointer (if host-visible)
  offset: number;
  sizeBytes: number;
  backendHandle: unknown;
}

export interface AxiomBuffer {
  descriptor: AxiomBufferDescriptor;
  allocations: AxiomAllocation[];
}

// ============================================================================
// MEMORY ABI
// ============================================================================

export type MemoryFlags = 
  | "read-write" 
  | "read-only" 
  | "write-only" 
  | "host-visible" 
  | "host-coherent" 
  | "device-local"
  | "atomic";

export interface AxiomMemory {
  readonly abiVersion: string;
  
  // Allocation
  allocate(spec: AxiomAllocationSpec): Promise<AxiomAllocation>;
  free(allocation: AxiomAllocation): Promise<void>;
  
  // Mapping
  map(allocation: AxiomAllocation, flags?: MemoryFlags): Promise<AxiomMapping>;
  unmap(allocation: AxiomAllocation, mapping: AxiomMapping): Promise<void>;
  
  // Copy operations
  copy(src: AxiomAllocation, dst: AxiomAllocation, size: number, srcOffset?: number, dstOffset?: number): Promise<void>;
  fill(allocation: AxiomAllocation, pattern: number | Uint8Array, offset?: number, size?: number): Promise<void>;
  
  // Profiling & Telemetry
  synchronize(future: AxiomFuture): Promise<void>;
  profile(future: AxiomFuture): Promise<AxiomProfile>;
  queryTelemetry(): Promise<MemoryTelemetry>;
  setCachePolicy(allocation: AxiomAllocation, policy: CachePolicy): Promise<void>;
}

export interface AxiomAllocationSpec {
  sizeBytes: number;
  flags: MemoryFlags[];
  usage?: "storage" | "uniform" | "vertex" | "index" | "indirect" | "acceleration-structure";
  name?: string;
  numaPreferred?: number;
}

export interface AxiomMapping {
  readonly mappedPtr: any;
  readonly offset: number;
  readonly size: number;
  readonly flags: MemoryFlags;
}

export interface AxiomProfile {
  durationNs: number;
  bytesAccessed?: number;
}

export interface MemoryTelemetry {
  allocationLatencyNs: number;
  copyBandwidthGBps: number;
  copyLatencyNs: number;
  memoryCapacityBytes: number;
  workingSetBytes: number;
  localityScore: number;  // 0.0 = fully random, 1.0 = perfectly sequential
  numaNode: number;
  cacheLineUtilization: number;
  deviceUtilizationPercent: number;
  queueDepth: number;
}

export interface CachePolicy {
  readonly policy: "write-back" | "write-through" | "write-combined" | "uncached";
  readonly writeAllocates: boolean;
}

// ============================================================================
// KERNEL / IR MODEL
// ============================================================================

export type AxiomIRFormat = "spirv" | "llvm-ir" | "hip-clang" | "opencl-c" | "axiom-native";

export interface AxiomIRModule {
  moduleId: string;
  format: AxiomIRFormat;
  abiVersion: string;  // ABI version this module was compiled for
  binary: Uint8Array;
  entryPoints: string[];
  metadata: {
    sourceHash: string;
    compileOptions: string[];
    targetISA?: ISA;
    requiredFeatures: string[];
    workgroupSize?: { x: number; y: number; z: number };
    localMemoryBytes?: number;
    registersPerThread?: number;
  };
}

export interface AxiomExecutable {
  executableId: string;
  module: AxiomIRModule;
  entryPoint: string;
  pipelineLayout: AxiomPipelineLayout;
  backendHandle: unknown;
  compileTimeMs: number;
  compileLog: string;
}

export interface AxiomPipelineLayout {
  bindings: AxiomBinding[];
  pushConstantRanges: AxiomPushConstantRange[];
}

export interface AxiomBinding {
  binding: number;
  descriptorType: "storage-buffer" | "uniform-buffer" | "storage-image" | "sampler" | "acceleration-structure" | "sampled-image";
  descriptorCount: number;
  stages: ("compute" | "vertex" | "fragment" | "raygen" | "miss" | "closest-hit" | "intersection" | "any-hit" | "callable")[];
}

export interface AxiomPushConstantRange {
  offset: number;
  size: number;
  stages: ("compute" | "vertex" | "fragment" | "raygen" | "miss" | "closest-hit" | "intersection" | "any-hit" | "callable")[];
}

// ============================================================================
// DISPATCH MODEL
// ============================================================================

export interface AxiomDispatchArgs {
  workgroupCount: { x: number; y: number; z: number };
  workgroupSize?: { x: number; y: number; z: number };
  bindings: AxiomBindingValue[];
  pushConstants?: Uint8Array;
  specializationConstants?: Record<number, number>;
}

export interface AxiomBindingValue {
  binding: number;
  allocation: AxiomAllocation;
  offset?: number;
  size?: number;
}

export interface AxiomFuture {
  futureId: string;
  status: "pending" | "running" | "completed" | "failed";
  submitTime: number;
  startTime?: number;
  endTime?: number;
  backendHandle: unknown;
}

export interface AxiomResult {
  success: boolean;
  future: AxiomFuture;
  outputAllocations: AxiomAllocation[];
  profiling?: AxiomProfile;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AxiomProfile {
  durationNs: number;
  gpuTimeNs?: number;
  memoryThroughputBytes?: number;
  computeThroughputFlops?: number;
  occupancyPercent?: number;
  workgroupCount: { x: number; y: number; z: number };
  workgroupSize: { x: number; y: number; z: number };
  registersUsed?: number;
  localMemoryUsedBytes?: number;
  spillStoreCount?: number;
  spillLoadCount?: number;
  customCounters?: Record<string, number>;
}

// ============================================================================
// DEVICE INTERFACE (the ABI contract)
// ============================================================================

export interface AxiomDevice {
  readonly deviceId: string;
  readonly capability: CapabilityReport;
  readonly backendType: BackendType;
  readonly abiVersion: string;

  // Lifecycle
  initialize(config?: AxiomDeviceConfig): Promise<AxiomInitResult>;
  shutdown(): Promise<void>;

  // Memory
  allocate(descriptor: AxiomBufferDescriptor): Promise<AxiomAllocation>;
  free(allocation: AxiomAllocation): Promise<void>;
  map(allocation: AxiomAllocation): Promise<Uint8Array>;
  unmap(allocation: AxiomAllocation): Promise<void>;
  copy(src: AxiomAllocation, dst: AxiomAllocation, size: number, srcOffset?: number, dstOffset?: number): Promise<void>;
  fill(allocation: AxiomAllocation, pattern: Uint8Array, offset?: number, size?: number): Promise<void>;

  // Kernel
  compile(module: AxiomIRModule, target: CapabilityTarget): Promise<AxiomExecutable>;
  createPipelineLayout(layout: AxiomPipelineLayout): Promise<unknown>;

  // Dispatch
  dispatch(executable: AxiomExecutable, args: AxiomDispatchArgs): Promise<AxiomFuture>;
  synchronize(future: AxiomFuture, timeoutMs?: number): Promise<AxiomResult>;
  profile(future: AxiomFuture): Promise<AxiomProfile>;

  // Utilities
  queryTimestamp(): Promise<bigint>;
  getDeviceProperties(): CapabilityTarget;
}

export interface AxiomDeviceConfig {
  enableValidation?: boolean;
  enableProfiling?: boolean;
  preferredWorkgroupSize?: { x: number; y: number; z: number };
  maxInFlightCommands?: number;
  logLevel?: "none" | "error" | "warn" | "info" | "debug";
}

export interface AxiomInitResult {
  success: boolean;
  deviceId: string;
  capability: CapabilityReport;
  message?: string;
}

// ============================================================================
// BACKEND REGISTRY
// ============================================================================

export interface BackendFactory {
  readonly backendType: BackendType;
  readonly name: string;
  readonly version: string;
  probe(): Promise<CapabilityReport | null>;
  createDevice(deviceId: string, config?: AxiomDeviceConfig): Promise<AxiomDevice>;
  getSupportedISAs(): ISA[];
}

export interface AxiomBackendRegistry {
  readonly abiVersion: string;
  factories: Map<BackendType, BackendFactory>;
  register(factory: BackendFactory): void;
  get(backendType: BackendType): BackendFactory | undefined;
  probeAll(): Promise<CapabilityReport[]>;
}