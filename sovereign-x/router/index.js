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

/** @type {object | null} */
let cachedRegistry = null;

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
    });
  }

  // Deterministic integrator prototype — assist-only; never print SoT
  if (resolved.capabilityId === "gpu.integrator.deterministic") {
    return integrateDeterministicAssist(request);
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
    backend: resolved.backend,
    capabilityClass: resolved.capabilityClass,
    authority: "assist",
    assistOnly: true,
    nonAuthoritative: true,
    status: "declared",
    skill: resolved.skill,
    message: `Assist stub for ${resolved.capabilityId} (no live GPU)`,
    task: { ...request, intent, assistOnly: true },
    provenanceKind: "assistProvenance",
    vendorOverride: request.vendorOverride ?? null,
  };
}

const routerApi = { route, resolveCapability, loadGpuSkillsRegistry };
export default routerApi;
