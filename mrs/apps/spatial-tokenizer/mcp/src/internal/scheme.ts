/**
 * Spatial scheme documentation + mode catalogue (read-only knowledge).
 */

export const SPATIAL_MODES = [
  {
    id: "face" as const,
    title: "Face",
    when:
      "Close-up face / head depth (landmark-z or dense face depth). Prefer chamber landmark-z over photos.",
    notes:
      "Object labels (face.nose, face.eye, …) are partial when landmark XYZ is supplied. Photo→metric face depth is declared.",
  },
  {
    id: "room" as const,
    title: "Room",
    when:
      "Interior / room scan depth grids (opticalLength, stereo, lidar-style Float32). Use for free-space / occlusion reasoning.",
    notes:
      "Best with chamber or metric depth. Grayscale image_base64 is pseudo-depth only (partial).",
  },
  {
    id: "object" as const,
    title: "Object",
    when:
      "Single-object / prop depth for silhouette, grasp, or try-on briefs. Center the subject in the depth grid.",
    notes:
      "Object region labels beyond face.* are declared/heuristic. Prefer explicit depth arrays.",
  },
] as const;

export type SpatialModeId = (typeof SPATIAL_MODES)[number]["id"];

export const SCHEME_DOCS = {
  scheme: "HoloRT4D-Spatial-V1",
  fields: {
    scheme: "Always HoloRT4D-Spatial-V1",
    resolution: "8 or 16 — grid is resolution×resolution cells, row-major",
    width: "Source depth width in pixels",
    height: "Source depth height in pixels",
    cells: "Array of GridCell, length = resolution²",
    meta: "Optional provenance (mode, depth_source, depthMin/Max, brief_id)",
  },
  gridCell: {
    cell: "Index 0 .. resolution²-1 (row-major)",
    depth: "Quantized depth byte 0–255 (bin of mean cell depth)",
    curvature: "Mean abs Laplacian / slope magnitude (finite float)",
    normal: "Unit normal [nx, ny, nz] from depth gradients",
    object: "Optional region label (e.g. face.nose) — partial",
    motion: "Optional {dx,dy,mag} when prev depth / flow provided — partial",
  },
  hash: {
    algorithm: "SHA-256",
    input: "canonicalTokenJson (sorted keys, round6 floats)",
    status: "enforced",
  },
  status: {
    tokenizeFromDepthGrid: "enforced",
    curvatureFromGradients: "enforced",
    normalsFromGradients: "enforced",
    hashCanonicalJson: "enforced",
    faceObjectLabels: "partial",
    motionFromPrevDepth: "partial",
    imageBase64ToDepth: "declared (MCP offers grayscale pseudo-depth as partial)",
    photoToMetricDepth: "declared — not implemented",
    rateLimit: "declared stub (~120 calls/min local)",
  },
  prefer:
    "Float32 depth from chamber / opticalLength / landmark-z. Label grayscale image paths as pseudo-depth.",
} as const;
