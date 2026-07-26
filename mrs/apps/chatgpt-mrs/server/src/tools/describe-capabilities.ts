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
 * No FLUX, no Genblaze, no diffusion / text-to-image claim.
 */
export function handleDescribeCapabilities(): {
  text: string;
  capabilities: Record<string, unknown>;
} {
  const capabilities = {
    status: "partial",
    product: "MRS 4D Renderer",
    note: "Local chatgpt-mrs MCP → renderer-core RT4D. Returns MCP image/png content. Does not call Genblaze, FLUX, or B2.",
    tools: {
      rt4d_png_renderer: {
        status: "enforced",
        primary: true,
        tools: ["render_4d_prompt", "render_scene_spec_rt4d"],
        render:
          "CPU PathTracer4D still PNG (MCP image content + SHA-256 provenance)",
        honesty:
          "Deterministic procedural RT4D. Prompt selects scene archetype — not diffusion / not semantic text-to-image.",
        quality_presets: {
          smoke: "64x64 @ 2 spp (tests)",
          draft: "256x256 @ 8 spp (default)",
          standard: "448x448 @ 24 spp",
        },
      },
      scene_specification: {
        status: "enforced",
        tools: ["validate_scene_spec", "render_scene_spec_rt4d"],
      },
      scene4d_dto_viewport: {
        status: "enforced",
        primary: false,
        optional: true,
        tools: [
          "create_4d_scene",
          "update_4d_scene",
          "inspect_4d_point",
          "export_4d_scene",
          "replay_4d_scene",
        ],
        render: "Optional Canvas2D wireframe widget (not path-traced)",
      },
    },
    surfaces: [...RT4D_SURFACE_IDS],
    observation_modes: [...SUPPORTED_OBSERVATION_MODES],
    caps: {
      maxWidth: Math.min(MAX_WIDTH, 512),
      maxHeight: Math.min(MAX_HEIGHT, 512),
      maxSamples: Math.min(MAX_SAMPLES, 32),
      maxDepth: Math.min(MAX_DEPTH, 6),
      mcp_enforced_max: "512² / 32 spp / PNG byte cap — high/512spp rejected at MCP layer",
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
    text: "MRS 4D Renderer: primary tools return path-traced PNG (MCP image content). Optional Canvas2D viewport for Scene4DDTO. No Genblaze/FLUX/diffusion.",
    capabilities,
  };
}
