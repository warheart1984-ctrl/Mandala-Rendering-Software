/**
 * photoreal.external.pbr — local GLB export + optional Blender Cycles beauty.
 *
 * STATUS: **partial**
 * - GLB export (SceneSpecification → binary GLB): Held / verified when scripts run
 * - Cycles beauty: only when Blender is on PATH (or BLENDER_PATH); else Blocked/deferred
 * - Never invent a photoreal PNG (Drive-G-1)
 *
 * Layout remains engine3d.soft / RT4D-governed; this module is beauty-only.
 *
 * @see docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root: sovereign-x/router/modules/gpu/amd → ../../../../../ */
export function resolveRepoRoot(fromFile = import.meta.url) {
  return resolve(dirname(fileURLToPath(fromFile)), "../../../../../");
}

export function resolveRendererCoreRoot(repoRoot = resolveRepoRoot()) {
  return join(repoRoot, "mrs", "packages", "renderer-core");
}

export function defaultSceneSpecPath(repoRoot = resolveRepoRoot()) {
  return join(
    resolveRendererCoreRoot(repoRoot),
    "examples",
    "scene-spec-tesseract.json",
  );
}

export function glbExportScriptPath(repoRoot = resolveRepoRoot()) {
  return join(resolveRendererCoreRoot(repoRoot), "scripts", "render-glb.mjs");
}

export function cyclesPythonScriptPath(repoRoot = resolveRepoRoot()) {
  return join(
    resolveRendererCoreRoot(repoRoot),
    "scripts",
    "render-glb-cycles.py",
  );
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ available: boolean, blenderBin: string|null, reason: string }}
 */
export function detectBlenderAvailable(env = process.env) {
  const explicit = String(env.BLENDER_PATH || "").trim();
  if (explicit) {
    if (existsSync(explicit)) {
      return {
        available: true,
        blenderBin: explicit,
        reason: "BLENDER_PATH set and exists",
      };
    }
    return {
      available: false,
      blenderBin: null,
      reason: `BLENDER_PATH set but missing: ${explicit}`,
    };
  }

  const whichCmd = process.platform === "win32" ? "where.exe" : "which";
  const r = spawnSync(whichCmd, ["blender"], {
    encoding: "utf8",
    shell: false,
  });
  const out = String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (r.status === 0 && out && existsSync(out)) {
    return {
      available: true,
      blenderBin: out,
      reason: "blender found on PATH",
    };
  }
  return {
    available: false,
    blenderBin: null,
    reason: "blender not on PATH (Cycles beauty deferred)",
  };
}

/**
 * Local external-PBR pipeline is Held when export scripts + default/spec exist.
 * Cycles may still be Blocked without Blender.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object} [opts]
 */
export function assessLocalExternalPbrPipeline(env = process.env, opts = {}) {
  const repoRoot = opts.repoRoot || resolveRepoRoot();
  const exportScript = glbExportScriptPath(repoRoot);
  const cyclesPy = cyclesPythonScriptPath(repoRoot);
  const specPath = resolve(
    String(opts.specPath || env.PHOTOREAL_EXTERNAL_PBR_SPEC || "").trim() ||
      defaultSceneSpecPath(repoRoot),
  );
  const blender = detectBlenderAvailable(env);
  const url = String(
    env.PHOTOREAL_EXTERNAL_PBR_URL || env.PHOTOREAL_EXTERNAL_PBR_EXPORT || "",
  ).trim();

  const exportHeld =
    existsSync(exportScript) && existsSync(cyclesPy) && existsSync(specPath);

  return {
    exportHeld,
    exportScript,
    cyclesPy,
    specPath,
    blenderAvailable: blender.available,
    blenderBin: blender.blenderBin,
    blenderReason: blender.reason,
    remoteUrl: url || null,
    pipelineReady: exportHeld || !!url,
    cyclesStatus: blender.available ? "ready" : "blocked",
    reason: exportHeld
      ? blender.available
        ? "local GLB→Cycles pipeline ready (export Held, Cycles ready)"
        : "local GLB export Held; Cycles Blocked (blender not available)"
      : url
        ? "PHOTOREAL_EXTERNAL_PBR_URL configured (remote/export endpoint)"
        : "external PBR scripts/spec missing and URL unset",
  };
}

/**
 * Run SceneSpecification → GLB via render-glb.mjs.
 *
 * @param {object} opts
 * @returns {{ ok: boolean, glbPath?: string, provenancePath?: string, byteLength?: number, sha256?: string, provenance?: object, code?: string, message?: string }}
 */
