/**
 * CCC-ImageGen — provider selection + non-blocking fallback.
 *
 * Capability: image.gen.provider
 * Priority: local.gpu → opencl.gen → local.cpu → remote.gpu → remote.service
 *           → photoreal.remote.diffusion → photoreal.external.pbr
 *
 * STATUS: **partial**
 * - Selection + constitutional fallback log: implemented (tests)
 * - local.gpu: delegates to Lemonade SD adapter when reachable (hold until pixels)
 * - opencl.gen: first-class OpenCL CL-Gen still (image.gen.opencl) — prefer when Lemonade down
 * - local.cpu / remote.*: declared/partial stubs (no fake photoreal PNG)
 * - photoreal.remote.diffusion: declared/partial beauty stub (env URL)
 * - photoreal.external.pbr: local GLB export Held + Cycles when Blender available
 *   (else Cycles Blocked/deferred); never invent beauty PNG
 *
 * Layout vs beauty: engine3d.soft / opencl.gen = governed layout (engine3d outside
 * this cascade). Photoreal providers are optional beauty — see
 * docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md.
 *
 * Drive-G-1: missing local GPU must not BLOCK the capability when any
 * provider remains available. Engine3D soft-raster is out of scope.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectOpenClGenAvailable,
  generateClGenStill,
  CL_GEN_PROVIDER,
  CL_GEN_CAPABILITY,
} from "./openclGenProvider.js";
import {
  assessLocalExternalPbrPipeline,
  attemptLocalExternalPbrBeauty,
  detectBlenderAvailable,
} from "./externalPbrBeauty.js";

export const CAPABILITY_ID = "image.gen.provider";
export const CONTRACT_ID = "CCC-ImageGen";
export { CL_GEN_PROVIDER, CL_GEN_CAPABILITY };

export const IMAGE_GEN_PROVIDERS = Object.freeze([
  "local.gpu",
  "opencl.gen",
  "local.cpu",
  "remote.gpu",
  "remote.service",
  "photoreal.remote.diffusion",
  "photoreal.external.pbr",
]);

/** Optional beauty providers (not layout). See PHOTOREAL_PROVIDER_STRATEGY.md */
export const PHOTOREAL_PROVIDERS = Object.freeze([
  "photoreal.remote.diffusion",
  "photoreal.external.pbr",
]);

/** Layout providers used by mrs:governed-render (engine3d.soft outside CCC cascade). */
export const LAYOUT_PROVIDERS = Object.freeze([
  "engine3d.soft",
  "opencl.gen",
]);

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load machine CCC JSON (best-effort).
 * @returns {object|null}
 */
