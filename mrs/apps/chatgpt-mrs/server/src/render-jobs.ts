/**
 * RT4D render jobs for ChatGPT MCP (no Genblaze / no diffusion).
 * Subprocess CLI paths are fixed; only validated numeric/string args are passed.
 * Concurrency 1; dimension/sample/PNG size caps for MCP image responses.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

export type QualityPreset = "smoke" | "draft" | "standard";

const PRESETS: Record<
  QualityPreset,
  { width: number; height: number; samples: number; maxDepth: number }
> = {
  smoke: { width: 64, height: 64, samples: 2, maxDepth: 3 },
  draft: { width: 256, height: 256, samples: 8, maxDepth: 4 },
  standard: { width: 448, height: 448, samples: 24, maxDepth: 5 },
};

/** ChatGPT/MCP-friendly caps (aligned with renderer-core stills, not ultra). */
export const RENDER_CAPS = {
  minDim: 16,
  maxDim: 512,
  minSamples: 1,
  maxSamples: 32,
  minDepth: 1,
  maxDepth: 6,
  maxPngBytes: Number(process.env.MRS_RENDER_MAX_PNG_BYTES ?? 1_500_000),
  maxPromptChars: 500,
} as const;

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

function resolveRendererCoreRoot(): string {
  // Prefer main export (in package "exports"); avoid ./package.json which is not exported.
  const entry = require.resolve("@mrs/renderer-core");
  return path.resolve(path.dirname(entry), "..");
}

export function resolveRenderSceneScript(): string {
  return path.join(resolveRendererCoreRoot(), "scripts", "render-scene.mjs");
}

