/**
 * One-shot Anything-V5 via local sd-cli (CPU-safe Q4 on Polaris).
 * Avoids Lemonade spawning a second sd-server when :13306 is already owned.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clampPainterEdge, PAINTER_DEFAULT_EDGE, PAINTER_STEPS } from "./pro-tier.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");

export const SD_CLI_BIN = process.env.MANDALA_SD_CLI || join(REPO_ROOT, "runtime/sdcpp/bin/sd-cli");
export const ANYTHING_V5_GGUF =
  process.env.MANDALA_ANYTHING_V5_GGUF || join(REPO_ROOT, "runtime/models/image/anything-v5-q4_0.gguf");

export function sdCliAvailable() {
  return existsSync(SD_CLI_BIN) && existsSync(ANYTHING_V5_GGUF);
}

/**
 * Generate a PNG with Anything-V5 Q4 via sd-cli (CPU). Does not touch :13306/:13307.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {number} [opts.edge=64]
 * @param {number} [opts.steps=4]
 * @param {number} [opts.cfgScale=7]
 * @param {number} [opts.seed=1990]
 * @param {number} [opts.timeoutMs=180000]
 * @param {number} [opts.threads=6]
 * @returns {Promise<object>}
 */
export async function generateAnythingViaSdCli(prompt, {
  edge = PAINTER_DEFAULT_EDGE,
  steps = PAINTER_STEPS,
  cfgScale = 7.0,
  seed = 1990,
  timeoutMs = 180000,
  threads = Number(process.env.MANDALA_SD_THREADS) || 6,
} = {}) {
  const started = Date.now();
  if (!existsSync(SD_CLI_BIN)) {
    return {
      ok: false,
      ms: Date.now() - started,
      reason: `sd-cli missing: ${SD_CLI_BIN}`,
      via: "sd-cli",
      model: "Anything-V5",
    };
  }
  if (!existsSync(ANYTHING_V5_GGUF)) {
    return {
      ok: false,
      ms: Date.now() - started,
      reason: `Anything-V5 GGUF missing: ${ANYTHING_V5_GGUF} (see docs/mandala/GOLDEN_PATH_PRO_PAINTER.md)`,
      via: "sd-cli",
      model: "Anything-V5",
    };
  }

  const e = clampPainterEdge(edge);
  const dir = mkdtempSync(join(tmpdir(), "mandala-painter-"));
  const outPath = join(dir, "frame.png");
  const args = [
    "--model",
    ANYTHING_V5_GGUF,
    "--backend",
    "cpu",
    "--params-backend",
    "cpu",
    "--threads",
    String(threads),
    "--mmap",
    "--vae-tiling",
    "--clip-skip",
    "2",
    "--steps",
    String(steps),
    "--cfg-scale",
    String(cfgScale),
    "--seed",
    String(seed),
    "--sampling-method",
    "euler_a",
    "--width",
    String(e),
    "--height",
    String(e),
    "--prompt",
    String(prompt),
    "--output",
    outPath,
  ];

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const child = spawn(SD_CLI_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        ms: Date.now() - started,
        reason: `sd-cli timeout after ${timeoutMs}ms`,
        via: "sd-cli",
        model: "Anything-V5",
        excerpt: stderr.slice(-400),
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      finish({
        ok: false,
        ms: Date.now() - started,
        reason: err?.message || String(err),
        via: "sd-cli",
        model: "Anything-V5",
      });
    });

    child.on("close", (code) => {
      const ms = Date.now() - started;
      try {
        if (code === 0 && existsSync(outPath)) {
          const pngBytes = readFileSync(outPath);
          finish({
            ok: true,
            ms,
            pngBytes,
            bytes: pngBytes.length,
            via: "sd-cli",
            model: "Anything-V5",
            modelPath: ANYTHING_V5_GGUF,
            backend: "anything-v5",
            size: `${e}x${e}`,
            steps,
            cfg_scale: cfgScale,
            seed,
            http: 0,
          });
          return;
        }
        const excerpt = (stderr || stdout).slice(-400);
        finish({
          ok: false,
          ms,
          reason: `sd-cli exit ${code}: ${excerpt || "no output"}`,
          via: "sd-cli",
          model: "Anything-V5",
          excerpt,
        });
      } catch (err) {
        finish({
          ok: false,
          ms,
          reason: err?.message || String(err),
          via: "sd-cli",
          model: "Anything-V5",
        });
      }
    });
  });
}
