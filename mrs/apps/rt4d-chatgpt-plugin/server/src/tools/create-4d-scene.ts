import { z } from "zod";
import { ContinuityStateInputSchema, ProductionModeSchema } from "../modes.js";
import { attachEnergyMeshToScene } from "../character-pipeline.js";
import { rasterEnergyWireMesh } from "../stage-raster.js";
import { handleCreateRt4dScene } from "./create-rt4d-scene.js";

export const SpeciesSchema = z.enum(["human", "fox", "anthro"]);

export const create4dSceneInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(2000)
    .describe("Character / scene direction. Becomes the 4D energy wire-mesh seed."),
  species: SpeciesSchema.optional().describe(
    "Intended species. Default anthro (biped fox/warrior). fox = quadruped fixture. Does not bind the rig yet."
  ),
  topology: z
    .enum(["tesseract", "moebius"])
    .optional()
    .describe(
      "Substrate topology. 'tesseract' (default) = hypercube + filaments. 'moebius' = hexagonal lattice on torus with twist parity (Flower of Life)."
    ),
  mode: ProductionModeSchema.optional().describe(
    "Defaults to add_rt4d_powers (RT4D energy field). Use create_anime_character when the request is portrait-only."
  ),
  rotationPlanes: z
    .array(
      z.object({
        plane: z.enum(["XY", "XZ", "XW", "YZ", "YW", "ZW"]),
        speed: z.number(),
      })
    )
    .optional(),
  projection: z
    .object({
      type: z.enum(["perspective", "orthographic"]),
      distance4d: z.number(),
      distance3d: z.number(),
    })
    .optional(),
  continuityState: ContinuityStateInputSchema,
  intentId: z.string().optional(),
  timelineId: z.string().optional(),
  worldId: z.string().optional(),
  parentShotId: z.string().nullable().optional(),
};

const parser = z.object(create4dSceneInputShape);

export function handleCreate4dScene(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const species = parsed.species ?? "anthro";
  const created = handleCreateRt4dScene({
    prompt: parsed.prompt,
    mode: parsed.mode ?? "add_rt4d_powers",
    rotationPlanes: parsed.rotationPlanes,
    projection: parsed.projection,
    continuityState: parsed.continuityState,
    intentId: parsed.intentId,
    timelineId: parsed.timelineId,
    worldId: parsed.worldId,
    parentShotId: parsed.parentShotId,
  });

  const topology = parsed.topology ?? "tesseract";
  const scene = attachEnergyMeshToScene(created.sceneId, species, topology);
  const mesh = scene.characterPipeline?.wireMesh;
  const png = mesh
    ? rasterEnergyWireMesh({
        mesh,
        distance4d: scene.projection.distance4d,
        width: 512,
        height: 512,
      })
    : null;

  return {
    text: `Created 4D energy/wire-mesh scene ${scene.sceneId} species=${species} topology=${topology} verts=${mesh?.vertexCount ?? 0} edges=${mesh?.edgeCount ?? 0}. Energy PNG attached (partial dimensional field, not a production sculpt). Next: bind_character_rig then render_stage.`,
    sceneId: scene.sceneId,
    species,
    topology,
    wireMesh: mesh,
    meshSha256: mesh?.meshSha256 ?? null,
    pngBase64: png?.pngBase64 ?? null,
    pngSha256: png?.sha256 ?? null,
    width: png?.width ?? null,
    height: png?.height ?? null,
    provenance: scene.provenance,
    continuityState: scene.continuityState,
    shotEvidence: scene.shotEvidence,
    characterPipeline: {
      intendedSpecies: scene.characterPipeline?.intendedSpecies,
      meshSeedHex: scene.characterPipeline?.meshSeedHex,
      topology: scene.characterPipeline?.topology ?? "tesseract",
      meshSha256: mesh?.meshSha256,
      includesRigPolylines: mesh?.includesRigPolylines ?? false,
      stages: scene.characterPipeline?.stages,
    },
    statusTag: "partial" as const,
    visualKind: "energy_wire_mesh" as const,
    implemented: true,
  };
}
