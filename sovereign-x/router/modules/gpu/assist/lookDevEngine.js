/**
 * LookDevEngine — GPU-powered look-dev (assist-only steps).
 * Namespace: sx.router.module.gpu.assist.lookDevEngine
 * STATUS: **partial** — run() skeleton stubs; runFromImage wires FLUX ingest.
 * Final print remains outside (cpu.rt4d.print).
 */

import { extractFluxSceneSpec } from "./fluxSceneSpecExtractor.js";

export class LookDevEngine {
  /**
   * @param {{ route: (capabilityId: string, request?: object) => Promise<object> }} router
   */
  constructor(router) {
    this.router = router;
  }

  /**
   * Steps 1–3 assistOnly. Step 4 (human curation) and Step 5 (cpu.rt4d.print)
   * happen outside this module.
   */
  async run(request) {
    const concept = await this.router.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      assistOnly: true,
    });
    const enhanced = await this.router.route("gpu.compute.nvidia.cuda", {
      ...concept,
      assistOnly: true,
    });
    const hints = await this.router.route("gpu.inference.nvidia.tao", {
      ...enhanced,
      assistOnly: true,
    });
    return {
      assistOnly: true,
      nonAuthoritative: true,
      status: "declared",
      concept,
      enhanced,
      hints,
      nextStep: "human_curation_then_cpu.rt4d.print",
    };
  }

  /**
   * Look-dev from a shell / reference image via NIM FLUX ingest.
   * Always assistOnly — never print SoT.
   *
   * @param {object} request
   * @param {string} [request.imagePath]
   * @param {string} [request.imageBase64]
   * @param {string} [request.prompt]
   * @param {boolean} [request.dryRun]
   */
  async runFromImage(request = {}) {
    if (request.determinismRequired) {
      return this.router.route("cpu.rt4d.print", {
        ...request,
        capabilityClass: "print",
        backend: "cpu.rt4d.print",
      });
    }

    const concept = await this.router.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      mode: "lookdev-from-image",
      assistOnly: true,
    });

    const sceneSpec = extractFluxSceneSpec(concept, request);

    return {
      ok: concept?.ok !== false,
      assistOnly: true,
      nonAuthoritative: true,
      status: concept?.live ? "partial" : "declared",
      mode: "lookdev-from-image",
      concept,
      sceneSpec,
      nextStep: "human_curation_then_cpu.rt4d.print",
      bans: ["printSoT", "digitalPrinterEvidence"],
    };
  }
}

export default LookDevEngine;