export function runGlbExport(opts = {}) {
  const repoRoot = opts.repoRoot || resolveRepoRoot();
  const core = resolveRendererCoreRoot(repoRoot);
  const script = glbExportScriptPath(repoRoot);
  const specPath = resolve(
    opts.specPath || defaultSceneSpecPath(repoRoot),
  );
  const outDir = opts.outDir || join(repoRoot, "tmp", "external-pbr");
  mkdirSync(outDir, { recursive: true });
  const glbPath = opts.glbPath || join(outDir, "scene.glb");
  const provenancePath =
    opts.provenancePath || join(outDir, "glb-provenance.json");

  if (!existsSync(script)) {
    return {
      ok: false,
      code: "GLB_EXPORT_SCRIPT_MISSING",
      message: `Missing ${script}`,
    };
  }
  if (!existsSync(specPath)) {
    return {
      ok: false,
      code: "GLB_SPEC_MISSING",
      message: `Missing scene spec ${specPath}`,
    };
  }

  const r = spawnSync(
    process.execPath,
    [
      script,
      "--spec",
      specPath,
      "--output",
      glbPath,
      "--provenance",
      provenancePath,
    ],
    {
      cwd: core,
      encoding: "utf8",
      shell: false,
      env: opts.env || process.env,
    },
  );

  if (r.status !== 0 || !existsSync(glbPath)) {
    return {
      ok: false,
      code: "GLB_EXPORT_FAILED",
      message: String(r.stderr || r.stdout || `exit ${r.status}`).slice(0, 800),
      status: r.status,
    };
  }

  const buf = readFileSync(glbPath);
  let provenance = null;
  if (existsSync(provenancePath)) {
    try {
      provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    } catch {
      provenance = null;
    }
  }

  return {
    ok: true,
    glbPath,
    provenancePath,
    byteLength: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
    provenance,
    code: "GLB_EXPORT_HELD",
    message: `GLB export Held (${buf.byteLength} bytes)`,
  };
}

/**
 * Run Blender Cycles on an exported GLB.
 *
 * @param {object} opts
 */
export function runCyclesBeauty(opts = {}) {
  const env = opts.env || process.env;
  const repoRoot = opts.repoRoot || resolveRepoRoot();
  const blender = detectBlenderAvailable(env);
  if (!blender.available || !blender.blenderBin) {
    return {
      ok: false,
      deferred: true,
      pixelsProduced: false,
      code: "CYCLES_BLOCKED_NO_BLENDER",
      message: blender.reason,
      cyclesStatus: "blocked",
    };
  }

  const glbPath = opts.glbPath;
  if (!glbPath || !existsSync(glbPath)) {
    return {
      ok: false,
      deferred: true,
      pixelsProduced: false,
      code: "CYCLES_MISSING_GLB",
      message: `GLB not found: ${glbPath || "(none)"}`,
      cyclesStatus: "blocked",
    };
  }

  const outDir = opts.outDir || dirname(glbPath);
  mkdirSync(outDir, { recursive: true });
  const outPath = opts.outPath || join(outDir, "beauty-cycles.png");
  const samples = Math.max(
    1,
    Number(opts.samples ?? env.PHOTOREAL_CYCLES_SAMPLES ?? 64) || 64,
  );
  const width = Math.max(1, Number(opts.width ?? 512) || 512);
  const height = Math.max(1, Number(opts.height ?? 512) || 512);
  const py = cyclesPythonScriptPath(repoRoot);

  if (!existsSync(py)) {
    return {
      ok: false,
      deferred: true,
      pixelsProduced: false,
      code: "CYCLES_SCRIPT_MISSING",
      message: `Missing ${py}`,
      cyclesStatus: "blocked",
    };
  }

  const r = spawnSync(
    blender.blenderBin,
    ["-b", "-P", py, "--", glbPath, outPath, String(samples), String(width), String(height)],
    {
      encoding: "utf8",
      shell: false,
      env,
      timeout: Number(opts.timeoutMs ?? 600_000) || 600_000,
    },
  );

  if (r.status !== 0 || !existsSync(outPath)) {
    return {
      ok: false,
      deferred: true,
      pixelsProduced: false,
      code: "CYCLES_RENDER_FAILED",
      message: String(r.stderr || r.stdout || `exit ${r.status}`).slice(0, 800),
      cyclesStatus: "failed",
      blenderBin: blender.blenderBin,
    };
  }

  const buf = readFileSync(outPath);
  return {
    ok: true,
    deferred: false,
    pixelsProduced: true,
    outPath,
    byteLength: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
    samples,
    width,
    height,
    blenderBin: blender.blenderBin,
    code: "CYCLES_BEAUTY_PIXELS",
    message: `Cycles beauty PNG written (${buf.byteLength} bytes)`,
    cyclesStatus: "complete",
  };
}

/**
 * Full local external-PBR attempt: export GLB, then Cycles if Blender available.
 * Never invents beauty pixels.
 *
 * @param {object} opts
 */
