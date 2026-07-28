/**
 * Draft SceneSpec extractor from FLUX image-ingest assist results.
 *
 * STATUS: **declared** / **skeleton** — heuristic draft only.
 * Does NOT claim NIM vision reconstruction or print-ready SceneSpec.
 * Human curation + cpu.rt4d.print remain required for print SoT.
 */

/**
 * @param {object} [fluxResult]
 * @param {object} [request]
 * @returns {object} draft SceneSpecification-shaped object (assist)
 */
export function extractFluxSceneSpec(fluxResult = {}, request = {}) {
  const intentId =
    request.intentId ||
    request.id ||
    `flux-lookdev-${String(request.seed ?? "0")}`;
  const prompt =
    request.prompt ||
    fluxResult.prompt ||
    "lookdev-from-image assist draft";

  return {
    schemaVersion: "1.0.0",
    kind: "SceneSpecification",
    id: intentId,
    status: "declared",
    assistOnly: true,
    nonAuthoritative: true,
    source: "flux-lookdev-from-image",
    notes:
      "Draft SceneSpec from FLUX shell image ingest — not geometric reconstruction; not print SoT",
    prompt,
    flux: {
      code: fluxResult.code ?? null,
      live: Boolean(fluxResult.live),
      imageIngested: Boolean(fluxResult.imageIngested),
      imageSource: fluxResult.imageSource ?? null,
      endpoint: fluxResult.endpoint ?? null,
    },
    // Empty geometry — expand / human authoring required before print
    objects: [],
    materials: [],
    lights: [],
    cameras: [],
    output: {
      width: request.width ?? 512,
      height: request.height ?? 512,
    },
  };
}

export default { extractFluxSceneSpec };
