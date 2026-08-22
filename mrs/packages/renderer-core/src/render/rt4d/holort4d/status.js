/**
 * Honest HoloRT4D status tags. Wave optics — not projection, not bulk-boundary.
 */

export const HOLORT4D_CONTRACT = "wave-optics";

export const HOLORT4D_STATUS = Object.freeze({
  contract: HOLORT4D_CONTRACT,
  accumulateFromPaths: "partial",
  accumulateGpu: "partial",
  polarFloatAtomic: "declared",
  polarFloatAtomicGap:
    "VK_EXT_shader_atomic_float / shaderBufferFloat32AtomicAdd is the locked float SSBO baseline; AMD documents it for RX 7000, not GCN4 Polar. Integer/fixed-point is a declared fallback, not a silent replacement. Polar Vulkan may compile atomic<f32>; hardware does not guarantee true atomicity. Off by default on Polar.",
  pathSampleLayout: "frozen",
  pathSampleContract: "enforced",
  pathFinalizeCpu: "enforced",
  pathFinalizeGpuHook: "partial",
  bindGroupSplit: "enforced",
  polarTiledCpu: "enforced",
  polarTiledGpu: "partial",
  polarWorkgroupSizes: "enforced",
  visionCpf: "partial",
  snapshotCpu: "enforced",
  snapshotCanonicalEnvelope: "enforced",
  ciems: "partial",
  ciemsEvidenceHash: "enforced",
  tiledSharedMemory: "partial",
  multiPassReduction: "declared",
  propagateFresnel: "declared",
  phaseEncode: "partial",
  phaseEncodeCpu: "enforced",
  lightFieldQuilt: "declared",
  rgbHolograms: "partial",
  rgbPhysicalSlm: "declared",
  worldToPlane: "declared",
  cameraAlignedBins: "partial",
  debugHoloTiles: "declared",
  debugPhaseWheel: "declared",
  debugTileInspector: "partial",
  debugWavefieldMovie: "declared",
  debugWSlice: "declared",
  debugRealImagCpu: "enforced",
  debugRealImagGpu: "declared",
  physicalValidity: "declared",
  notProjection: true,
  notEntanglementRenderer: true,
});

export const ACCUMULATOR_PATTERNS = Object.freeze({
  directSsboAtomic: Object.freeze({
    id: "direct-ssbo-atomic",
    status: "partial",
    gpu: "declared",
    polarFloatAtomic: "declared",
    note: "Baseline: atomicAdd(field[i].real, amp*c) and imag. CPU models the linear sum. Gated RX 7000+; not Polar default.",
  }),
  sharedMemoryTile: Object.freeze({
    id: "shared-memory-tile",
    status: "partial",
    gpu: "partial",
    note: "Polar primary path. CPU prefix-sum + u32 atomicAdd count + one writer per pixel. GPU dispatch wired (BinPaths 256, TiledAccumulate 16×16). Live Polar validation partial. Zero f32 atomics.",
  }),
  multiPassReduction: Object.freeze({
    id: "multi-pass-reduction",
    status: "declared",
    note: "Extreme 8K×8K. Not needed unless IMAX hologram.",
  }),
});
