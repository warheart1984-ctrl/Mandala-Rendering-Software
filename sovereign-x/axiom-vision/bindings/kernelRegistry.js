/**
 * Axiom Vision — Kernel Registry Entries.
 *
 * Registers vision kernels in the existing sovereign-x KernelRegistry.
 * Vision kernels follow the same ABI contract as render kernels.
 */

/**
 * Get all vision kernel entries for registration.
 * Add "vision" to KERNEL_CATEGORIES before calling register().
 *
 * @returns {Object[]} Array of kernel entry objects
 */
export function getVisionKernelEntries() {
  return [
    {
      kernelId: "vision_edge_sobel_3x3",
      category: "vision",
      backends: ["cpu-sim", "opencl", "webgpu", "cuda", "vulkan"],
      qualityTier: "reference",
      determinismGuarantee: "bit-exact",
      allowedSemantics: ["edge_magnitude", "edge_direction"],
      maxTileSize: { width: 512, height: 512 },
      conformanceProfile: [
        "determinism",
        "vision.tile_boundary_continuity",
        "vision.feature_hash_stability",
        "vision.deterministic_features_reproducible",
        "no_tile_boundary_artifacts",
      ],
      replayMetadata: {
        inputSchema: "VisionTile",
        outputSchema: "EdgeFeatureSet",
        deterministic: true,
        seedRequired: false,
      },
      provenanceSchema: {
        required: ["kernelId", "backendId", "tileId", "inputHash", "featureHashes"],
        tileTracked: true,
      },
      description: "Sobel 3x3 edge detection, bit-exact across all backends",
    },
    {
      kernelId: "vision_histogram_perchannel",
      category: "vision",
      backends: ["cpu-sim", "opencl", "webgpu", "cuda", "vulkan"],
      qualityTier: "reference",
      determinismGuarantee: "bit-exact",
      allowedSemantics: ["color_distribution", "dominant_color"],
      maxTileSize: { width: 2048, height: 2048 },
      conformanceProfile: [
        "determinism",
        "vision.feature_hash_stability",
        "vision.deterministic_features_reproducible",
      ],
      replayMetadata: {
        inputSchema: "VisionTile",
        outputSchema: "ColorHistogram",
        deterministic: true,
        seedRequired: false,
      },
      provenanceSchema: {
        required: ["kernelId", "backendId", "tileId", "inputHash", "featureHashes"],
        tileTracked: true,
      },
      description: "Per-channel color histogram, deterministic binning",
    },
    {
      kernelId: "vision_gradient_sobel_field",
      category: "vision",
      backends: ["cpu-sim", "opencl", "webgpu", "cuda", "vulkan"],
      qualityTier: "reference",
      determinismGuarantee: "bit-exact",
      allowedSemantics: ["gradient_magnitude", "gradient_direction"],
      maxTileSize: { width: 512, height: 512 },
      conformanceProfile: [
        "determinism",
        "vision.feature_hash_stability",
        "vision.deterministic_features_reproducible",
      ],
      replayMetadata: {
        inputSchema: "VisionTile",
        outputSchema: "GradientField",
        deterministic: true,
        seedRequired: false,
      },
      provenanceSchema: {
        required: ["kernelId", "backendId", "tileId", "inputHash", "featureHashes"],
        tileTracked: true,
      },
      description: "Dense gradient field via Sobel, deterministic sampling",
    },
    {
      kernelId: "vision_connected_components_8way",
      category: "vision",
      backends: ["cpu-sim", "opencl", "webgpu"],
      qualityTier: "reference",
      determinismGuarantee: "bit-exact",
      allowedSemantics: ["region_label", "region_area", "region_centroid"],
      maxTileSize: { width: 1024, height: 1024 },
      conformanceProfile: [
        "determinism",
        "vision.feature_hash_stability",
        "vision.deterministic_features_reproducible",
      ],
      replayMetadata: {
        inputSchema: "BinaryMask",
        outputSchema: "RegionSet",
        deterministic: true,
        seedRequired: false,
      },
      provenanceSchema: {
        required: ["kernelId", "backendId", "tileId", "inputHash", "featureHashes"],
        tileTracked: true,
      },
      description: "8-connected component labeling, Union-Find, deterministic",
    },
    {
      kernelId: "vision_contours_suzuki_abe",
      category: "vision",
      backends: ["cpu-sim", "opencl", "webgpu"],
      qualityTier: "reference",
      determinismGuarantee: "bit-exact",
      allowedSemantics: ["contour_points", "contour_area", "contour_perimeter", "hu_moments"],
      maxTileSize: { width: 1024, height: 1024 },
      conformanceProfile: [
        "determinism",
        "vision.feature_hash_stability",
        "vision.deterministic_features_reproducible",
      ],
      replayMetadata: {
        inputSchema: "BinaryMask",
        outputSchema: "ContourSet",
        deterministic: true,
        seedRequired: false,
      },
      provenanceSchema: {
        required: ["kernelId", "backendId", "tileId", "inputHash", "featureHashes"],
        tileTracked: true,
      },
      description: "Suzuki-Abe border following, external + hole contours with Hu moments",
    },
  ];
}

/**
 * Register vision kernels in an existing KernelRegistry instance.
 *
 * @param {Object} registry - KernelRegistry instance (from sovereign-x/uals/kernel-registry)
 * @returns {number} Number of kernels registered
 */
export function registerVisionKernels(registry) {
  const entries = getVisionKernelEntries();
  for (const entry of entries) {
    registry.register(entry);
  }
  return entries.length;
}
