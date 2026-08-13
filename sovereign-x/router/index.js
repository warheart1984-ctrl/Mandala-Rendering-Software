/**
 * Sovereign X Router — capability resolver.
 *
 * STATUS: **partial** — registry resolve + assist stubs; no live GPU invoke.
 * Drive-G-1: GPU routes return assistOnly; print SoT is cpu.rt4d.print only.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate as validateDispatchContract } from "./contracts/gpuDispatchContract.js";
import { checkGpuPrintSafeguard } from "./contracts/gpuPrintSafeguard.js";
import { integrateDeterministicAssist } from "./modules/gpu/integrator/deterministicGpuIntegrator.js";
import {
  integrateLegacyEfficientBeauty,
  integrateLegacyEfficientBeautyAsync,
} from "./modules/gpu/amd/legacyEfficientBeauty.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireJson = createRequire(import.meta.url);
export const GPU_SKILLS_REGISTRY_PATH = join(
  __dirname,
  "registry",
  "gpuSkillsRegistry.json",
);

/** In-repo skill SoT (CI / Windows without home install). */
export const IN_REPO_FLUX_GENERATE = join(
  __dirname,
  "..",
  "skills",
  "nvidia-gpu-assist",
  "flux_generate.js",
);

/**
 * Resolve flux_generate.js from registry skill dir or in-repo fallback.
 * @param {string | null | undefined} skillPath
 * @returns {string}
 */
export function resolveFluxGenerateModule(skillPath) {
  const candidates = [];
  if (skillPath) {
    let root = String(skillPath);
    if (root.startsWith("~/") || root === "~") {
      root = resolve(homedir(), root.slice(2) || ".");
    }
    candidates.push(join(root, "flux_generate.js"));
  }
  candidates.push(IN_REPO_FLUX_GENERATE);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return IN_REPO_FLUX_GENERATE;
}

/**
 * Classify workload based on MemoryTelemetry observations.
 * Returns a workload class that informs placement decisions.
 *
 * Workload classes:
 *   "compute-heavy"   - device utilization high, memory pressure low
 *   "memory-heavy"    - working set large, locality low, copying dominant
 *   "latency-sensitive" - allocation/copy latency low, minimal waiting
 *   "bandwidth-heavy" - copy bandwidth demand high, large transfers
 *   "balanced"        - mixed patterns, no single dominant characteristic
 */
function classifyWorkload(memoryTelemetry) {
  if (!memoryTelemetry) return "balanced";

  const { allocationLatencyNs, copyBandwidthGBps, copyLatencyNs,
          memoryCapacityBytes, workingSetBytes, localityScore,
          deviceUtilizationPercent, queueDepth } = memoryTelemetry;

  // Compute-heavy: GPU is actively utilized, memory copies are not the bottleneck
  const computeHeavy = deviceUtilizationPercent > 70 &&
    (copyBandwidthGBps < 10 || copyLatencyNs > 100000);

  // Memory-heavy: working set is significant portion of capacity, low locality
  const memoryCapacityRatio = memoryCapacityBytes > 0
    ? workingSetBytes / memoryCapacityBytes
    : 0;
  const memoryHeavy = memoryCapacityRatio > 0.3 && localityScore < 0.5;

  // Latency-sensitive: allocation and copy latencies are minimal
  const latencySensitive = allocationLatencyNs < 10000 &&
    copyLatencyNs < 50000;

  // Bandwidth-heavy: copy bandwidth is a significant demand
  const bandwidthHeavy = copyBandwidthGBps > 20 && queueDepth > 0;

  // Determine dominant characteristic
  const classifications = [
    { name: "compute-heavy", predicate: computeHeavy },
    { name: "memory-heavy", predicate: memoryHeavy },
    { name: "latency-sensitive", predicate: latencySensitive },
    { name: "bandwidth-heavy", predicate: bandwidthHeavy },
  ];

  // Return the first matching classification, or "balanced"
  for (const { name } of classifications) {
    if (name === "compute-heavy" && computeHeavy) return "compute-heavy";
    if (name === "memory-heavy" && memoryHeavy) return "memory-heavy";
    if (name === "latency-sensitive" && latencySensitive) return "latency-sensitive";
    if (name === "bandwidth-heavy" && bandwidthHeavy) return "bandwidth-heavy";
  }

  return "balanced";
}

/**
 * Recommend placement based on workload class and available substrates.
 * Returns a placement recommendation: "cpu", "ram", or "gpu".
 *
 * Placement logic:
 *   - "compute-heavy" + low memory pressure  → gpu (accelerate computation)
 *   - "memory-heavy" + low locality         → ram (keep data on CPU side)
 *   - "latency-sensitive" + data on host    → cpu/ram (minimize transfers)
 *   - "bandwidth-heavy" + data on device    → gpu (avoid host↔device transfers)
 *   - default                                   → cpu (safe baseline)
 */
