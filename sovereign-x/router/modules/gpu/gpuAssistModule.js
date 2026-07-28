/**
 * GpuAssistModule — multi-vendor GPU assist routing.
 * Namespace: sx.router.module.gpu.assist
 * STATUS: **partial** — routes via router.route; FLUX image ingest wired;
 * no claim of live GPU without key/endpoint.
 *
 * Public API: handleLookDev / handleFluxImageIngest / handleSceneSpecAssist /
 * handleEmbeddings / dispatch
 */

export class GpuAssistModule {
  /**
   * @param {{ route: (capabilityId: string, request?: object) => Promise<object> }} router
   */
  constructor(router) {
    this.router = router;
  }

  /**
   * Mode-aware entry: lookdev-from-image → FLUX ingest; else lookdev.
   * @param {object} request
   */
  async dispatch(request = {}) {
    if (request.mode === "lookdev-from-image") {
      return this.handleFluxImageIngest(request);
    }
    if (request.mode === "scenespec" || request.mode === "vision_to_scenespec") {
      return this.handleSceneSpecAssist(request);
    }
    if (request.mode === "embeddings") {
      return this.handleEmbeddings(request);
    }
    return this.handleLookDev(request);
  }

  async handleLookDev(request) {
    if (request.determinismRequired) {
      return this.router.route("cpu.rt4d.print", {
        ...request,
        capabilityClass: "print",
        backend: "cpu.rt4d.print",
      });
    }
    if (request.mode === "lookdev-from-image") {
      return this.handleFluxImageIngest(request);
    }
    const vendor = request.vendorPreference || "neutral";
    if (vendor === "nvidia") {
      return this.router.route("gpu.gen.nvidia.nim_flux", {
        ...request,
        assistOnly: true,
      });
    }
    if (vendor === "amd") {
      return this.router.route("gpu.inference.amd.rocm", {
        ...request,
        assistOnly: true,
      });
    }
    return this.router.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      assistOnly: true,
    });
  }

  /**
   * NIM FLUX shell image ingest — assist only.
   * Routes through skill registry capability `gpu.gen.nvidia.nim_flux`.
   *
   * @param {object} request
   * @param {string} [request.imagePath]
   * @param {string} [request.imageBase64]
   * @param {string} [request.prompt]
   * @param {boolean} [request.dryRun]
   */
  async handleFluxImageIngest(request = {}) {
    if (request.determinismRequired) {
      return this.router.route("cpu.rt4d.print", {
        ...request,
        capabilityClass: "print",
        backend: "cpu.rt4d.print",
      });
    }
    return this.router.route("gpu.gen.nvidia.nim_flux", {
      ...request,
      mode: "lookdev-from-image",
      assistOnly: true,
    });
  }

  async handleSceneSpecAssist(request) {
    if (request.determinismRequired) {
      return this.router.route("cpu.rt4d.print", {
        ...request,
        capabilityClass: "print",
        backend: "cpu.rt4d.print",
      });
    }
    const vendor = request.vendorPreference || "neutral";
    if (vendor === "nvidia") {
      return this.router.route("gpu.inference.nvidia.tao", {
        ...request,
        assistOnly: true,
      });
    }
    if (vendor === "amd") {
      return this.router.route("gpu.inference.amd.rocm", {
        ...request,
        assistOnly: true,
      });
    }
    return this.router.route("gpu.inference.nvidia.tao", {
      ...request,
      assistOnly: true,
    });
  }

  async handleEmbeddings(request) {
    const vendor = request.vendorPreference || "nvidia";
    if (request.determinismRequired) {
      return this.router.route("cpu.rt4d.print", {
        ...request,
        capabilityClass: "print",
        backend: "cpu.rt4d.print",
      });
    }
    if (vendor === "nvidia" || vendor === "neutral") {
      return this.router.route("gpu.inference.nvidia.tao", {
        ...request,
        mode: "embeddings",
        assistOnly: true,
      });
    }
    return this.router.route("gpu.inference.amd.rocm", {
      ...request,
      mode: "embeddings",
      assistOnly: true,
    });
  }
}

export default GpuAssistModule;
