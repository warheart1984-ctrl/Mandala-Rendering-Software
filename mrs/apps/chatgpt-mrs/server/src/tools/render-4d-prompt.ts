import { z } from "zod";
import {
  runPromptRender,
  type QualityPreset,
  type PngImagePayload,
  RENDER_CAPS,
} from "../render-jobs.js";

/**
 * High-level prompt → deterministic procedural RT4D still.
 * Prompt selects a scene archetype + palette; this is NOT diffusion / text-to-image.
 */
export const render4dPromptInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(RENDER_CAPS.maxPromptChars)
    .describe(
      "Natural-language hint that selects a procedural 4D scene archetype (e.g. 'cyan tesseract lattice'). Not diffusion."
    ),
  quality: z
    .enum(["smoke", "draft", "standard"])
    .optional()
    .describe(
      "smoke=64²@2spp; draft=256²@8spp (default); standard=448²@24spp. Caps apply."
    ),
  seed: z
    .number()
    .int()
    .optional()
    .describe("Optional uint32 seed for deterministic replay; derived from prompt if omitted"),
  width: z
    .number()
    .int()
    .min(RENDER_CAPS.minDim)
    .max(RENDER_CAPS.maxDim)
    .optional(),
  height: z
    .number()
    .int()
    .min(RENDER_CAPS.minDim)
    .max(RENDER_CAPS.maxDim)
    .optional(),
  samples: z
    .number()
    .int()
    .min(RENDER_CAPS.minSamples)
    .max(RENDER_CAPS.maxSamples)
    .optional(),
  maxDepth: z
    .number()
    .int()
    .min(RENDER_CAPS.minDepth)
    .max(RENDER_CAPS.maxDepth)
    .optional(),
};

const parser = z.object(render4dPromptInputShape);

export type PromptRenderToolResult = {
  text: string;
  image: PngImagePayload;
  render: {
    jobId: string;
    pngUrl: string;
    quality: QualityPreset;
    width: number;
    height: number;
    samples: number;
    maxDepth: number;
    provider: string;
    sha256: string;
    scene?: string;
    seed?: number;
    provenance: Record<string, unknown>;
  };
};

export async function handleRender4dPrompt(
  args: unknown
): Promise<PromptRenderToolResult> {
  const parsed = parser.parse(args ?? {});
  const quality = (parsed.quality ?? "draft") as QualityPreset;

  const result = await runPromptRender({
    prompt: parsed.prompt,
    quality,
    seed: parsed.seed,
    width: parsed.width,
    height: parsed.height,
    samples: parsed.samples,
    maxDepth: parsed.maxDepth,
    keepFile: false,
  });

  const sha256 = result.image.sha256;
  const scene =
    typeof result.provenance.scene === "string"
      ? result.provenance.scene
      : undefined;
  const seed =
    typeof result.provenance.seed === "number"
      ? result.provenance.seed
      : undefined;

  return {
    text: `RT4D procedural still (${result.width}×${result.height} @ ${result.samples}spp${scene ? `, scene=${scene}` : ""}) · sha256=${sha256.slice(0, 12)}… · NOT diffusion`,
    image: result.image,
    render: {
      jobId: result.jobId,
      pngUrl: result.pngUrl,
      quality: result.quality,
      width: result.width,
      height: result.height,
      samples: result.samples,
      maxDepth: result.maxDepth,
      provider: result.provider,
      sha256,
      scene,
      seed,
      provenance: result.provenance,
    },
  };
}