function recommendPlacement(workloadClass, memoryTelemetry, currentBackend) {
  if (workloadClass === "compute-heavy") {
    // Compute-intensive work benefits from GPU acceleration
    return "gpu";
  }

  if (workloadClass === "memory-heavy") {
    // Large working set with poor locality - keep on CPU RAM to avoid VRAM↔RAM transfers
    return "ram";
  }

  if (workloadClass === "latency-sensitive") {
    // Minimize data movement - prefer where data already resides
    // If data is already on device (currentBackend is gpu), stay there;
    // otherwise prefer CPU RAM to avoid copy latency
    if (currentBackend === "gpu") return "gpu";
    return "cpu";
  }

  if (workloadClass === "bandwidth-heavy") {
    // High bandwidth demand - route data to where it needs to be
    // If data already on device, keep there; otherwise move to GPU
    if (currentBackend === "gpu") return "gpu";
    return "ram";  // Stage through RAM first
  }

  // balanced or unknown - default to CPU
  return "cpu";
}

export function loadGpuSkillsRegistry(options = {}) {
  if (!options.reload && cachedRegistry) return cachedRegistry;
  cachedRegistry = requireJson(GPU_SKILLS_REGISTRY_PATH);
  return cachedRegistry;
}

export function clearGpuSkillsRegistryCache() {
  cachedRegistry = null;
}

/**
 * Resolve capability → skill path + meta.
 * @param {string} capabilityId
 */
export function resolveCapability(capabilityId) {
  const reg = loadGpuSkillsRegistry();
  if (capabilityId === "cpu.rt4d.print" || capabilityId === reg.authoritativePrint) {
    return {
      ok: true,
      capabilityId: "cpu.rt4d.print",
      skill: null,
      authority: "authoritative",
      capabilityClass: "print",
      vendor: "cpu",
      backend: "cpu",
    };
  }
  const skill = reg.skills?.[capabilityId];
  const meta = reg.capabilityMeta?.[capabilityId];
  if (!skill || !meta) {
    return {
      ok: false,
      capabilityId,
      message: `Unknown capability '${capabilityId}'`,
    };
  }
  if (capabilityId.startsWith("gpu.") && meta.authority !== "assist") {
    return {
      ok: false,
      capabilityId,
      message: "GPU capabilities must be assist-only",
    };
  }
  return {
    ok: true,
    capabilityId,
    skill,
    authority: meta.authority,
    capabilityClass: meta.capabilityClass,
    vendor: meta.vendor,
    backend: meta.vendor,
  };
}

/**
 * Invoke skill stub (in-process assistOnly payload — no live GPU).
 * Denies GPU print SoT.
 *
 * @param {string} capabilityId
 * @param {object} request
 */
