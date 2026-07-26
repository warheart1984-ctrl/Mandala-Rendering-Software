import {
  RT4D_SURFACE_IDS,
  SUPPORTED_OBSERVATION_MODES,
  MAX_WIDTH,
  MAX_HEIGHT,
  MAX_SAMPLES,
  MAX_DEPTH,
} from "@mrs/renderer-core/scene-spec";

/**
 * Honest capability card for the ChatGPT model (Drive-G-1).
 * No FLUX, no Genblaze, no headless WebGPU claim.
 */
export function handleDescribeCapabilities(): {
  text: string;
  capabilities: Record<string, unknown>;
} {
  const capabilities = {
    status: "partial",
    note: "Local chatgpt-mrs MCP → renderer-core RT4D. Does not call Genblaze, FLUX, or B2.",
    tools: {
      scene4d_dto_viewport: {
        status: "enforced",
        tools: [
          "create_4d_scene",
          "update_4d_scene",
          "inspect_4d_point",
          "export_4d_scene",
          "replay_4d_scene",
        ],
        render: "Canvas2D wireframe widget (not path-traced)",
      },
      scene_specification_rt4d: {
        status: "enforced",
        tools: [
          "validate_scene_spec",
          "render_scene_spec_rt4d",
          "describe_4drs_capabilities",
        ],
        render: "CPU PathTracer4D still PNG via render-scene.mjs subprocess",
        quality_presets: {
          draft: "256x256 @ 8 spp (default)",
          standard: "448x448 @ 24 spp",
        },
      },
    },
    surfaces: [...RT4D_SURFACE_IDS],
    observation_modes: [...SUPPORTED_OBSERVATION_MODES],
    caps: {
      maxWidth: MAX_WIDTH,
      maxHeight: MAX_HEIGHT,
      maxSamples: MAX_SAMPLES,
      maxDepth: MAX_DEPTH,
      mcp_enforced_max: "standard preset — high/512spp rejected at MCP layer",
    },
    not_included: [
      "FLUX / NVIDIA NIM diffusion",
      "Genblaze HTTP / B2 storage",
      "photogrammetry / image-to-mesh",
      "headless WebGPU wavefront (mock-tested only)",
      "video / MP4 encode",
      "OAuth",
    ],
  };

  return {
    text: "MRS 4DRS capabilities (honest): Canvas2D Scene4DDTO widget + local RT4D SceneSpecification stills. No Genblaze/FLUX.",
    capabilities,
  };
}
