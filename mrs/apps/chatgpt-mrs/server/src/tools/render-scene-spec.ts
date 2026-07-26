import { z } from "zod";
import {
  parseSceneSpecification,
  validateSceneCapabilities,
} from "@mrs/renderer-core/scene-spec";
import {
  runSceneSpecRender,
  type QualityPreset,
} from "../render-jobs.js";

export const renderSceneSpecInputShape = {
  sceneSpec: z
    .record(z.unknown())
    .describe("SceneSpecification JSON object to path-trace via local RT4D"),
  quality: z
    .enum(["draft", "standard"])
    .optional()
    .describe("draft=256²@8spp (~seconds); standard=448²@24spp (slower)"),
};

const parser = z.object(renderSceneSpecInputShape);

export async function handleRenderSceneSpec(args: unknown): Promise<{
  text: string;
  render: {
    pngUrl: string;
    jobId: string;
    quality: QualityPreset;
    provenance: Record<string, unknown>;
  };
}> {
  const parsed = parser.parse(args ?? {});
  const quality = (parsed.quality ?? "draft") as QualityPreset;

  const structural = parseSceneSpecification(parsed.sceneSpec);
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

  const result = await runSceneSpecRender(
    parsed.sceneSpec as Record<string, unknown>,
    quality
  );

  return {
    text: `RT4D still ready (${quality}) · ${result.pngUrl} · sha256=${String(result.provenance.sha256 ?? "—").slice(0, 12)}…`,
    render: {
      pngUrl: result.pngUrl,
      jobId: result.jobId,
      quality: result.quality,
      provenance: result.provenance,
    },
  };
}
