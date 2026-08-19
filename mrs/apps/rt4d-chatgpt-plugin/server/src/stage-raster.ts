import { encodeRgbaPng, pngSha256 } from "./png-rgba.js";
import { projectWireMeshTo3d } from "./wire-mesh-4d.js";
import type { CharacterRigBinding, Vec3Tuple, WireMesh4D } from "./scene-store.js";

export type StagePng = {
  pngBase64: string;
  mimeType: "image/png";
  width: number;
  height: number;
  sha256: string;
};

type Rgb = readonly [number, number, number];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function setPixel(
  rgba: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rgb: Rgb,
  a = 255
): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  const da = a / 255;
  rgba[i] = Math.round(rgba[i]! * (1 - da) + rgb[0] * da);
  rgba[i + 1] = Math.round(rgba[i + 1]! * (1 - da) + rgb[1] * da);
  rgba[i + 2] = Math.round(rgba[i + 2]! * (1 - da) + rgb[2] * da);
  rgba[i + 3] = 255;
}

function drawDot(
  rgba: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  rgb: Rgb
): void {
  const rad = Math.max(1, Math.round(r));
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy <= rad * rad) setPixel(rgba, w, h, x + dx, y + dy, rgb);
    }
  }
}

function drawLine(
  rgba: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: Rgb,
  thickness: number
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    drawDot(rgba, w, h, x0 + dx * t, y0 + dy * t, thickness, rgb);
  }
}

function fit2d(
  points: Array<Vec3Tuple>,
  width: number,
  height: number
): Array<{ x: number; y: number; z: number }> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = 0.82 * Math.min(width, height) / span;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return points.map(([x, y, z]) => ({
    x: (x - midX) * scale + cx,
    y: cy - (y - midY) * scale,
    z,
  }));
}

function fillBackground(rgba: Uint8Array, w: number, h: number, top: Rgb, bot: Rgb): void {
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const rgb: Rgb = [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t),
    ];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
}

export function rasterEnergyWireMesh(input: {
  mesh: WireMesh4D;
  distance4d: number;
  width?: number;
  height?: number;
}): StagePng {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const rgba = new Uint8Array(width * height * 4);
  fillBackground(rgba, width, height, [8, 10, 22], [4, 4, 10]);
  const projected = projectWireMeshTo3d(input.mesh, input.distance4d);
  const fitted = fit2d(projected, width, height);
  const thick = Math.max(1, Math.round(Math.min(width, height) / 280));

  for (const [a, b] of input.mesh.edges) {
    const pa = fitted[a];
    const pb = fitted[b];
    const va = input.mesh.vertices[a];
    const vb = input.mesh.vertices[b];
    if (!pa || !pb || !va || !vb) continue;
    const wMean = (va[3] + vb[3]) / 2;
    const energy: Rgb =
      wMean >= 0 ? [255, 110, 24] : [0, 196, 255];
    drawLine(rgba, width, height, pa.x, pa.y, pb.x, pb.y, energy, thick);
  }
  for (const p of fitted) {
    drawDot(rgba, width, height, p.x, p.y, thick, [255, 230, 180]);
  }

  const bytes = encodeRgbaPng(width, height, rgba);
  return {
    pngBase64: bytes.toString("base64"),
    mimeType: "image/png",
    width,
    height,
    sha256: pngSha256(bytes),
  };
}

