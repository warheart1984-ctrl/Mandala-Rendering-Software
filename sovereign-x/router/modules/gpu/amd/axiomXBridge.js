/**
 * Axiom-X dispatch bridge — Sovereign-X router → Axiom-X OpenCL kernel.
 *
 * Capability: gpu.compute.amd.legacy_efficient
 * Namespace: sx.router.module.gpu.amd.axiomx
 *
 * STATUS: **partial** — live GPU still on hosts with working pyopencl;
 * assist-only; never Digital Printer SoT.
 *
 * Spawns the Axiom-X production runner (`--mode still`) which executes the
 * legacy_still OpenCL kernel on the host GPU through the Sovereign-X →
 * Axiom-X constitutional bridge (intent → capability → policy → manifest →
 * execute → provenance hash). Reads back output.png + evidence.json.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../../");

/**
 * @param {object} opts
 * @param {string} [opts.outDir]
 * @param {string} [opts.reportPath]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.seed]
 * @param {string} [opts.intentId]
 * @param {string} [opts.worldId]
 * @param {string} [opts.timelineId]
 * @param {string} [opts.python]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<object>}
 */
export function generateStillViaAxiomX(opts = {}) {
  const runner = join(repoRoot, "axiom_x", "run_production.py");
  if (!existsSync(runner)) {
    return Promise.resolve({
      ok: false,
      code: "AXIOMX_RUNNER_MISSING",
      status: "skeleton",
      message: `missing ${runner}`,
    });
  }

  const outDir = resolve(
    opts.outDir || join(repoRoot, "tmp", "axiom-x-still"),
  );
  const reportPath = resolve(
    opts.reportPath || join(outDir, "evidence.json"),
  );
  const width = opts.width ?? 256;
  const height = opts.height ?? 256;
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1.0;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const python = process.env.PYTHON || opts.python || "python";

  const args = [
    runner,
    "--mode",
    "still",
    "--out-dir",
    outDir,
    "--width",
    String(width),
    "--height",
    String(height),
    "--seed",
    String(seed),
  ];
  if (opts.intentId) args.push("--intent-id", String(opts.intentId));
  if (opts.worldId) args.push("--world-id", String(opts.worldId));
  if (opts.timelineId) args.push("--timeline-id", String(opts.timelineId));

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
        code: "AXIOMX_TIMEOUT",
        status: "blocked",
        message: `axiom-x still timed out after ${timeoutMs}ms`,
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
        code: "AXIOMX_SPAWN_ERROR",
        status: "blocked",
        message: err.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let report = null;
      // Prefer on-disk evidence.json (Windows stdout encoding can break JSON.parse).
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
          report = line ? JSON.parse(line) : null;
        } catch {
          report = null;
        }
      }
      const outputPath = join(outDir, "bridge", "output.png");
      const pngOk = existsSync(outputPath);
      const evidencePassed = report?.status === "PASS";
      const ok =
        (code === 0 || code === null) && pngOk && evidencePassed;
      resolvePromise({
        ok,
        status: ok ? "partial" : "blocked",
        code: ok ? "AXIOMX_STILL_OK" : "AXIOMX_STILL_FAILED",
        provider: "axiom-x",
        exitCode: code,
        outPath: ok ? outputPath : null,
        reportPath,
        report,
        evidence: report,
        stdoutTail: stdout.slice(-400),
        stderrTail: stderr.slice(-400),
        message: ok
          ? `Axiom-X OpenCL still written to ${outputPath}`
          : report?.error ||
            report?.reason ||
            report?.failed_stage ||
            stderr.slice(0, 400) ||
            `exit ${code}`,
        assistOnly: true,
        nonAuthoritative: true,
      });
    });
  });
}

export default { generateStillViaAxiomX };
