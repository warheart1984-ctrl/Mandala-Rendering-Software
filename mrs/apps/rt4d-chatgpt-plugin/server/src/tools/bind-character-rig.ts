import { z } from "zod";
import {
  bindCharacterRigToScene,
  clayStagePayload,
} from "../character-pipeline.js";
import { rasterClayRig } from "../stage-raster.js";
import { SpeciesSchema } from "./create-4d-scene.js";

export const bindCharacterRigInputShape = {
  sceneId: z.string().min(1),
  species: SpeciesSchema.optional().describe(
    "human | fox (quadruped fixture) | anthro (biped fox/warrior fixture). Default anthro."
  ),
  characterId: z.string().min(1).optional().describe(
    "Preview/production characterId. warrior-anthro-fox-01 uses sculptor fixture clay (not hull-as-body)."
  ),
};

const parser = z.object(bindCharacterRigInputShape);

export function handleBindCharacterRig(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const species = parsed.species ?? "anthro";
  const scene = bindCharacterRigToScene(parsed.sceneId, species, parsed.characterId);
  const binding = scene.characterPipeline?.rigBinding;
  const mesh = scene.characterPipeline?.wireMesh;
  const clay = mesh && binding ? clayStagePayload(scene) : null;
  const png =
    mesh && binding && clay
      ? rasterClayRig({
          mesh,
          binding,
          vertices3d: clay.clay.vertices3d,
          distance4d: scene.projection.distance4d,
          width: 512,
          height: 512,
        })
      : null;

  return {
    text: `Bound ${species} fixture rig ${binding?.rigId} (${binding?.boneCount} bones, status=${binding?.status}) onto scene ${scene.sceneId}. Clay+rig PNG attached. Not a production sculpt.`,
    sceneId: scene.sceneId,
    rigBinding: binding,
    meshSha256: mesh?.meshSha256 ?? null,
    includesRigPolylines: mesh?.includesRigPolylines ?? false,
    pngBase64: png?.pngBase64 ?? null,
    pngSha256: png?.sha256 ?? null,
    width: png?.width ?? null,
    height: png?.height ?? null,
    topologyKind: clay?.clay.topologyKind ?? null,
    productionSculpt: false,
    characterModelHash: scene.shotEvidence?.characterModelHash ?? null,
    continuityState: scene.continuityState,
    shotEvidence: scene.shotEvidence,
    provenance: scene.provenance,
    statusTag: "partial" as const,
    visualKind: "clay_rig_binding" as const,
    implemented: true,
  };
}
