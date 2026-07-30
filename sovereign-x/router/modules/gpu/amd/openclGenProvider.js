/**
 * CL-Gen provider — first-class OpenCL pixel source (image.gen.opencl).
 *
 * STATUS: **partial**
 * - Spawns scripts/legacy-efficient/opencl_cl_gen_still.py after VII/VIII wrap.
 * - Scene-aware still (dim-room default); not Engine3D soft-raster parity.
 * - Prefer before Lemonade when Lemonade cannot produce pixels.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyClGenConstitutionalWrap,
  CL_GEN_CAPABILITY,
  CL_GEN_PROVIDER,
} from "./clGenConstitutionalWrap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../../");

export { CL_GEN_CAPABILITY, CL_GEN_PROVIDER };

export const ADAPTER_ID = "sx.adapter.image.gen.opencl";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object} [opts]
 * @returns {boolean}
 */
export function detectOpenClGenAvailable(env = process.env, opts = {}) {
  if (opts.openclGenAvailable === false) return false;
  const v = String(env.IMAGE_GEN_DISABLE_OPENCL || "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return false;
  if (String(env.IMAGE_GEN_FORCE_OPENCL_DOWN || "").trim() === "1") return false;
  if (opts.openclGenAvailable === true) return true;
  const script = join(
    repoRoot,
    "scripts",
    "legacy-efficient",
    "opencl_cl_gen_still.py",
  );
  return existsSync(script);
}

/**
 * Spawn CL-Gen Python kernel.
 * @param {object} opts
 * @returns {Promise<object>}
 */
export function spawnClGenStill(opts = {}) {
  const script = join(
    repoRoot,
    "scripts",
    "legacy-efficient",
    "opencl_cl_gen_still.py",
  );
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      code: "CL_GEN_SCRIPT_MISSING",
      status: "skeleton",
      pixelsProduced: false,
      message: `missing ${script}`,
      imageGenProvider: CL_GEN_PROVIDER,
    });
  }

  const outPath = resolve(
    opts.outPath ||
      join(repoRoot, "docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.png"),
  );
  const reportPath = resolve(
    opts.reportPath || join(dirname(outPath), "opencl-gen-dim-room.json"),
  );
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const python = process.env.PYTHON || opts.python || "python";
  const scenePath =
    opts.scenePath ||
    join(repoRoot, "scripts/legacy-efficient/cl_gen_default_scene.json");

  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  const args = [
    script,
    "--out",
    outPath,
    "--report",
    reportPath,
    "--width",
    String(width),
    "--height",
    String(height),
    "--seed",
    String(opts.seed ?? 1.0),
  ];
  if (opts.sceneJson) {
    args.push("--scene-json", JSON.stringify(opts.sceneJson));
  } else if (scenePath && existsSync(scenePath)) {
    args.push("--scene", scenePath);
  }

  return new Promise((resolvePromise) => {
    const child = spawn(python, args, {
      cwd: repoRoot,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolvePromise({
        ok: false,
        code: "CL_GEN_TIMEOUT",
        status: "blocked",
        pixelsProduced: false,
        message: `CL-Gen timed out after ${timeoutMs}ms`,
        imageGenProvider: CL_GEN_PROVIDER,
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        code: "CL_GEN_SPAWN_ERROR",
        status: "blocked",
        pixelsProduced: false,
        message: err.message,
        imageGenProvider: CL_GEN_PROVIDER,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let report = null;
      if (existsSync(reportPath)) {
        try {
          report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
          report = null;
        }
      }
      if (!report) {
        try {
          const line = stdout
            .replace(/^\uFEFF/, "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .pop();
          report = JSON.parse(line || "{}");
        } catch {
          report = null;
        }
      }
      const pngOk = existsSync(outPath);
      const ok =
        (code === 0 || code === null) &&
        pngOk &&
        (report?.ok === true || (report === null && pngOk));
      resolvePromise({
        ok,
        status: ok ? "partial" : "blocked",
        code: ok ? "CL_GEN_STILL_OK" : "CL_GEN_STILL_FAILED",
        provider: CL_GEN_PROVIDER,
        imageGenProvider: CL_GEN_PROVIDER,
        capability: CL_GEN_CAPABILITY,
        adapterId: ADAPTER_ID,
        exitCode: code,
        outPath: ok ? outPath : null,
        reportPath,
        report,
        byteLength: ok && pngOk ? undefined : undefined,
        pixelsProduced: ok,
        stdoutTail: stdout.slice(-400),
        stderrTail: stderr.slice(-400),
        message: ok
          ? `CL-Gen still written to ${outPath}`
          : report?.error || stderr.slice(0, 400) || `exit ${code}`,
        gapsVsEngine3dSoftRaster: report?.gapsVsEngine3dSoftRaster || null,
        assistOnly: true,
        nonAuthoritative: true,
        note:
          "partial — scene-aware OpenCL still; not soft-raster parity; not SDXL",
      });
    });
  });
}

/**
 * Full path: constitutional wrap → CL-Gen → pixels.
 *
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function generateClGenStill(opts = {}) {
  const wrap = await applyClGenConstitutionalWrap({
    intent: {
      intentId: opts.intentId,
      worldId: opts.worldId || opts.worldContext,
      ...(opts.intent || {}),
    },
    evidence: {
      worldContext: opts.worldContext || "interior.dim-room",
      scaleClass: opts.scaleClass || "human-sized",
      worldId: opts.worldId,
      ...(opts.evidence || {}),
    },
    skipConstitutional: opts.skipConstitutional,
    env: opts.env || process.env,
  });

  if (!wrap.ok || wrap.halted) {
    return {
      ok: false,
      status: "halted",
      pixelsProduced: false,
      imageGenProvider: CL_GEN_PROVIDER,
      capability: CL_GEN_CAPABILITY,
      adapterId: ADAPTER_ID,
      haltCode: wrap.haltCode,
      message: wrap.reason,
      constitutionalWrap: wrap,
      constitutionalLog: wrap.constitutionalLog,
    };
  }

  // Optional: merge Engine3D-ish context into scene JSON
  let sceneJson = opts.sceneJson || null;
  if (opts.engine3dContext && !sceneJson) {
    sceneJson = engine3dContextToClGenScene(opts.engine3dContext, opts.sceneBase);
  }

  const still = await spawnClGenStill({
    ...opts,
    sceneJson: sceneJson || opts.sceneJson,
  });

  return {
    ...still,
    constitutionalWrap: wrap,
    constitutionalLog: {
      ...(wrap.constitutionalLog || {}),
      reason: still.ok
        ? `pixels via ${CL_GEN_PROVIDER} after VII/VIII allow`
        : still.message,
    },
  };
}

/**
 * Map a compact Engine3D-ish context into CL-Gen scene fields.
 * STATUS: **partial** — camera + ambient + optional spheres only.
 *
 * @param {object} ctx
 * @param {object} [base]
 */
export function engine3dContextToClGenScene(ctx = {}, base = null) {
  let scene = base;
  if (!scene) {
    const defaultPath = join(
      repoRoot,
      "scripts/legacy-efficient/cl_gen_default_scene.json",
    );
    if (existsSync(defaultPath)) {
      scene = JSON.parse(readFileSync(defaultPath, "utf8"));
    } else {
      scene = { camera: {}, lights: [], spheres: [], planes: [], post: {} };
    }
  } else {
    scene = JSON.parse(JSON.stringify(scene));
  }

  const cam = ctx.camera || ctx;
  if (cam.eye || cam.position) {
    scene.camera = scene.camera || {};
    scene.camera.eye = cam.eye || cam.position;
  }
  if (cam.look || cam.target) {
    scene.camera = scene.camera || {};
    scene.camera.look = cam.look || cam.target;
  }
  if (cam.up) {
    scene.camera = scene.camera || {};
    scene.camera.up = cam.up;
  }
  if (cam.fovDeg || cam.fov) {
    scene.camera = scene.camera || {};
    scene.camera.fovDeg = cam.fovDeg || cam.fov;
  }
  if (ctx.ambient) scene.ambient = ctx.ambient;
  if (Array.isArray(ctx.lights) && ctx.lights.length) scene.lights = ctx.lights;
  if (Array.isArray(ctx.spheres) && ctx.spheres.length) {
    scene.spheres = ctx.spheres;
  }
  if (Array.isArray(ctx.planes) && ctx.planes.length) scene.planes = ctx.planes;
  if (ctx.worldContext) scene.worldContext = ctx.worldContext;
  if (ctx.worldProfileId) scene.worldProfileId = ctx.worldProfileId;
  if (ctx.post) scene.post = { ...(scene.post || {}), ...ctx.post };

  return scene;
}

export default {
  ADAPTER_ID,
  CL_GEN_CAPABILITY,
  CL_GEN_PROVIDER,
  detectOpenClGenAvailable,
  spawnClGenStill,
  generateClGenStill,
  engine3dContextToClGenScene,
};
