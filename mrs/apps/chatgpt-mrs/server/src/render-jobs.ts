/**
 * Subprocess RT4D render jobs for ChatGPT MCP (no Genblaze).
 * Concurrency 1; draft-quality defaults; serves PNG under /renders/.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

export type QualityPreset = "draft" | "standard";

const PRESETS: Record<
  QualityPreset,
  { width: number; height: number; samples: number; maxDepth: number }
> = {
  draft: { width: 256, height: 256, samples: 8, maxDepth: 4 },
  standard: { width: 448, height: 448, samples: 24, maxDepth: 5 },
};

const RENDER_DIR =
  process.env.MRS_RENDER_DIR?.trim() ||
  path.join(os.tmpdir(), "mrs-chatgpt-renders");
const TIMEOUT_MS = Number(process.env.MRS_RENDER_TIMEOUT_MS ?? 120_000);
const MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.MRS_RENDER_MAX_CONCURRENCY ?? 1)
);

let active = 0;
const queue: Array<() => void> = [];

function publicBaseUrl(): string {
  const raw = process.env.MRS_PUBLIC_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const port = Number(process.env.PORT ?? process.env.MRS_CHATGPT_PORT ?? 8000);
  return `http://127.0.0.1:${port}`;
}

export function getRenderDir(): string {
  fs.mkdirSync(RENDER_DIR, { recursive: true });
  return RENDER_DIR;
}

export function resolveRenderSceneScript(): string {
  const pkgJson = require.resolve("@mrs/renderer-core/package.json");
  return path.join(path.dirname(pkgJson), "scripts", "render-scene.mjs");
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

export type RenderJobResult = {
  jobId: string;
  pngUrl: string;
  pngPath: string;
  provenance: Record<string, unknown>;
  quality: QualityPreset;
};

/**
 * Spawn render-scene.mjs with a SceneSpecification; write PNG + return public URL.
 */
export async function runSceneSpecRender(
  spec: Record<string, unknown>,
  quality: QualityPreset = "draft"
): Promise<RenderJobResult> {
  await acquireSlot();
  const jobId = randomUUID();
  const dir = getRenderDir();
  const preset = PRESETS[quality] ?? PRESETS.draft;
  const specPath = path.join(dir, `${jobId}.spec.json`);
  const pngPath = path.join(dir, `${jobId}.png`);
  const provPath = path.join(dir, `${jobId}.provenance.json`);

  const output = {
    ...(typeof spec.output === "object" && spec.output
      ? (spec.output as Record<string, unknown>)
      : {}),
    width: preset.width,
    height: preset.height,
    samples: preset.samples,
    maxDepth: preset.maxDepth,
  };
  const body = { ...spec, output };

  try {
    fs.writeFileSync(specPath, JSON.stringify(body), "utf8");
    const script = resolveRenderSceneScript();
    const node = process.env.RT4D_NODE_PATH?.trim() || process.execPath;

    const provenance = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const child = spawn(
          node,
          [
            script,
            "--spec",
            specPath,
            "--output",
            pngPath,
            "--provenance",
            provPath,
          ],
          { stdio: ["ignore", "pipe", "pipe"] }
        );
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`render timed out after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);
        child.stdout?.on("data", (c: Buffer) => {
          stdout += c.toString("utf8");
        });
        child.stderr?.on("data", (c: Buffer) => {
          stderr += c.toString("utf8");
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            reject(
              new Error(
                `render-scene exited ${code}: ${stderr || stdout || "no output"}`
              )
            );
            return;
          }
          try {
            if (fs.existsSync(provPath)) {
              resolve(
                JSON.parse(fs.readFileSync(provPath, "utf8")) as Record<
                  string,
                  unknown
                >
              );
            } else {
              resolve(JSON.parse(stdout.trim()) as Record<string, unknown>);
            }
          } catch (err) {
            reject(
              new Error(
                `could not parse provenance: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
        });
      }
    );

    if (!fs.existsSync(pngPath)) {
      throw new Error("render finished but PNG missing");
    }

    return {
      jobId,
      pngPath,
      pngUrl: `${publicBaseUrl()}/renders/${jobId}.png`,
      provenance,
      quality,
    };
  } finally {
    try {
      fs.unlinkSync(specPath);
    } catch {
      /* ignore */
    }
    releaseSlot();
  }
}

/** Safe basename for GET /renders/:file — only uuid.png */
export function safeRenderFileName(name: string): string | null {
  const base = path.basename(name);
  if (!/^[0-9a-f-]{36}\.png$/i.test(base)) return null;
  return base;
}
