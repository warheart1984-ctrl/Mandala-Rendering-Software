/**
 * Optional OpenCL still bridge for SX legacy-efficient route.
 * Spawns scripts/legacy-efficient/opencl_tonga_still.py when requested.
 *
 * STATUS: **partial** — host OpenCL proof path; requires pyopencl on PATH python.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../../");

/**
 * @param {object} opts
 * @param {string} opts.outPath
 * @param {string} [opts.reportPath]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.timeoutMs]
 */
export function generateOpenClLegacyStill(opts = {}) {
  const script = join(
    repoRoot,
    "scripts",
    "legacy-efficient",
    "opencl_tonga_still.py",
  );
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      code: "OPENCL_SCRIPT_MISSING",
      status: "skeleton",
      message: `missing ${script}`,
    });
  }

  const outPath = resolve(opts.outPath);
  const reportPath = resolve(
    opts.reportPath ||
      join(dirname(outPath), "opencl-tonga-probe.json"),
  );
  const width = opts.width ?? 256;
  const height = opts.height ?? 256;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const python = process.env.PYTHON || "python";

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
  ];

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
        code: "OPENCL_TIMEOUT",
        status: "blocked",
        message: `opencl still timed out after ${timeoutMs}ms`,
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
        code: "OPENCL_SPAWN_ERROR",
        status: "blocked",
        message: err.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let report = null;
      // Prefer on-disk report (Windows stdout encoding can break JSON.parse).
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
        (report?.ok === true || report === null);
      resolvePromise({
        ok,
        status: ok ? "partial" : "blocked",
        code: ok ? "OPENCL_STILL_OK" : "OPENCL_STILL_FAILED",
        provider: "opencl-legacy",
        exitCode: code,
        outPath: ok ? outPath : null,
        reportPath,
        report,
        stdoutTail: stdout.slice(-400),
        stderrTail: stderr.slice(-400),
        message: ok
          ? `OpenCL Tonga still written to ${outPath}`
          : report?.error || stderr.slice(0, 400) || `exit ${code}`,
        assistOnly: true,
        nonAuthoritative: true,
      });
    });
  });
}

export default { generateOpenClLegacyStill };