export function resolveRenderStillScript(): string {
  return path.join(resolveRendererCoreRoot(), "scripts", "render-still.mjs");
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

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function resolveRenderSettings(opts: {
  quality?: QualityPreset;
  width?: number;
  height?: number;
  samples?: number;
  maxDepth?: number;
}): { width: number; height: number; samples: number; maxDepth: number; quality: QualityPreset } {
  const quality = opts.quality ?? "draft";
  const base = PRESETS[quality] ?? PRESETS.draft;
  return {
    quality,
    width: clampInt(opts.width ?? base.width, RENDER_CAPS.minDim, RENDER_CAPS.maxDim),
    height: clampInt(opts.height ?? base.height, RENDER_CAPS.minDim, RENDER_CAPS.maxDim),
    samples: clampInt(
      opts.samples ?? base.samples,
      RENDER_CAPS.minSamples,
      RENDER_CAPS.maxSamples
    ),
    maxDepth: clampInt(
      opts.maxDepth ?? base.maxDepth,
      RENDER_CAPS.minDepth,
      RENDER_CAPS.maxDepth
    ),
  };
}

export type PngImagePayload = {
  mimeType: "image/png";
  /** Raw base64 (no data: URL prefix) for MCP ImageContent.data */
  data: string;
  byteLength: number;
  sha256: string;
};

export function encodePngForMcp(png: Buffer): PngImagePayload {
  if (png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50) {
    throw new Error("render output is not a PNG");
  }
  if (png.length > RENDER_CAPS.maxPngBytes) {
    throw new Error(
      `PNG ${png.length} bytes exceeds MCP cap ${RENDER_CAPS.maxPngBytes}; lower width/height/samples`
    );
  }
  return {
    mimeType: "image/png",
    data: png.toString("base64"),
    byteLength: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
  };
}

function unlinkQuiet(...paths: string[]): void {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

export type RenderJobResult = {
  jobId: string;
  pngUrl: string;
  pngPath: string;
  image: PngImagePayload;
  provenance: Record<string, unknown>;
  quality: QualityPreset;
  width: number;
  height: number;
  samples: number;
  maxDepth: number;
  provider: "mrs-renderer-core/rt4d";
};

/**
 * Spawn fixed render-scene.mjs with a SceneSpecification; return PNG + MCP image payload.
 */
export async function runSceneSpecRender(
  spec: Record<string, unknown>,
  opts: {
    quality?: QualityPreset;
    width?: number;
    height?: number;
    samples?: number;
    maxDepth?: number;
    /** Keep PNG on disk for GET /renders/:id (default true). */
    keepFile?: boolean;
  } = {}
): Promise<RenderJobResult> {
  await acquireSlot();
  const jobId = randomUUID();
  const dir = getRenderDir();
  const settings = resolveRenderSettings(opts);
  const specPath = path.join(dir, `${jobId}.spec.json`);
  const pngPath = path.join(dir, `${jobId}.png`);
  const provPath = path.join(dir, `${jobId}.provenance.json`);
  const keepFile = opts.keepFile !== false;

  const output = {
    ...(typeof spec.output === "object" && spec.output
      ? (spec.output as Record<string, unknown>)
      : {}),
    width: settings.width,
    height: settings.height,
    samples: settings.samples,
    maxDepth: settings.maxDepth,
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
    const png = fs.readFileSync(pngPath);
    const image = encodePngForMcp(png);
    unlinkQuiet(specPath, provPath);
    if (!keepFile) unlinkQuiet(pngPath);

    return {
      jobId,
      pngPath: keepFile ? pngPath : "",
      pngUrl: keepFile ? `${publicBaseUrl()}/renders/${jobId}.png` : "",
      image,
      provenance: {
        ...provenance,
        sha256: image.sha256,
        provider: "mrs-renderer-core/rt4d",
        kind: "deterministic-procedural-4d-render",
      },
      quality: settings.quality,
      width: settings.width,
      height: settings.height,
      samples: settings.samples,
      maxDepth: settings.maxDepth,
      provider: "mrs-renderer-core/rt4d",
    };
  } catch (err) {
    unlinkQuiet(specPath, pngPath, provPath);
    throw err;
  } finally {
    releaseSlot();
  }
}

/**
 * In-process render-still.mjs (prompt → procedural archetype → RT4D PNG).
 * Fixed module path via package resolve — no shell string injection.
 */
export async function runPromptRender(opts: {
  prompt: string;
  quality?: QualityPreset;
  seed?: number;
  width?: number;
  height?: number;
  samples?: number;
  maxDepth?: number;
  keepFile?: boolean;
}): Promise<RenderJobResult> {
  const prompt = String(opts.prompt ?? "").slice(0, RENDER_CAPS.maxPromptChars);
  if (!prompt.trim()) {
    throw new Error("prompt is required (selects a procedural RT4D scene archetype)");
  }

  await acquireSlot();
  const jobId = randomUUID();
  const settings = resolveRenderSettings(opts);
  const keepFile = opts.keepFile === true;
  const dir = getRenderDir();
  const pngPath = path.join(dir, `${jobId}.png`);
  const provPath = path.join(dir, `${jobId}.provenance.json`);

  try {
    const stillUrl = pathToFileURL(resolveRenderStillScript()).href;
    const mod = (await import(stillUrl)) as {
      renderStill: (o: Record<string, unknown>) => {
        png: Buffer;
        provenance: Record<string, unknown>;
      };
    };

    const seed =
      opts.seed != null && Number.isFinite(Number(opts.seed))
        ? Number(opts.seed) >>> 0
        : undefined;

    const result = await Promise.race([
      Promise.resolve(
        mod.renderStill({
          prompt,
          seed,
          width: settings.width,
          height: settings.height,
          samples: settings.samples,
          maxDepth: settings.maxDepth,
        })
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`render timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS
        );
      }),
    ]);

    const image = encodePngForMcp(result.png);
    if (keepFile) {
      fs.writeFileSync(pngPath, result.png);
      fs.writeFileSync(
        provPath,
        JSON.stringify({ ...result.provenance, sha256: image.sha256 }, null, 2)
      );
    }

    return {
      jobId,
      pngPath: keepFile ? pngPath : "",
      pngUrl: keepFile ? `${publicBaseUrl()}/renders/${jobId}.png` : "",
      image,
      provenance: {
        ...result.provenance,
        sha256: image.sha256,
        provider: "mrs-renderer-core/rt4d",
        jobId,
      },
      quality: settings.quality,
      width: settings.width,
      height: settings.height,
      samples: settings.samples,
      maxDepth: settings.maxDepth,
      provider: "mrs-renderer-core/rt4d",
    };
  } catch (err) {
    unlinkQuiet(pngPath, provPath);
    throw err;
  } finally {
    releaseSlot();
  }
}

/** Safe basename for GET /renders/:file — only uuid.png */
export function safeRenderFileName(name: string): string | null {
  const base = path.basename(name);
  if (!/^[0-9a-f-]{36}\.png$/i.test(base)) return null;
  return base;
}