export function loadCccImageGenConfig() {
  const candidates = [
    join(__dirname, "../../../../governance/ccc-image-gen.json"),
    join(__dirname, "../../../../../sovereign-x/governance/ccc-image-gen.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isTruthyEnv(env, key) {
  const v = String(env?.[key] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Probe whether local Lemonade (GPU-oriented path) looks available.
 * Pure env/opts — no network unless opts.serverUp is omitted and opts.probeFn provided.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {object} [opts]
 * @returns {boolean}
 */
export function detectLocalGpuAvailable(env = process.env, opts = {}) {
  if (isTruthyEnv(env, "IMAGE_GEN_DISABLE_LOCAL_GPU")) return false;
  if (opts.localGpuAvailable === false) return false;
  if (opts.localGpuAvailable === true) return true;
  if (typeof opts.serverUp === "boolean") return opts.serverUp;
  // Default optimistic: local.gpu is a candidate unless disabled / forced down.
  // Live probes set localGpuAvailable / serverUp explicitly.
  if (isTruthyEnv(env, "IMAGE_GEN_FORCE_GPU_DOWN")) return false;
  return opts.assumeLocalGpuCandidate !== false;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} providerId
 * @param {object} [opts]
 * @returns {{ available: boolean, reason: string, endpoint?: string|null }}
 */
export function assessProviderAvailability(providerId, env = process.env, opts = {}) {
  const force = String(env.IMAGE_GEN_FORCE_PROVIDER || "").trim();
  if (force && force !== providerId) {
    return { available: false, reason: `forced provider is ${force}` };
  }

  switch (providerId) {
    case "local.gpu": {
      if (isTruthyEnv(env, "IMAGE_GEN_DISABLE_LOCAL_GPU")) {
        return { available: false, reason: "IMAGE_GEN_DISABLE_LOCAL_GPU" };
      }
      const gpuOk = detectLocalGpuAvailable(env, opts);
      return {
        available: gpuOk,
        reason: gpuOk
          ? "local.gpu candidate (Lemonade GPU path)"
          : "local GPU unavailable or forced down",
      };
    }
    case "opencl.gen":
    case CL_GEN_PROVIDER: {
      if (isTruthyEnv(env, "IMAGE_GEN_DISABLE_OPENCL")) {
        return { available: false, reason: "IMAGE_GEN_DISABLE_OPENCL" };
      }
      const oclOk = detectOpenClGenAvailable(env, opts);
      return {
        available: oclOk,
        reason: oclOk
          ? "opencl.gen candidate (CL-Gen OpenCL local GPU pixels)"
          : "opencl.gen unavailable (script missing or disabled)",
      };
    }
    case "local.cpu": {
      if (isTruthyEnv(env, "IMAGE_GEN_DISABLE_LOCAL_CPU")) {
        return { available: false, reason: "IMAGE_GEN_DISABLE_LOCAL_CPU" };
      }
      return {
        available: true,
        reason:
          "local.cpu configured (Lemonade CPU/Vulkan or lawful deferred stub)",
      };
    }
    case "remote.gpu": {
      const url = String(env.IMAGE_GEN_REMOTE_GPU_URL || "").trim();
      if (!url) {
        return { available: false, reason: "IMAGE_GEN_REMOTE_GPU_URL unset" };
      }
      return {
        available: true,
        reason: "remote.gpu URL configured",
        endpoint: url.replace(/\/$/, ""),
      };
    }
    case "remote.service": {
      const url = String(
        env.IMAGE_GEN_REMOTE_SERVICE_URL || env.LEMONADE_REMOTE_URL || "",
      ).trim();
      if (!url) {
        return {
          available: false,
          reason: "IMAGE_GEN_REMOTE_SERVICE_URL unset",
        };
      }
      return {
        available: true,
        reason: "remote.service URL configured",
        endpoint: url.replace(/\/$/, ""),
      };
    }
    case "photoreal.remote.diffusion": {
      if (isTruthyEnv(env, "PHOTOREAL_DISABLE_REMOTE_DIFFUSION")) {
        return {
          available: false,
          reason: "PHOTOREAL_DISABLE_REMOTE_DIFFUSION",
        };
      }
      const url = String(
        env.PHOTOREAL_REMOTE_DIFFUSION_URL ||
          env.IMAGE_GEN_PHOTOREAL_REMOTE_URL ||
          "",
      ).trim();
      if (!url) {
        return {
          available: false,
          reason: "PHOTOREAL_REMOTE_DIFFUSION_URL unset",
        };
      }
      return {
        available: true,
        reason: "photoreal.remote.diffusion URL configured (beauty stub)",
        endpoint: url.replace(/\/$/, ""),
        role: "beauty",
      };
    }
    case "photoreal.external.pbr": {
      if (isTruthyEnv(env, "PHOTOREAL_DISABLE_EXTERNAL_PBR")) {
        return {
          available: false,
          reason: "PHOTOREAL_DISABLE_EXTERNAL_PBR",
        };
      }
      const local = assessLocalExternalPbrPipeline(env, opts);
      if (local.pipelineReady) {
        return {
          available: true,
          reason: local.reason,
          endpoint: local.remoteUrl
            ? local.remoteUrl.replace(/\/$/, "")
            : local.specPath,
          role: "beauty",
          exportHeld: !!local.exportHeld,
          cyclesStatus: local.cyclesStatus,
          blenderAvailable: !!local.blenderAvailable,
        };
      }
      return {
        available: false,
        reason: local.reason,
      };
    }
    default:
      return { available: false, reason: `unknown provider ${providerId}` };
  }
}

/**
 * Select an optional photoreal beauty provider for governed-render `--beauty`.
 * Never invents pixels. Layout remains engine3d.soft / opencl.gen.
 *
 * @param {"none"|"remote"|"external-pbr"|string} mode
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object} [opts]
 * @returns {object}
 */
export function selectPhotorealBeautyProvider(mode = "none", env = process.env, opts = {}) {
  const normalized = String(mode || "none").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "off" || normalized === "layout") {
    return {
      requested: "none",
      selected: null,
      configured: false,
      deferred: false,
      pixelsProduced: false,
      role: "layout-only",
      reason: "beauty provider not requested; layout path only",
      photorealClaim: false,
      strategyRef: "docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md",
    };
  }

  let providerId;
  if (normalized === "remote" || normalized === "photoreal.remote.diffusion") {
    providerId = "photoreal.remote.diffusion";
  } else if (
    normalized === "external-pbr" ||
    normalized === "external_pbr" ||
    normalized === "pbr" ||
    normalized === "photoreal.external.pbr"
  ) {
    providerId = "photoreal.external.pbr";
  } else {
    return {
      requested: normalized,
      selected: null,
      configured: false,
      deferred: true,
      pixelsProduced: false,
      role: "beauty",
      reason: `unknown --beauty mode ${normalized}`,
      photorealClaim: false,
      code: "BEAUTY_MODE_UNKNOWN",
      strategyRef: "docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md",
    };
  }

  const assessment = assessProviderAvailability(providerId, env, opts);
  const isExternalPbr = providerId === "photoreal.external.pbr";
  const cyclesBlocked =
    isExternalPbr &&
    assessment.available &&
    assessment.cyclesStatus === "blocked";
  let reason;
  let code;
  if (!assessment.available) {
    reason = `${providerId} selected but not configured — deferred (${assessment.reason})`;
    code = "PHOTOREAL_BEAUTY_DEFERRED_UNCONFIGURED";
  } else if (cyclesBlocked) {
    reason = `${providerId} selected; GLB export Held, Cycles Blocked/deferred (no Blender) — no fake beauty PNG`;
    code = "EXTERNAL_PBR_EXPORT_HELD_CYCLES_BLOCKED";
  } else if (isExternalPbr) {
    reason = `${providerId} selected; local GLB→Cycles pipeline ready (beauty pixels only after Cycles run)`;
    code = "EXTERNAL_PBR_PIPELINE_READY";
  } else {
    reason = `${providerId} selected; execution stub until verified pixels (no fake beauty PNG)`;
    code = "PHOTOREAL_BEAUTY_STUB";
  }
  return {
    requested: normalized,
    selected: providerId,
    configured: !!assessment.available,
    deferred: !assessment.available || cyclesBlocked,
    pixelsProduced: false,
    role: "beauty",
    endpoint: assessment.endpoint || null,
    reason,
    photorealClaim: false,
    code,
    assessment,
    strategyRef: "docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md",
  };
}

/**
 * Attempt photoreal beauty provider — connect/export stub only.
 * Never writes a PNG labeled as photoreal beauty without real pixels.
 *
 * @param {"photoreal.remote.diffusion"|"photoreal.external.pbr"} providerId
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function attemptPhotorealBeautyProvider(providerId, opts = {}) {
  const env = opts.env || process.env;
  const assessment = assessProviderAvailability(providerId, env, opts);
  if (!assessment.available) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: providerId,
      role: "beauty",
      code: "PHOTOREAL_NOT_CONFIGURED",
      message: assessment.reason,
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
    };
  }

  // Local GLB → Cycles implementation (not stub) when export scripts are Held.
  if (providerId === "photoreal.external.pbr") {
    return attemptLocalExternalPbrBeauty({
      ...opts,
      env,
    });
  }

  // Optional health probe — still no beauty PNG claim.
  if (typeof opts.fetchFn === "function" && assessment.endpoint) {
    try {
      const res = await opts.fetchFn(assessment.endpoint, {
        method: "GET",
        timeoutMs: 5000,
      });
      const up =
        res && (res.ok === true || (res.status > 0 && res.status < 500));
      return {
        ok: false,
        status: "partial",
        deferred: true,
        pixelsProduced: false,
        imageGenProvider: providerId,
        role: "beauty",
        endpoint: assessment.endpoint,
        remoteReachable: !!up,
        code: "PHOTOREAL_BEAUTY_STUB",
        message: up
          ? `${providerId} reachable; beauty execution stub (no photoreal PNG claimed)`
          : `${providerId} endpoint probe failed; deferred stub only`,
        photorealClaim: false,
        assistOnly: true,
        nonAuthoritative: true,
      };
    } catch (err) {
      return {
        ok: false,
        status: "partial",
        deferred: true,
        pixelsProduced: false,
        imageGenProvider: providerId,
        role: "beauty",
        endpoint: assessment.endpoint,
        remoteReachable: false,
        code: "PHOTOREAL_BEAUTY_STUB",
        message: `${providerId} stub: ${err instanceof Error ? err.message : String(err)}`,
        photorealClaim: false,
        assistOnly: true,
        nonAuthoritative: true,
      };
    }
  }

  return {
    ok: false,
    status: "partial",
    deferred: true,
    pixelsProduced: false,
    imageGenProvider: providerId,
    role: "beauty",
    endpoint: assessment.endpoint,
    code: "PHOTOREAL_BEAUTY_STUB",
    message: `${providerId} configured at ${assessment.endpoint}; beauty stub (execution not claimed; no fake photoreal PNG)`,
    photorealClaim: false,
    assistOnly: true,
    nonAuthoritative: true,
  };
}

/**
 * Select first available provider by CCC priority.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object} [opts]
 * @returns {object}
 */
export function selectImageGenProvider(env = process.env, opts = {}) {
  const localGpuAvailable = detectLocalGpuAvailable(env, opts);
  /** @type {object[]} */
  const assessments = [];
  /** @type {string[]} */
  const available = [];

  for (const id of IMAGE_GEN_PROVIDERS) {
    const a = assessProviderAvailability(id, env, {
      ...opts,
      localGpuAvailable,
    });
    assessments.push({ id, ...a });
    if (a.available) available.push(id);
  }

  const selected = available[0] || null;
  // fallbackUsed: true when we did not land on a healthy local.gpu (Lemonade)
  // opencl.gen counts as fallback from Lemonade but is a first-class local GPU path.
  const fallbackUsedStrict =
    !!selected && !(selected === "local.gpu" && localGpuAvailable);

  let reason;
  if (!selected) {
    reason =
      "invariant_fail: zero image.gen providers configured/available";
  } else if (fallbackUsedStrict) {
    reason =
      opts.fallbackReason ||
      (localGpuAvailable === false
        ? `local.gpu unavailable; selected ${selected}`
        : `selected ${selected} (priority cascade)`);
  } else {
    reason = `selected ${selected}`;
  }

  const log = buildConstitutionalImageGenLog({
    imageGenProvider: selected,
    localGpuAvailable,
    fallbackUsed: fallbackUsedStrict,
    reason,
  });

  return {
    capability: CAPABILITY_ID,
    contractId: CONTRACT_ID,
    selected,
    available,
    assessments,
    localGpuAvailable,
    fallbackUsed: fallbackUsedStrict,
    invariantOk: available.length > 0,
    status: available.length > 0 ? "available" : "invariant_fail",
    reason,
    log,
    priority: [...IMAGE_GEN_PROVIDERS],
  };
}

/**
 * @param {object} fields
 * @returns {{ imageGenProvider: string|null, localGpuAvailable: boolean, fallbackUsed: boolean, reason: string }}
 */
export function buildConstitutionalImageGenLog(fields = {}) {
  return {
    imageGenProvider: fields.imageGenProvider ?? null,
    localGpuAvailable: !!fields.localGpuAvailable,
    fallbackUsed: !!fields.fallbackUsed,
    reason: String(fields.reason || ""),
  };
}

/**
 * Lawful local.cpu adapter — try optional Lemonade generateFn with CPU hint,
 * else return structured deferred result (no fake PNG).
 *
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function attemptLocalCpuProvider(opts = {}) {
  const env = opts.env || process.env;
  if (typeof opts.generateFn === "function") {
    const result = await opts.generateFn({
      ...opts,
      env: {
        ...env,
        LEMONADE_SDCPP_BACKEND: env.LEMONADE_SDCPP_BACKEND || "cpu",
        IMAGE_GEN_PROVIDER_HINT: "local.cpu",
      },
      providerHint: "local.cpu",
    });
    if (result?.ok && (result.outPath || result.pngBase64 || result.byteLength)) {
      return {
        ...result,
        imageGenProvider: "local.cpu",
        pixelsProduced: true,
        deferred: false,
      };
    }
    // Fall through to deferred if Lemonade still failed — do not invent PNG.
  }

  return {
    ok: false,
    status: "partial",
    deferred: true,
    pixelsProduced: false,
    imageGenProvider: "local.cpu",
    code: "PROVIDER_EXECUTION_DEFERRED",
    adapterId: "sx.adapter.image.gen.local.cpu",
    message:
      "local.cpu provider selected; Lemonade CPU/Vulkan execution deferred (no fake photoreal PNG claimed)",
    assistOnly: true,
    nonAuthoritative: true,
  };
}

/**
 * Remote connect stub — health check if fetch provided; never claim pixels.
 *
 * @param {"remote.gpu"|"remote.service"} providerId
 * @param {object} opts
 */
export async function attemptRemoteProvider(providerId, opts = {}) {
  const env = opts.env || process.env;
  const assessment = assessProviderAvailability(providerId, env, opts);
  if (!assessment.available) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: providerId,
      code: "REMOTE_NOT_CONFIGURED",
      message: assessment.reason,
    };
  }

  const endpoint = assessment.endpoint;
  if (typeof opts.fetchFn === "function") {
    try {
      const res = await opts.fetchFn(endpoint, { method: "GET", timeoutMs: 5000 });
      const up = res && (res.ok === true || (res.status > 0 && res.status < 500));
      return {
        ok: false,
        status: "partial",
        deferred: true,
        pixelsProduced: false,
        imageGenProvider: providerId,
        endpoint,
        remoteReachable: !!up,
        code: "REMOTE_CONNECT_STUB",
        message: up
          ? `${providerId} reachable at ${endpoint}; execution stub (no pixels claimed)`
          : `${providerId} endpoint probe failed; connect stub only`,
        assistOnly: true,
        nonAuthoritative: true,
      };
    } catch (err) {
      return {
        ok: false,
        status: "partial",
        deferred: true,
        pixelsProduced: false,
        imageGenProvider: providerId,
        endpoint,
        remoteReachable: false,
        code: "REMOTE_CONNECT_STUB",
        message: `${providerId} connect stub: ${err instanceof Error ? err.message : String(err)}`,
        assistOnly: true,
        nonAuthoritative: true,
      };
    }
  }

  return {
    ok: false,
    status: "partial",
    deferred: true,
    pixelsProduced: false,
    imageGenProvider: providerId,
    endpoint,
    code: "REMOTE_CONNECT_STUB",
    message: `${providerId} configured at ${endpoint}; connect stub (execution not claimed)`,
    assistOnly: true,
    nonAuthoritative: true,
  };
}

/**
 * Attempt opencl.gen (CL-Gen) — Amendment VII/VIII wrap then OpenCL still.
 *
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function attemptOpenClGenProvider(opts = {}) {
  const env = opts.env || process.env;
  if (!detectOpenClGenAvailable(env, opts)) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      code: "OPENCL_GEN_UNAVAILABLE",
      message: "opencl.gen unavailable (disabled or script missing)",
    };
  }

  if (typeof opts.openclGenGenerateFn === "function") {
    const result = await opts.openclGenGenerateFn({ ...opts, env });
    return {
      ...result,
      imageGenProvider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      pixelsProduced: !!(
        result?.ok &&
        (result.outPath || result.pngBase64 || result.pixelsProduced)
      ),
    };
  }

  const still = await generateClGenStill({
    ...opts,
    env,
    outPath: opts.openclGenOutPath || opts.clGenOutPath || opts.outPath,
    reportPath: opts.openclGenReportPath || opts.reportPath,
    width: opts.width,
    height: opts.height,
    intentId: opts.intentId,
    worldId: opts.worldId,
    engine3dContext: opts.engine3dContext,
    sceneJson: opts.sceneJson,
    skipConstitutional: opts.skipConstitutional,
  });

  return {
    ...still,
    imageGenProvider: CL_GEN_PROVIDER,
    capability: CL_GEN_CAPABILITY,
    pixelsProduced: !!still.pixelsProduced,
  };
}

/**
 * Attempt image gen with provider cascade. Never halts solely for missing GPU.
 *
 * @param {object} opts
 * @param {Function} [opts.localGpuGenerateFn] — Lemonade GPU generate
 * @param {Function} [opts.openclGenGenerateFn] — optional CL-Gen override (tests)
 * @param {Function} [opts.localCpuGenerateFn] — optional real CPU Lemonade call
 * @param {Function} [opts.fetchFn] — optional remote probe
 * @returns {Promise<object>}
 */
export async function attemptImageGenWithFallback(opts = {}) {
  const env = opts.env || process.env;
  const selection = selectImageGenProvider(env, {
    localGpuAvailable: opts.localGpuAvailable,
    serverUp: opts.serverUp,
    openclGenAvailable: opts.openclGenAvailable,
    fallbackReason: opts.fallbackReason,
  });

  /** @type {object[]} */
  const attempts = [];
  const auditLog = [selection.log];

  if (!selection.invariantOk) {
    return {
      ok: false,
      status: "invariant_fail",
      pixelsProduced: false,
      selection,
      attempts,
      constitutionalLog: selection.log,
      auditLog,
      code: "IMAGE_GEN_NO_PROVIDER",
      message: selection.reason,
      // Capability architecture: not "blocked on GPU"
      blockedOnGpu: false,
    };
  }

  const chain = selection.available;
  let last = null;

  for (const providerId of chain) {
    let result;
    if (providerId === "local.gpu") {
      if (typeof opts.localGpuGenerateFn !== "function") {
        result = {
          ok: false,
          status: "partial",
          pixelsProduced: false,
          imageGenProvider: "local.gpu",
          code: "LOCAL_GPU_GENERATE_UNBOUND",
          message: "local.gpu selected but generateFn not bound",
        };
      } else {
        result = await opts.localGpuGenerateFn({ ...opts, env, providerHint: "local.gpu" });
        result = {
          ...result,
          imageGenProvider: "local.gpu",
          pixelsProduced: !!(result?.ok && (result.outPath || result.pngBase64 || result.byteLength)),
        };
      }
    } else if (providerId === "opencl.gen" || providerId === CL_GEN_PROVIDER) {
      result = await attemptOpenClGenProvider({
        ...opts,
        env,
      });
    } else if (providerId === "local.cpu") {
      result = await attemptLocalCpuProvider({
        ...opts,
        env,
        generateFn: opts.localCpuGenerateFn || opts.localGpuGenerateFn,
      });
    } else if (providerId === "remote.gpu" || providerId === "remote.service") {
      result = await attemptRemoteProvider(providerId, opts);
    } else if (
      providerId === "photoreal.remote.diffusion" ||
      providerId === "photoreal.external.pbr"
    ) {
      result = await attemptPhotorealBeautyProvider(providerId, opts);
    } else {
      result = {
        ok: false,
        imageGenProvider: providerId,
        message: "unknown provider",
        pixelsProduced: false,
      };
    }

    attempts.push(result);
    last = result;

    const log = buildConstitutionalImageGenLog({
      imageGenProvider: providerId,
      localGpuAvailable: selection.localGpuAvailable,
      fallbackUsed: providerId !== "local.gpu" || !selection.localGpuAvailable,
      reason: result.pixelsProduced
        ? `pixels via ${providerId}`
        : result.message || `${providerId} did not produce pixels`,
    });
    auditLog.push(log);

    if (result.pixelsProduced) {
      return {
        ok: true,
        status: "partial",
        pixelsProduced: true,
        imageGenProvider: providerId,
        selection,
        attempts,
        constitutionalLog: log,
        auditLog,
        result,
        blockedOnGpu: false,
        fallbackUsed: log.fallbackUsed,
      };
    }

    // Fall through on local.gpu failure — do not halt (prefer opencl.gen next).
    if (providerId === "local.gpu") {
      const fallLog = buildConstitutionalImageGenLog({
        imageGenProvider: chain[1] || providerId,
        localGpuAvailable: false,
        fallbackUsed: true,
        reason: `local.gpu failed: ${result.code || result.message || "unknown"}; falling through (prefer opencl.gen when available)`,
      });
      auditLog.push(fallLog);
    }
  }

  const finalLog = buildConstitutionalImageGenLog({
    imageGenProvider: last?.imageGenProvider || selection.selected,
    localGpuAvailable: selection.localGpuAvailable,
    fallbackUsed: true,
    reason:
      "all configured providers failed to produce pixels; status degraded/partial (not architecture-blocked-on-GPU)",
  });
  auditLog.push(finalLog);

  return {
    ok: false,
    status: "degraded",
    pixelsProduced: false,
    imageGenProvider: last?.imageGenProvider || selection.selected,
    selection,
    attempts,
    constitutionalLog: finalLog,
    auditLog,
    result: last,
    blockedOnGpu: false,
    fallbackUsed: true,
    code: "IMAGE_GEN_DEGRADED_NO_PIXELS",
    message: finalLog.reason,
  };
}

export default {
  CAPABILITY_ID,
  CONTRACT_ID,
  IMAGE_GEN_PROVIDERS,
  PHOTOREAL_PROVIDERS,
  LAYOUT_PROVIDERS,
  CL_GEN_PROVIDER,
  CL_GEN_CAPABILITY,
  loadCccImageGenConfig,
  selectImageGenProvider,
  selectPhotorealBeautyProvider,
  assessProviderAvailability,
  detectLocalGpuAvailable,
  detectBlenderAvailable,
  buildConstitutionalImageGenLog,
  attemptLocalCpuProvider,
  attemptOpenClGenProvider,
  attemptRemoteProvider,
  attemptPhotorealBeautyProvider,
  attemptImageGenWithFallback,
};
