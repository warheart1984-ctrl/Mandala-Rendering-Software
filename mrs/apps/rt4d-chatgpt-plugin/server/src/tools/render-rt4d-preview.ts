import { z } from "zod";
import { renderViaEngine } from "../engine-client.js";
import { ProductionModeSchema } from "../modes.js";
import { attachPreview, getSceneOrThrow } from "../scene-store.js";

export const renderRt4dPreviewInputShape = {
  sceneId: z.string().min(1),
  mode: ProductionModeSchema.optional().describe(
    "Optional mode override for documentation only; scene mode remains authoritative."
  ),
  width: z.number().int().min(16).max(1024).optional(),
  height: z.number().int().min(16).max(1024).optional(),
  continuityState: z
    .object({
      characterState: z.record(z.unknown()).optional(),
      worldState: z.record(z.unknown()).optional(),
      cameraState: z.record(z.unknown()).optional(),
      emotionState: z.record(z.unknown()).optional(),
      rt4dState: z.record(z.unknown()).optional(),
      continuityVersion: z.number().int().min(0).optional(),
    })
    .optional()
    .describe("Optional continuity patch before preview (in-memory)."),
};

const parser = z.object(renderRt4dPreviewInputShape);

export async function handleRenderRt4dPreview(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);

  if (parsed.continuityState) {
    scene.continuityState = {
      ...scene.continuityState,
      characterState: {
        ...scene.continuityState.characterState,
        ...(parsed.continuityState.characterState ?? {}),
      },
      worldState: {
        ...scene.continuityState.worldState,
        ...(parsed.continuityState.worldState ?? {}),
      },
      cameraState: {
        ...scene.continuityState.cameraState,
        ...(parsed.continuityState.cameraState ?? {}),
      },
      emotionState: {
        ...scene.continuityState.emotionState,
        ...(parsed.continuityState.emotionState ?? {}),
      },
      rt4dState: {
        ...scene.continuityState.rt4dState,
        ...(parsed.continuityState.rt4dState ?? {}),
      },
      continuityVersion:
        parsed.continuityState.continuityVersion ??
        scene.continuityState.continuityVersion,
    };
  }

  const engine = await renderViaEngine({
    prompt: scene.prompt,
    sceneId: scene.sceneId,
    sceneSha256: scene.provenance.hashes.sceneSha256,
    rotations: scene.rotations,
    projection: scene.projection,
    width: parsed.width,
    height: parsed.height,
  });

  const updated = attachPreview(scene.sceneId, {
    previewUrl: engine.previewUrl,
    sha256: engine.sha256,
    source: engine.source,
    width: engine.width,
    height: engine.height,
  });

  return {
    text:
      `Preview for ${updated.sceneId} via ${engine.source}. ${engine.note}` +
      (engine.renderBundle
        ? ` renderId=${engine.renderBundle.renderId} evidence=${engine.renderBundle.evidenceStatus} promotion=${engine.renderBundle.promotionStatus} replayToken=${engine.evidence?.replayToken?.slice(0, 16)}…`
        : engine.evidence
          ? ` replayToken=${engine.evidence.replayToken.slice(0, 16)}… conformance=${engine.evidence.conformance?.ok ?? "n/a"}`
          : ""),
    sceneId: updated.sceneId,
    previewUrl: engine.previewUrl,
    sha256: engine.sha256,
    source: engine.source,
    width: engine.width,
    height: engine.height,
    runId: engine.runId,
    evidence: engine.evidence,
    renderBundle: engine.renderBundle,
    provenance: updated.provenance,
    continuityState: updated.continuityState,
    shotEvidence: updated.shotEvidence,
    statusTag: "partial" as const,
  };
}
