import { z } from "zod";
import {
  clayStagePayload,
  ensureEnergyMesh,
  recordBeautyStage,
  recordClayStage,
} from "../character-pipeline.js";
import { commitSceneRecord, getSceneOrThrow } from "../scene-store.js";
import {
  rasterBeautyWithGaps,
  rasterClayRig,
  rasterEnergyWireMesh,
} from "../stage-raster.js";

export const RenderStageSchema = z.enum(["energy", "clay_rig", "beauty"]);

export const renderStageInputShape = {
  sceneId: z.string().min(1),
  stage: RenderStageSchema.describe(
    "energy = 4D wire-mesh PNG; clay_rig = clay+armature PNG (requires bind); beauty = partial-with-gaps still (Lemonade polish when up, else lit clay)."
  ),
  width: z.number().int().min(16).max(1024).optional(),
  height: z.number().int().min(16).max(1024).optional(),
};

const parser = z.object(renderStageInputShape);

export async function handleRenderStage(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);
  const width = parsed.width ?? 512;
  const height = parsed.height ?? 512;

  if (parsed.stage === "energy") {
    ensureEnergyMesh(
      scene,
      scene.characterPipeline?.intendedSpecies ?? "anthro"
    );
    const committed = commitSceneRecord(scene);
    const mesh = committed.characterPipeline?.wireMesh;
    if (!mesh) {
      return {
        text: `energy stage missing wire mesh on ${parsed.sceneId}.`,
        sceneId: parsed.sceneId,
        stage: "energy" as const,
        statusTag: "partial" as const,
        implemented: true,
        error: "MeshMissing",
      };
    }
    const png = rasterEnergyWireMesh({
      mesh,
      distance4d: committed.projection.distance4d,
      width,
      height,
    });
    return {
      text: `Energy stage PNG for ${committed.sceneId}: ${mesh.vertexCount} verts / ${mesh.edgeCount} edges (4D wire field, partial). Not photoreal.`,
      sceneId: committed.sceneId,
      stage: "energy" as const,
      meshSha256: mesh.meshSha256,
      rigSha256: committed.characterPipeline?.rigBinding?.rigSha256 ?? null,
      vertexCount: mesh.vertexCount,
      edgeCount: mesh.edgeCount,
      pngBase64: png.pngBase64,
      pngSha256: png.sha256,
      width: png.width,
      height: png.height,
      stages: committed.characterPipeline?.stages,
      shotEvidence: committed.shotEvidence,
      statusTag: "partial" as const,
      visualKind: "energy_wire_mesh" as const,
      implemented: true,
    };
  }

  if (parsed.stage === "clay_rig") {
    if (!scene.characterPipeline?.rigBinding) {
      return {
        text: `clay_rig requires bind_character_rig on ${parsed.sceneId} first.`,
        sceneId: parsed.sceneId,
        stage: "clay_rig" as const,
        statusTag: "partial" as const,
        implemented: true,
        error: "RigNotBound",
      };
    }
    const payload = clayStagePayload(scene);
    const committed = recordClayStage(parsed.sceneId);
    const mesh = committed.characterPipeline?.wireMesh;
    const binding = committed.characterPipeline?.rigBinding;
    if (!mesh || !binding) {
      return {
        text: `clay_rig missing mesh/rig on ${parsed.sceneId}.`,
        sceneId: parsed.sceneId,
        stage: "clay_rig" as const,
        statusTag: "partial" as const,
        implemented: true,
        error: "MeshMissing",
      };
    }
    const png = rasterClayRig({
      mesh,
      binding,
      vertices3d: payload.clay.vertices3d,
      distance4d: committed.projection.distance4d,
      width,
      height,
    });
    return {
      text: `Clay+rig PNG for ${committed.sceneId}: fixture armature ${binding.rigId} (partial). Not a production sculpt.`,
      sceneId: committed.sceneId,
      stage: "clay_rig" as const,
      clay: payload.clay,
      claySha256: payload.claySha256,
      armatureSha256: payload.armatureSha256,
      meshSha256: payload.meshSha256,
      rigSha256: binding.rigSha256,
      pngBase64: png.pngBase64,
      pngSha256: png.sha256,
      width: png.width,
      height: png.height,
      stages: committed.characterPipeline?.stages,
      shotEvidence: committed.shotEvidence,
      statusTag: "partial" as const,
      visualKind: "clay_rig" as const,
      implemented: true,
    };
  }

  if (!scene.characterPipeline?.rigBinding) {
    return {
      text: `beauty requires bind_character_rig on ${parsed.sceneId} first.`,
      sceneId: parsed.sceneId,
      stage: "beauty" as const,
      statusTag: "partial" as const,
      beautyFidelity: "partial_with_gaps" as const,
      implemented: true,
      error: "RigNotBound",
    };
  }

  const payload = clayStagePayload(scene);
  const mesh = scene.characterPipeline.wireMesh;
  const binding = scene.characterPipeline.rigBinding;
  if (!mesh) {
    return {
      text: `beauty missing wire mesh on ${parsed.sceneId}.`,
      sceneId: parsed.sceneId,
      stage: "beauty" as const,
      statusTag: "partial" as const,
      implemented: true,
      error: "MeshMissing",
    };
  }

  const beauty = await rasterBeautyWithGaps({
    prompt: scene.prompt,
    species: binding.species,
    mesh,
    binding,
    vertices3d: payload.clay.vertices3d,
    distance4d: scene.projection.distance4d,
    width,
    height,
  });
  const committed = recordBeautyStage(parsed.sceneId, beauty.sha256);

  return {
    text: `Beauty PNG for ${committed.sceneId} via ${beauty.source} (partial_with_gaps). Gaps: ${beauty.gaps.join("; ")}. Not a photoreal claim.`,
    sceneId: committed.sceneId,
    stage: "beauty" as const,
    pngBase64: beauty.pngBase64,
    pngSha256: beauty.sha256,
    width: beauty.width,
    height: beauty.height,
    previewSource: beauty.source,
    meshSha256: committed.characterPipeline?.wireMesh?.meshSha256 ?? null,
    rigSha256: committed.characterPipeline?.rigBinding?.rigSha256 ?? null,
    stages: committed.characterPipeline?.stages,
    shotEvidence: committed.shotEvidence,
    gaps: beauty.gaps,
    statusTag: "partial" as const,
    beautyFidelity: "partial_with_gaps" as const,
    visualKind: "beauty_partial_with_gaps" as const,
    implemented: true,
  };
}
