/**
 * Example stubs — commented sample prompts for Spatial Tokens.
 * Status: skeleton illustrations, not live integrations.
 */

/* Interior
 * Prompt: "Given this HoloRT4D-Spatial-V1 token, list free floor cells and occluding walls."
 * Input: chamber depth of a room scan → tokenizeFromDepthGrid
 */

/* Robotics
 * Prompt: "Plan a 4-waypoint path avoiding cells with depth < 40 and high curvature."
 * Input: depth from stereo / opticalLength map → token + motion from prev frame
 */

/* Dermatology (assistive — not diagnosis)
 * Prompt: "Summarize curvature hotspots in the token as structured notes for a clinician."
 * Input: surface depth / photometric stereo map → token (partial labels only)
 */

/* Fashion
 * Prompt: "Describe silhouette depth bands for a garment try-on brief."
 * Input: body/landmark-z depth → face/body region object labels (partial)
 */

export const EXAMPLE_PROMPTS = Object.freeze({
  interior:
    "Given this HoloRT4D-Spatial-V1 token, list free floor cells and occluding walls.",
  robotics:
    "Plan a 4-waypoint path avoiding cells with depth < 40 and high curvature.",
  dermatology:
    "Summarize curvature hotspots in the token as structured notes for a clinician.",
  fashion:
    "Describe silhouette depth bands for a garment try-on brief.",
});
