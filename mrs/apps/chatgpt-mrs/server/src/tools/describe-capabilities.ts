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
 * Native local RT4D plus an explicit Genblaze-backed 4D→3D orchestration lane.
 */
export function handleDescribeCapabilities(): {
  text: string;
  capabilities: Record<string, unknown>;
} {
  const capabilities = {
    status: "partial",
    product: "MRS 4D Renderer",
    note: "Local RT4D tools return native MCP image/png content. The complete 4D→3D tool calls the configured Genblaze service for RT4D, prompt-to-scene, Engine3D, provenance, and B2-backed asset records.",
    tools: {
      native_4d_to_3d_pipeline: {
        status: "enforced",
        primary: true,
        tools: ["render_4d_to_3d_pipeline"],
        stages: [
          "deterministic RT4D concept still",
          "governed SceneSpecification reveal",
          "Engine3D structure still with optional RT4D background composite",
        ],
        constraints: {
          no_diffusion: true,
          engine3d_polish: false,
          requires_genblaze_health: [
            "image_backend=rt4d",
            "prompt_scene.available=true",
            "engine3d_still.available=true",
          ],
        },
      },
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
      "diffusion / img2img polish in native pipeline tools",
      "photogrammetry / image-to-mesh",
      "headless WebGPU wavefront (mock-tested only)",
      "video / MP4 encode",
      "OAuth",
    ],
  };

  return {
    text: "MRS plugin: native RT4D PNG tools plus a Genblaze-backed RT4D→SceneSpecification→Engine3D pipeline. Results are MCP images with run IDs and provenance; no diffusion polish.",
    capabilities,
  };
}