export function rasterClayRig(input: {
  mesh: WireMesh4D;
  binding: CharacterRigBinding;
  vertices3d: Array<Vec3Tuple>;
  distance4d: number;
  width?: number;
  height?: number;
  lit?: boolean;
}): StagePng {
  const width = input.width ?? 512;
  const height = input.height ?? 512;
  const rgba = new Uint8Array(width * height * 4);
  if (input.lit) {
    fillBackground(rgba, width, height, [42, 36, 32], [18, 14, 12]);
  } else {
    fillBackground(rgba, width, height, [28, 30, 34], [14, 14, 16]);
  }

  const meshFit = fit2d(input.vertices3d, width, height);
  const bonePts = input.binding.bones.map((b) => b.position3d);
  const boneFit = fit2d(bonePts, width, height);
  const thick = Math.max(1, Math.round(Math.min(width, height) / 260));

  for (const [a, b] of input.mesh.edges) {
    const pa = meshFit[a];
    const pb = meshFit[b];
    if (!pa || !pb) continue;
    const clay: Rgb = input.lit ? [210, 186, 158] : [168, 168, 176];
    drawLine(rgba, width, height, pa.x, pa.y, pb.x, pb.y, clay, thick);
  }

  const idToIndex = new Map(input.binding.bones.map((bone, i) => [bone.id, i]));
  for (const bone of input.binding.bones) {
    if (!bone.parentId) continue;
    const i = idToIndex.get(bone.id);
    const j = idToIndex.get(bone.parentId);
    if (i === undefined || j === undefined) continue;
    const pa = boneFit[j];
    const pb = boneFit[i];
    if (!pa || !pb) continue;
    drawLine(rgba, width, height, pa.x, pa.y, pb.x, pb.y, [40, 140, 255], thick + 1);
  }
  for (const p of boneFit) {
    drawDot(rgba, width, height, p.x, p.y, thick + 2, [80, 190, 255]);
  }

  const bytes = encodeRgbaPng(width, height, rgba);
  return {
    pngBase64: bytes.toString("base64"),
    mimeType: "image/png",
    width,
    height,
    sha256: pngSha256(bytes),
  };
}

export function lemonadeBaseUrl(): string {
  const explicit = process.env.LEMONADE_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host = process.env.LEMONADE_HOST?.trim();
  if (host) {
    const port = process.env.LEMONADE_PORT?.trim() || "13305";
    return `http://${host}:${port}/api/v1`;
  }
  return "http://127.0.0.1:13305/api/v1";
}

function beautyPrompt(scenePrompt: string, species: string): string {
  return `${scenePrompt}. ${species} character cinematic still, detailed materials, dramatic side light, same identity and proportions as the clay sculpt. Not a new character.`;
}

/**
 * Beauty is partial-with-gaps: local Lemonade SD-Turbo when reachable,
 * otherwise the lit clay raster. Never claims photoreal. Diffusion must not
 * replace anatomy — this is surface look only.
 */
export async function rasterBeautyWithGaps(input: {
  prompt: string;
  species: string;
  mesh: WireMesh4D;
  binding: CharacterRigBinding;
  vertices3d: Array<Vec3Tuple>;
  distance4d: number;
  width?: number;
  height?: number;
}): Promise<StagePng & { source: "lemonade" | "clay_raster"; gaps: string[] }> {
  const width = clamp(input.width ?? 512, 16, 1024);
  const height = clamp(input.height ?? 512, 16, 1024);
  const clay = rasterClayRig({
    mesh: input.mesh,
    binding: input.binding,
    vertices3d: input.vertices3d,
    distance4d: input.distance4d,
    width,
    height,
    lit: true,
  });

  const gaps = [
    "fixture_rig_not_production_sculpt",
    "photoreal_fur_leather_not_guaranteed",
    "diffusion_must_not_replace_anatomy",
  ];

  const polishOff = process.env.RT4D_BEAUTY_POLISH === "0";
  if (polishOff) {
    return { ...clay, source: "clay_raster", gaps: [...gaps, "beauty_polish_disabled"] };
  }

  const base = lemonadeBaseUrl();
  const timeoutMs = Number(process.env.RT4D_BEAUTY_TIMEOUT_MS ?? 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = process.env.LEMONADE_API_KEY?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: "SD-Turbo",
        prompt: beautyPrompt(input.prompt, input.species),
        size: "512x512",
        steps: 4,
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ...clay,
        source: "clay_raster",
        gaps: [...gaps, `lemonade_http_${res.status}:${body.slice(0, 80)}`],
      };
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      return { ...clay, source: "clay_raster", gaps: [...gaps, "lemonade_missing_b64"] };
    }
    const bytes = Buffer.from(b64, "base64");
    return {
      pngBase64: b64,
      mimeType: "image/png",
      width: 512,
      height: 512,
      sha256: pngSha256(bytes),
      source: "lemonade",
      gaps: [...gaps, "lemonade_txt2img_not_img2img_locked_to_clay"],
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ...clay,
      source: "clay_raster",
      gaps: [...gaps, `lemonade_unreachable:${detail.slice(0, 80)}`],
    };
  } finally {
    clearTimeout(timer);
  }
}