export async function route(capabilityId, request = {}) {
  // Extract memory telemetry from request (optional, for Phase 3 router integration)
  const memoryTelemetry = request.memoryTelemetry;

  // Classify workload based on observed telemetry
  const workloadClass = classifyWorkload(memoryTelemetry);

  // Recommend placement substrate based on workload class
  const recommendedPlacement = recommendPlacement(
    workloadClass,
    memoryTelemetry,
    request.backend
  );

  // Constitutional safeguard — BEFORE dispatch (GPU × print / determinism)
  const safeguard = checkGpuPrintSafeguard(capabilityId, request);
  if (safeguard) {
    return safeguard;
  }

  if (
    request.asPrintSoT === true ||
    (request.authority === "authoritative" &&
      String(capabilityId).startsWith("gpu."))
  ) {
    return {
      ok: false,
      assistOnly: true,
      nonAuthoritative: true,
      code: "GPU_PRINT_SOT_DENIED",
      message:
        "GPU capabilities cannot be print SoT — only cpu.rt4d.print is authoritative",
      capabilityId,
    };
  }

  const resolved = resolveCapability(capabilityId);
  if (!resolved.ok) {
    return {
      ok: false,
      ...resolved,
      assistOnly: true,
      nonAuthoritative: true,
    };
  }

  // ... rest of the function continues below

  if (resolved.capabilityId === "cpu.rt4d.print") {
    const contractReq = {
      ...request,
      backend: "cpu.rt4d.print",
      capabilityClass: "print",
      determinismRequired: request.determinismRequired ?? true,
    };
    try {
      validateDispatchContract(contractReq);
    } catch (err) {
      return {
        ok: false,
        code: "CONTRACT_INVALID",
        message: err instanceof Error ? err.message : String(err),
        capabilityId: "cpu.rt4d.print",
      };
    }
    return {
      ok: true,
      capabilityId: "cpu.rt4d.print",
      backend: "cpu",
      capabilityClass: "print",
      authority: "authoritative",
      assistOnly: false,
      nonAuthoritative: false,
      status: "declared",
      message:
        "Hand-off token for PathTracer4D / Digital Printer SoT (no printer invoke in router)",
      request,
      provenanceKind: "printProvenance",
      workloadClass,
      recommendedPlacement,
    };
  }

  // DeterminismRequired override: GPU assist must not satisfy deterministic intents.
  // Redirect to cpu.rt4d.print (same rule as GpuAssistModule handlers).
  if (
    request.determinismRequired === true &&
    String(resolved.capabilityId).startsWith("gpu.")
  ) {
    return route("cpu.rt4d.print", {
      ...request,
      capabilityClass: "print",
      backend: "cpu.rt4d.print",
      determinismRequired: true,
      redirectedFrom: resolved.capabilityId,
      ...telemetryIntegration,
    });
  }

  // Deterministic integrator prototype — assist-only; never print SoT
  if (resolved.capabilityId === "gpu.integrator.deterministic") {
    return integrateDeterministicAssist(request);
  }

  // Legacy AMD 3-layer efficient beauty — sparse + mem estimate + intent gate
  // Optional still: Lemonade SD adapter and/or OpenCL Tonga stand-in
  if (resolved.capabilityId === "gpu.compute.amd.legacy_efficient") {
    const wantStill =
      request.requestStill === true ||
      (request.beautyProvider &&
        String(request.beautyProvider).toLowerCase() !== "none");
    if (wantStill) {
      return integrateLegacyEfficientBeautyAsync({ ...request, workloadClass, recommendedPlacement });
    }
    return integrateLegacyEfficientBeauty({ ...request, workloadClass, recommendedPlacement });
  }

  // NIM FLUX image ingest / lookdev-from-image — invoke skill module when present
  if (
    resolved.capabilityId === "gpu.gen.nvidia.nim_flux" &&
    (request.mode === "lookdev-from-image" ||
      request.imagePath ||
      request.imageBase64)
  ) {
    try {
      const modPath = resolveFluxGenerateModule(resolved.skill);
      const mod = await import(pathToFileURL(modPath).href);
      const fluxGenerate = mod.fluxGenerate || mod.default?.fluxGenerate;
      if (typeof fluxGenerate !== "function") {
        return {
          ok: false,
          assistOnly: true,
          nonAuthoritative: true,
          code: "FLUX_SKILL_MISSING_EXPORT",
          message: `flux_generate.js missing fluxGenerate export at ${modPath}`,
          capabilityId: resolved.capabilityId,
          skill: resolved.skill,
        };
      }
      const result = await fluxGenerate({
        ...request,
        mode: request.mode || "lookdev-from-image",
        assistOnly: true,
        workloadClass,
        recommendedPlacement,
      });
      return {
        ...result,
        assistOnly: true,
        nonAuthoritative: true,
        capabilityId: "gpu.gen.nvidia.nim_flux",
        skill: resolved.skill,
        skillModule: modPath,
        authority: "assist",
        capabilityClass: resolved.capabilityClass,
        backend: resolved.backend,
        provenanceKind: "assistProvenance",
        ...telemetryIntegration,
      };
    } catch (err) {
      return {
        ok: false,
        assistOnly: true,
        nonAuthoritative: true,
        code: "FLUX_SKILL_LOAD_ERROR",
        message: err instanceof Error ? err.message : String(err),
        capabilityId: resolved.capabilityId,
        skill: resolved.skill,
      };
    }
  }

  // GPU assist stub — never claims live GPU
  const intent =
    request.intent ||
    request.mode ||
    (resolved.capabilityClass === "gen"
      ? "lookdev"
      : resolved.capabilityClass === "compute"
        ? "gpu_denoise"
        : "vision_to_scenespec");

  return {
    ok: true,
    capabilityId: resolved.capabilityId,
    backend: recommendedPlacement,  // Use telemetry-informed placement
    capabilityClass: resolved.capabilityClass,
    authority: "assist",
    assistOnly: true,
    nonAuthoritative: true,
    status: "declared",
    skill: resolved.skill,
    message: `Assist stub for ${resolved.capabilityId} (no live GPU)`,
    task: { ...request, intent, assistOnly: true, workloadClass, recommendedPlacement },
    provenanceKind: "assistProvenance",
    vendorOverride: request.vendorOverride ?? null,
    ...telemetryIntegration,
  };
}

const routerApi = { route, resolveCapability, loadGpuSkillsRegistry };
export default routerApi;
