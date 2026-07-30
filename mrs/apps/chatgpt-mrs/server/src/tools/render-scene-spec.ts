import { z } from "zod";
import {
  parseSceneSpecification,
  validateSceneCapabilities,
} from "@mrs/renderer-core/scene-spec";
import {
  runSceneSpecRender,
  type QualityPreset,
  type PngImagePayload,
  RENDER_CAPS,
} from "../render-jobs.js";
import { parseSceneSpecPayload } from "./schema-helpers.js";

export const renderSceneSpecInputShape = {
  // Stringified JSON — OpenAI rejects z.record(z.unknown()) → additionalProperties:{}
  sceneSpec: z
    .string()
    .describe(
      "SceneSpecification as a JSON string to path-trace via local RT4D"
    ),
  quality: z
    .enum(["smoke", "draft", "standard"])
    .optional()
    .describe(
      "smoke=64²@2spp (tests); draft=256²@8spp (default); standard=448²@24spp"
    ),
  width: z
    .number()
    .int()
    .min(RENDER_CAPS.minDim)
    .max(RENDER_CAPS.maxDim)
    .optional()
    .describe(`Override width (${RENDER_CAPS.minDim}–${RENDER_CAPS.maxDim})`),
  height: z
    .number()
    .int()
    .min(RENDER_CAPS.minDim)
    .max(RENDER_CAPS.maxDim)
    .optional()
    .describe(`Override height (${RENDER_CAPS.minDim}–${RENDER_CAPS.maxDim})`),
  samples: z
    .number()
    .int()
    .min(RENDER_CAPS.minSamples)
    .max(RENDER_CAPS.maxSamples)
    .optional()
    .describe(`Samples per pixel (${RENDER_CAPS.minSamples}–${RENDER_CAPS.maxSamples})`),
  maxDepth: z
    .number()
    .int()
    .min(RENDER_CAPS.minDepth)
    .max(RENDER_CAPS.maxDepth)
    .optional()
    .describe(`Path bounce depth (${RENDER_CAPS.minDepth}–${RENDER_CAPS.maxDepth})`),
  seed: z
    .number()
    .int()
    .optional()
    .describe("Optional seed written into provenance when supported by the spec"),
};

const parser = z.object(renderSceneSpecInputShape);

export type RenderToolResult = {
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
    provenance: Record<string, unknown>;
  };
};

export async function handleRenderSceneSpec(
  args: unknown
): Promise<RenderToolResult> {
  const parsed = parser.parse(args ?? {});
  const quality = (parsed.quality ?? "draft") as QualityPreset;
  const sceneSpecPayload = parseSceneSpecPayload(parsed.sceneSpec);
  const sceneSpec =
    parsed.seed == null
      ? sceneSpecPayload
      : {
          ...sceneSpecPayload,
          output: {
            ...(typeof sceneSpecPayload.output === "object" &&
            sceneSpecPayload.output
              ? (sceneSpecPayload.output as Record<string, unknown>)
              : {}),
            seed: parsed.seed >>> 0,
          },
        };

  const structural = parseSceneSpecification(sceneSpec);
  if (!structural.ok) {
    const msg = structural.errors
      .map((e: { path?: string; message: string }) =>
        `${e.path || "(root)"}: ${e.message}`
      )
      .join("; ");
    throw new Error(`invalid SceneSpecification: ${msg}`);
  }
  const caps = validateSceneCapabilities(structural.value, { target: "rt4d" });
  if (!caps.ok) {
    const msg = caps.errors
      .map((e: { path?: string; message: string }) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(`unsupported SceneSpecification: ${msg}`);
  }

  const result = await runSceneSpecRender(sceneSpec, {
    quality,
    width: parsed.width,
    height: parsed.height,
    samples: parsed.samples,
    maxDepth: parsed.maxDepth,
    keepFile: false,
  });

  const sha256 = result.image.sha256;
  return {
    text: `RT4D PNG ready (${result.width}×${result.height} @ ${result.samples}spp, ${quality}) · sha256=${sha256.slice(0, 12)}… · provider=${result.provider}`,
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
      provenance: result.provenance,
    },
  };
}