export async function attemptLocalExternalPbrBeauty(opts = {}) {
  const env = opts.env || process.env;
  const repoRoot = opts.repoRoot || resolveRepoRoot();
  const assessment = assessLocalExternalPbrPipeline(env, {
    repoRoot,
    specPath: opts.specPath,
  });

  if (!assessment.exportHeld && !assessment.remoteUrl) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: "photoreal.external.pbr",
      role: "beauty",
      code: "PHOTOREAL_NOT_CONFIGURED",
      message: assessment.reason,
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
      assessment,
    };
  }

  // Remote URL without local scripts → connect stub only (no fake PNG).
  if (!assessment.exportHeld && assessment.remoteUrl) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: "photoreal.external.pbr",
      role: "beauty",
      endpoint: assessment.remoteUrl.replace(/\/$/, ""),
      code: "PHOTOREAL_BEAUTY_STUB",
      message: `photoreal.external.pbr URL configured at ${assessment.remoteUrl}; local export not Held — beauty stub (no fake photoreal PNG)`,
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
      assessment,
    };
  }

  const outDir =
    opts.outDir || join(repoRoot, "tmp", "external-pbr", "run");
  mkdirSync(outDir, { recursive: true });

  const exportResult = runGlbExport({
    repoRoot,
    env,
    outDir,
    specPath: assessment.specPath,
    glbPath: join(outDir, "scene.glb"),
    provenancePath: join(outDir, "glb-provenance.json"),
  });

  writeFileSync(
    join(outDir, "external-pbr-export.json"),
    JSON.stringify(
      {
        schema: "mrs.photoreal.external.pbr.export.v1",
        status: exportResult.ok ? "held" : "failed",
        ...exportResult,
        assessment: {
          cyclesStatus: assessment.cyclesStatus,
          blenderAvailable: assessment.blenderAvailable,
          blenderReason: assessment.blenderReason,
          specPath: assessment.specPath,
        },
      },
      null,
      2,
    ),
  );

  if (!exportResult.ok) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: "photoreal.external.pbr",
      role: "beauty",
      code: exportResult.code || "GLB_EXPORT_FAILED",
      message: exportResult.message,
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
      export: exportResult,
      assessment,
      outDir,
    };
  }

  if (!assessment.blenderAvailable) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: "photoreal.external.pbr",
      role: "beauty",
      code: "CYCLES_BLOCKED_NO_BLENDER",
      message:
        "GLB export Held; Cycles beauty Blocked/deferred (Blender not on PATH). Install Blender or set BLENDER_PATH.",
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
      export: {
        status: "held",
        glbPath: exportResult.glbPath,
        byteLength: exportResult.byteLength,
        sha256: exportResult.sha256,
        provenance: exportResult.provenance,
      },
      cycles: {
        status: "blocked",
        reason: assessment.blenderReason,
      },
      assessment,
      outDir,
      glbPath: exportResult.glbPath,
    };
  }

  const cycles = runCyclesBeauty({
    repoRoot,
    env,
    outDir,
    glbPath: exportResult.glbPath,
    outPath: join(outDir, "beauty-cycles.png"),
    width: opts.width,
    height: opts.height,
    samples: opts.samples,
    timeoutMs: opts.timeoutMs,
  });

  if (!cycles.pixelsProduced) {
    return {
      ok: false,
      status: "partial",
      deferred: true,
      pixelsProduced: false,
      imageGenProvider: "photoreal.external.pbr",
      role: "beauty",
      code: cycles.code || "CYCLES_FAILED",
      message: cycles.message,
      photorealClaim: false,
      assistOnly: true,
      nonAuthoritative: true,
      export: {
        status: "held",
        glbPath: exportResult.glbPath,
        byteLength: exportResult.byteLength,
        sha256: exportResult.sha256,
      },
      cycles,
      assessment,
      outDir,
      glbPath: exportResult.glbPath,
    };
  }

  return {
    ok: true,
    status: "partial",
    deferred: false,
    pixelsProduced: true,
    imageGenProvider: "photoreal.external.pbr",
    role: "beauty",
    outPath: cycles.outPath,
    beautySha256: cycles.sha256,
    code: "CYCLES_BEAUTY_PIXELS",
    message: cycles.message,
    // Photoreal claim only when Cycles actually wrote pixels — still partial overall
    // (host/material fidelity not production-certified here).
    photorealClaim: true,
    assistOnly: false,
    nonAuthoritative: false,
    export: {
      status: "held",
      glbPath: exportResult.glbPath,
      byteLength: exportResult.byteLength,
      sha256: exportResult.sha256,
      provenance: exportResult.provenance,
    },
    cycles: {
      status: "complete",
      samples: cycles.samples,
      width: cycles.width,
      height: cycles.height,
      blenderBin: cycles.blenderBin,
    },
    assessment,
    outDir,
    glbPath: exportResult.glbPath,
  };
}

export default {
  resolveRepoRoot,
  resolveRendererCoreRoot,
  defaultSceneSpecPath,
  detectBlenderAvailable,
  assessLocalExternalPbrPipeline,
  runGlbExport,
  runCyclesBeauty,
  attemptLocalExternalPbrBeauty,
};
