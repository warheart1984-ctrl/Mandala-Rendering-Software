/**
 * Axiom Memory ABI v0.1 — Standalone Interface
 * 
 * Sovereign memory abstraction, independent of compute backend.
 * Manages RAM, VRAM, and Storage with full telemetry.
 * 
 * DESIGN PRINCIPLE: Capability-first, vendor-second.
 * Axiom-X asks "can this substrate satisfy the memory demand?" not "is this an AMD GPU?"
 */

// ============================================================================
// VERSIONING
// ============================================================================

export const AXIOM_MEMORY_ABI_VERSION = "0.1.0";
export const AXIOM_MEMORY_ABI_NAME = "Axiom Memory ABI";

// ============================================================================
// MEMORY FLAGS
// ============================================================================

export type MemoryFlags =
  | "read-write"
  | "read-only"
  | "write-only"
  | "host-visible"
  | "host-coherent"
  | "device-local"
  | "atomic";

// ============================================================================
// BUFFER DESCRIPTOR
// ============================================================================

export interface AxiomMemoryAllocationSpec {
  sizeBytes: number;
  flags: MemoryFlags[];
  usage?:
    | "storage"
    | "uniform"
    | "vertex"
    | "index"
    | "indirect"
    | "acceleration-structure";
  name?: string;
  numaPreferred?: number;
}

// ============================================================================
// ALLOCATION
// ============================================================================

export interface AxiomMemoryAllocation {
  allocationId: string;
  buffer: AxiomMemoryAllocationSpec;
  deviceAddress?: bigint; // GPU virtual address (if applicable)
  hostPointer?: number; // Mapped host pointer (if host-visible)
  offset: number;
  sizeBytes: number;
  backendHandle: unknown;
}

// ============================================================================
// MAPPING
// ============================================================================

export interface AxiomMemoryMapping {
  readonly mappedPtr: any;
  readonly offset: number;
  readonly size: number;
  readonly flags: MemoryFlags;
}

// ============================================================================
// PROFILE / TELEMETRY
// ============================================================================

export interface AxiomMemoryProfile {
  durationNs: number;
  bytesAccessed?: number;
}

export interface MemoryTelemetry {
  allocationLatencyNs: number;
  copyBandwidthGBps: number;
  copyLatencyNs: number;
  memoryCapacityBytes: number;
  workingSetBytes: number;
  localityScore: number; // 0.0 = fully random, 1.0 = perfectly sequential
  numaNode: number;
  cacheLineUtilization: number;
  deviceUtilizationPercent: number;
  queueDepth: number;
}

// ============================================================================
// CACHE POLICY
// ============================================================================

export interface CachePolicy {
  readonly policy: "write-back" | "write-through" | "write-combined" | "uncached";
  readonly writeAllocates: boolean;
}

// ============================================================================
// THE AxiomMemory INTERFACE — THE CONTRACT
// ============================================================================

export interface AxiomMemory {
  readonly abiVersion: string;

  // Allocation
  allocate(spec: AxiomMemoryAllocationSpec): Promise<AxiomMemoryAllocation>;
  free(allocation: AxiomMemoryAllocation): Promise<void>;

  // Mapping
  map(allocation: AxiomMemoryAllocation, flags?: MemoryFlags): Promise<AxiomMemoryMapping>;
  unmap(allocation: AxiomMemoryAllocation, mapping: AxiomMemoryMapping): Promise<void>;

  // Copy operations
  copy(
    src: AxiomMemoryAllocation,
    dst: AxiomMemoryAllocation,
    size: number,
    srcOffset?: number,
    dstOffset?: number
  ): Promise<void>;

  // Fill operations
  fill(
    allocation: AxiomMemoryAllocation,
    pattern: number | Uint8Array,
    offset?: number,
    size?: number
  ): Promise<void>;

  // Profiling & Telemetry
  synchronize(future: any): Promise<void>;
  profile(future: any): Promise<AxiomMemoryProfile>;
  queryTelemetry(): Promise<MemoryTelemetry>;
  setCachePolicy(
    allocation: AxiomMemoryAllocation,
    policy: CachePolicy
  ): Promise<void>;
}