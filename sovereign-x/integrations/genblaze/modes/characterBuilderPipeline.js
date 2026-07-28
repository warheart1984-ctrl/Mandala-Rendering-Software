/**
 * Character builder pipeline (assist-only stages).
 *
 * STATUS: **partial** — wires FLUX lookdev-from-image + draft CharacterSpec.
 * Never print SoT. Final beauty remains cpu.rt4d.print after human curation.
 */

import { sceneToCharacterSpec } from "./sceneToCharacterSpec.js";

export const CHARACTER_BUILDER_STATUS = "partial";

/**
 * @param {object} request
 * @param {{ route: (id: string, req?: object) => Promise<object> }} deps
 */
export async function runCharacterBuilderPipeline(request = {}, deps) {
  if (!deps?.route) {
    throw new Error("characterBuilderPipeline requires deps.route");
  }

  if (request.determinismRequired === true) {
    return deps.route("cpu.rt4d.print", {
      ...request,
      capabilityClass: "print",
      backend: "cpu.rt4d.print",
    });
  }

  const stages = [];

  // Stage 1 — optional FLUX shell image / lookdev concept (assist)
  let concept = null;
  if (request.imagePath || request.imageBase64 || request.mode === "lookdev-from-image") {
    concept = await deps.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      mode: "lookdev-from-image",
      assistOnly: true,
    });
    stages.push({
      id: "flux_lookdev_from_image",
      ok: concept?.ok !== false,
      code: concept?.code ?? null,
      assistOnly: true,
    });
  } else {
    concept = await deps.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      mode: "lookdev",
      assistOnly: true,
    });
    stages.push({
      id: "flux_lookdev_stub",
      ok: concept?.ok !== false,
      code: concept?.code ?? "ASSIST_STUB",
      assistOnly: true,
    });
  }

  // Stage 2 — draft CharacterSpec (empty geometry / declared face hints)
  const characterSpec = sceneToCharacterSpec(
    request.sceneSpec || {
      id: request.intentId,
      kind: "SceneSpecification",
      prompt: request.prompt,
      objects: [],
    },
    {
      characterId: request.characterId || request.intentId,
      prompt: request.prompt,
      meshHint: request.meshHint,
      seed: request.seed,
    },
  );
  stages.push({
    id: "character_spec_draft",
    ok: true,
    assistOnly: true,
    status: characterSpec.status,
  });

  return {
    ok: true,
    assistOnly: true,
    nonAuthoritative: true,
    status: "declared",
    mode: "face-creation-assist",
    concept,
    characterSpec,
    stages,
    nextStep: "human_curation_then_cpu.rt4d.print",
    bans: ["printSoT", "digitalPrinterEvidence"],
  };
}

export default { runCharacterBuilderPipeline };
