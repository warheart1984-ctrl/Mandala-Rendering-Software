import { createWebGPURenderer } from "./WebGPURenderer.js";

export async function discoverBrowserRenderAdapters(scope = globalThis) {
  const adapters = [{ id: "browser-canvas", backend: "canvas", available: true, deviceClass: "cpu", name: "Canvas 2D" }];
  const gpu = scope?.navigator?.gpu;
  if (!gpu?.requestAdapter) return adapters;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return adapters;
    const info = adapter.info ?? {};
    adapters.unshift({
      id: `webgpu-${info.vendor || "adapter"}-${info.device || "default"}`,
      backend: "webgpu",
      available: true,
      deviceClass: info.device?.toLowerCase().includes("integrated") ? "integrated-gpu" : "discrete-gpu",
      name: [info.vendor, info.architecture, info.device].filter(Boolean).join(" ") || "WebGPU adapter",
      features: [...(adapter.features ?? [])],
      powerPreference: "high-performance",
      runtimeHandle: adapter,
    });
  } catch {
    // Canvas remains the deterministic fallback when adapter discovery fails.
  }
  return adapters;
}

export async function routeSovereignXRenderer(options) {
  const adapters = options.adapters ?? await discoverBrowserRenderAdapters(options.scope ?? globalThis);
  if (typeof options.routeRender !== "function") throw new Error("routeRender bridge function is required");
  const decision = options.routeRender(options.router, options.request, options.runtime, options.limits, adapters);
  return { decision, adapters };
}

export async function createGovernedRenderer(decision, options = {}) {
  if (decision.action === "delay" || decision.backend === "delay") throw governedError("RENDER_DELAYED", decision);
  if (decision.action === "drop" || decision.backend === "drop") throw governedError("RENDER_DROPPED", decision);
  if (decision.backend === "canvas") {
    if (typeof options.canvasFactory !== "function") throw new Error("canvasFactory is required for Canvas routing");
    return options.canvasFactory(decision);
  }
  if (decision.backend === "webgpu") return createWebGPURenderer({ ...options.webgpu, adapter: decision.adapter?.runtimeHandle, adapterId: decision.adapter?.id });
  if (typeof options.nativeDispatch === "function") return options.nativeDispatch(decision);
  throw new Error(`Backend ${decision.backend} requires a nativeDispatch handler`);
}

export function createSovereignXNativeDispatch(options) {
  if (typeof options.createJob !== "function" || (typeof options.dispatchJob !== "function" && typeof options.daemon?.dispatch !== "function")) {
    throw new Error("createJob plus dispatchJob or a resident daemon are required");
  }
  return async (decision) => {
    const job = options.createJob({
      sceneId: options.sceneId,
      backend: decision.backend,
      adapterId: decision.adapter?.id,
      scenePath: options.scenePath,
      meshPath: options.meshPath,
      sharedFramePath: options.sharedFramePath,
      outputDir: options.outputDir,
      width: options.width,
      height: options.height,
      frames: options.frames,
      fps: options.fps,
      time: options.time,
      surfaceId: options.surfaceId,
      renderProfile: options.renderProfile,
      encoding: options.encoding,
      evidenceRefs: decision.evidenceRefs ?? [],
    });
    const receipt = options.daemon
      ? await options.daemon.dispatch(job, options.signal)
      : await options.dispatchJob(job, { ...options.worker, signal: options.signal });
    return { kind: "sovereignx-native-render", decision, job, receipt };
  };
}

function governedError(code, decision) {
  const error = new Error(decision.reason || code);
  error.code = code;
  error.decision = decision;
  return error;
}

// ── GPU Preview Dispatch (native Vulkan cross-process) ─────────────

export async function createSovereignXGPUPreviewDispatch(options = {}) {
  const { GPUPreviewClient, PreviewState } = await import("./GPUPreviewClient.js");
  const client = new GPUPreviewClient({
    instanceName: options.instanceName ?? "4d-renderer",
    previewExePath: options.previewExePath,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    doubleBufferSlots: options.doubleBufferSlots ?? 2,
    enableVsync: options.enableVsync ?? true,
    autoRestart: options.autoRestart ?? true,
  });

  client.on("error", (err) => {
    console.error("[SovereignX GPU Preview] Error:", err.message);
  });
  client.on("device-lost", () => {
    console.warn("[SovereignX GPU Preview] Device lost, attempting recovery...");
  });
  client.on("state-change", ({ from, to }) => {
    if (options.onStateChange) options.onStateChange(from, to);
  });

  const start = async () => {
    await client.start();
    return client;
  };

  const stop = async () => {
    await client.stop();
  };

  const resize = async (width, height) => {
    await client.resize(width, height);
  };

  return {
    backend: "vulkan-gpu-preview",
    client,
    start,
    stop,
    resize,
    getStats: () => client.getStats(),
  };
}
