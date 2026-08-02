import { z } from "zod";
import { getSceneOrThrow } from "../scene-store.js";

export const inspectRt4dProvenanceInputShape = {
  sceneId: z.string().min(1),
};

const parser = z.object(inspectRt4dProvenanceInputShape);

export function handleInspectRt4dProvenance(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);
  return {
    text: `Provenance for ${scene.sceneId}: intent=${scene.provenance.intentId} timeline=${scene.provenance.timelineId} world=${scene.provenance.worldId}`,
    sceneId: scene.sceneId,
    provenance: scene.provenance,
    continuityState: scene.continuityState,
    shotEvidence: scene.shotEvidence,
    preview: scene.preview ?? null,
    statusTag: "partial" as const,
    governanceNote:
      "No claim without evidence. Envelope fields are in-memory partial; verified replay / continuity compare / approvals remain declared.",
  };
}
