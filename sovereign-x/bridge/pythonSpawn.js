/**
 * Shared Python script spawning utility.
 * Used by bridge server and Node modules to eliminate duplicate subprocess logic.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(dirname(join(__dirname, "..")), "../../..");

/**
 * Spawn a Python script with args, capture stdout/stderr, read report file.
 * @param {string} scriptPath - Path to Python script
 * @param {string[]} args - Command line arguments
 * @param {object} opts
 * @param {string} [opts.cwd=repoRoot] - Working directory
 * @param {number} [opts.timeoutMs=180000] - Timeout in ms
 * @param {NodeJS.ProcessEnv} [opts.env=process.env] - Environment
 * @param {string} [opts.reportPath] - Path to report JSON file
 * @param {string} [opts.outPath] - Path to output PNG file
 * @returns {Promise<object>} Result object
 */
export function spawnPythonScript(scriptPath, args, opts = {}) {
  return new Promise((resolve) => {
    const {
      cwd = repoRoot,
      timeoutMs = 180_000,
      env = process.env,
      reportPath = null,
      outPath = null,
    } = opts;

    if (!existsSync(scriptPath)) {
      resolve({
        ok: false,
        code: "SCRIPT_MISSING",
        status: "skeleton",
        message: `missing ${scriptPath}`,
      });
      return;
    }

    if (outPath) mkdirSync(dirname(outPath), { recursive: true });
    if (reportPath) mkdirSync(dirname(reportPath), { recursive: true });

    const python = process.env.PYTHON || "python";
    const fullArgs = [scriptPath, ...args];

    const child = spawn(python, fullArgs, {
      cwd,
      windowsHide: true,
      env,
    });

    let stdoutData = "";
    let stderrData = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        code: "TIMEOUT",
        status: "blocked",
        message: `timed out after ${timeoutMs}ms`,
        stdout: stdoutData.slice(-400),
        stderr: stderrData.slice(-400),
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdoutData += d.toString(); });
    child.stderr.on("data", (d) => { stderrData += d.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: "SPAWN_ERROR",
        status: "blocked",
        message: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      let report = null;
      if (reportPath && existsSync(reportPath)) {
        try {
          report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
          report = null;
        }
      }
      if (!report && stdoutData) {
        try {
          const line = stdoutData
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

      const pngOk = outPath && existsSync(outPath);
      const ok = (code === 0 || code === null) && pngOk && (report?.ok === true || (report === null && pngOk));

      resolve({
        ok,
        status: ok ? "partial" : "blocked",
        code: ok ? "OK" : "FAILED",
        exitCode: code,
        outPath: ok ? outPath : null,
        reportPath,
        report,
        stdoutTail: stdoutData.slice(-400),
        stderrTail: stderrData.slice(-400),
        message: ok
          ? `written to ${outPath}`
          : report?.error || report?.reason || report?.failed_stage || stderrData.slice(0, 400) || `exit ${code}`,
        assistOnly: true,
        nonAuthoritative: true,
      });
    });
  });
}

/**
 * OpenCL CL-Gen script path.
 */
export const CL_GEN_SCRIPT = join(repoRoot, "scripts", "legacy_efficient", "opencl_cl_gen_still.py");

/**
 * OpenCL Tonga still script path.
 */
export const OPENCL_TONGA_SCRIPT = join(repoRoot, "scripts", "legacy_efficient", "opencl_tonga_still.py");

/**
 * Axiom-X production runner script path.
 */
export const AXIOM_X_RUNNER = join(repoRoot, "axiom_x", "run_production.py");

/**
 * Default CL-Gen scene path.
 */
export const CL_GEN_DEFAULT_SCENE = join(repoRoot, "scripts", "legacy_efficient", "cl_gen_default_scene.json");

export default {
  spawnPythonScript,
  CL_GEN_SCRIPT,
  OPENCL_TONGA_SCRIPT,
  AXIOM_X_RUNNER,
  CL_GEN_DEFAULT_SCENE,
  repoRoot,
};