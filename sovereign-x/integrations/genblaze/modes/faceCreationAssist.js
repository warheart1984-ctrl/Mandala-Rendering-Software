/**
 * Genblaze Face Creation Assist — Sovereign X integration mode.
 *
 * STATUS: **partial** — assist pipeline + draft CharacterSpec; no live print.
 * Namespace: sx.integration.genblaze.faceCreationAssist
 *
 * Drive-G-1: assistOnly always. Never Digital Printer SoT.
 * Does not import StoryForge. Print hand-off is cpu.rt4d.print only.
 */

import { route as defaultRoute } from "../../../router/index.js";
import { runCharacterBuilderPipeline } from "./characterBuilderPipeline.js";
import { sceneToCharacterSpec } from "./sceneToCharacterSpec.js";

export const FACE_CREATION_ASSIST_STATUS = "partial";

/**
 * @param {object} request
 * @param {{ route?: (id: string, req?: object) => Promise<object> }} [deps]
 */
export async function runFaceCreationAssist(request = {}, deps = {}) {
  const routeFn = deps.route || defaultRoute;

  if (request.asPrintSoT === true || request.authority === "authoritative") {
    return {
      ok: false,
      assistOnly: true,
      nonAuthoritative: true,
      code: "FACE_CREATION_PRINT_SOT_DENIED",
      message:
        "Face Creation Assist cannot be print SoT — use cpu.rt4d.print after human curation",
    };
  }

  const pipeline = await runCharacterBuilderPipeline(
    {
      ...request,
      mode: request.mode || "face-creation-assist",
      assistOnly: true,
    },
    { route: routeFn },
  );

  return {
    ...pipeline,
    capabilityId: "genblaze.face_creation_assist",
    assistOnly: true,
    nonAuthoritative: true,
    provenanceKind: "assistProvenance",
  };
}

export { sceneToCharacterSpec, runCharacterBuilderPipeline };
export default {
  runFaceCreationAssist,
  sceneToCharacterSpec,
  runCharacterBuilderPipeline,
};
