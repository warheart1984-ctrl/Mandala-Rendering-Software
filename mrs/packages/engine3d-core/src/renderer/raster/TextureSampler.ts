/**
 * Max soft-raster texture path: PNG decode, bilinear (+ optional mip), wrap modes,
 * multi-map sampling (color / normal / roughness / metallic / emissive / ao),
 * tangent-space normal mapping, sRGB→linear for color maps.
 *
 * Drive-G-1: CPU soft-raster cannot match GPU anisotropic filtering / virtual
 * texturing. This is the strongest Node/CI path without WebGPU.
 *
 * Status: **enforced** by texture sampler unit tests.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import type {
  TextureAsset,
  TextureRef,
  TextureRole,
  UniversalMaterial,
} from "../../world/WorldObject.js";
import type { Vec3 } from "./HeadlessStillRenderer.js";
import type { RasterMaterial } from "./RasterMaterial.js";

export type Rgba = readonly [number, number, number, number];

export interface SampledMaps {
  albedo?: Vec3;
  roughness?: number;
  metallic?: number;
  emissive?: Vec3;
  ao?: number;
  /** Perturbed world-space normal after tangent-space map. */
  normal?: Vec3;
}

export interface LoadedTexture {
  id: string;
  role?: TextureRole;
  width: number;
  height: number;
  /** RGBA8 linear (color maps converted from sRGB). */
  pixels: Uint8Array;
  colorSpace: "srgb" | "linear";
  wrapS: "repeat" | "clamp-to-edge" | "mirror-repeat";
  wrapT: "repeat" | "clamp-to-edge" | "mirror-repeat";
  filter: "nearest" | "linear";
  /** Optional mip chain (level 0 = full res). */
  mips?: Uint8Array[];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function wrapCoord(v: number, mode: LoadedTexture["wrapS"]): number {
  if (mode === "clamp-to-edge") return clamp01(v);
  if (mode === "mirror-repeat") {
    const f = Math.floor(v);
    const frac = v - f;
    return (f & 1) === 0 ? frac : 1 - frac;
  }
  return v - Math.floor(v);
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// --- Minimal PNG decode (8-bit RGB/RGBA) ---
const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngRgba(buffer: Uint8Array): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  if (buffer.length < 8) throw new Error("PNG too short");
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIG[i]) throw new Error("Invalid PNG signature");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idats: Uint8Array[] = [];
  while (offset + 8 <= buffer.length) {
    const length = readU32BE(buffer, offset);
    const type = String.fromCharCode(
      buffer[offset + 4]!,
      buffer[offset + 5]!,
      buffer[offset + 6]!,
      buffer[offset + 7]!,
    );
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readU32BE(data, 0);
      height = readU32BE(data, 4);
      const bitDepth = data[8]!;
      colorType = data[9]!;
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || idats.length === 0) throw new Error("PNG missing IHDR/IDAT");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  let total = 0;
  for (const c of idats) total += c.length;
  const compressed = new Uint8Array(total);
  let o = 0;
  for (const c of idats) {
    compressed.set(c, o);
    o += c.length;
  }
  const raw = inflateSync(compressed);
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    const filter = raw[rowOff]!;
    const row = raw.subarray(rowOff + 1, rowOff + 1 + stride);
    const out = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawVal = row[x]!;
      const a = x >= channels ? out[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let v = rawVal;
      if (filter === 1) v = (rawVal + a) & 0xff;
      else if (filter === 2) v = (rawVal + b) & 0xff;
      else if (filter === 3) v = (rawVal + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (rawVal + paeth(a, b, c)) & 0xff;
      out[x] = v;
    }
    prev.set(out);
    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (channels === 4) {
        rgba[dst] = out[src]!;
        rgba[dst + 1] = out[src + 1]!;
        rgba[dst + 2] = out[src + 2]!;
        rgba[dst + 3] = out[src + 3]!;
      } else if (channels === 3) {
        rgba[dst] = out[src]!;
        rgba[dst + 1] = out[src + 1]!;
        rgba[dst + 2] = out[src + 2]!;
        rgba[dst + 3] = 255;
      } else if (channels === 2) {
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = out[src]!;
        rgba[dst + 3] = out[src + 1]!;
      } else {
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = out[src]!;
        rgba[dst + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

function buildMips(width: number, height: number, rgba: Uint8Array): Uint8Array[] {
  const mips: Uint8Array[] = [rgba];
  let w = width;
  let h = height;
  let src = rgba;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const dst = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const x0 = Math.min(w - 1, x * 2);
        const y0 = Math.min(h - 1, y * 2);
        const x1 = Math.min(w - 1, x0 + 1);
        const y1 = Math.min(h - 1, y0 + 1);
        const i00 = (y0 * w + x0) * 4;
        const i10 = (y0 * w + x1) * 4;
        const i01 = (y1 * w + x0) * 4;
        const i11 = (y1 * w + x1) * 4;
        const o = (y * nw + x) * 4;
        for (let c = 0; c < 4; c++) {
          dst[o + c] = Math.round(
            (src[i00 + c]! + src[i10 + c]! + src[i01 + c]! + src[i11 + c]!) * 0.25,
          );
        }
      }
    }
    mips.push(dst);
    src = dst;
    w = nw;
    h = nh;
    if (mips.length > 12) break;
  }
  return mips;
}

function proceduralPixels(
  id: string,
  role: TextureRole | undefined,
  width: number,
  height: number,
): Uint8Array {
  const seed = createHash("sha256").update(id).digest();
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const checker = ((x >> 3) + (y >> 3)) & 1;
      if (role === "normal") {
        out[i] = 128;
        out[i + 1] = 128;
        out[i + 2] = 255;
        out[i + 3] = 255;
      } else if (role === "roughness" || role === "metallic" || role === "ao") {
        const v = role === "ao" ? 220 : role === "metallic" ? (checker ? 40 : 200) : 90 + checker * 40;
        out[i] = out[i + 1] = out[i + 2] = v;
        out[i + 3] = 255;
      } else if (role === "emissive") {
        out[i] = seed[0]!;
        out[i + 1] = seed[1]!;
        out[i + 2] = seed[2]!;
        out[i + 3] = 255;
      } else {
        const t = checker ? 1 : 0.7;
        out[i] = Math.round(seed[0]! * t);
        out[i + 1] = Math.round(seed[1]! * t);
        out[i + 2] = Math.round(seed[2]! * t);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

export function loadTextureAsset(
  asset: TextureAsset,
  resolveRoots: string[] = [],
): LoadedTexture {
  const wrapS = asset.sampler?.wrapS ?? "repeat";
  const wrapT = asset.sampler?.wrapT ?? "repeat";
  const filter =
    asset.sampler?.magFilter === "nearest" || asset.sampler?.minFilter === "nearest"
      ? "nearest"
      : "linear";

  let rgba: Uint8Array | null = null;
  let width = asset.width;
  let height = asset.height;

  if (asset.decodedPixels && asset.decodedPixels.length >= width * height * 4) {
    rgba = asset.decodedPixels instanceof Uint8Array
      ? asset.decodedPixels
      : new Uint8Array(asset.decodedPixels);
  } else if (asset.embeddedBytes && asset.embeddedBytes.length > 8) {
    const decoded = decodePngRgba(
      asset.embeddedBytes instanceof Uint8Array
        ? asset.embeddedBytes
        : new Uint8Array(asset.embeddedBytes),
    );
    rgba = decoded.rgba;
    width = decoded.width;
    height = decoded.height;
  } else if (asset.uri) {
    const candidates = [asset.uri, ...resolveRoots.map((r) => `${r.replace(/[/\\]$/, "")}/${asset.uri}`)];
    for (const p of candidates) {
      if (existsSync(p)) {
        const decoded = decodePngRgba(readFileSync(p));
        rgba = decoded.rgba;
        width = decoded.width;
        height = decoded.height;
        break;
      }
    }
  }

  if (!rgba) {
    width = Math.max(8, width || 64);
    height = Math.max(8, height || 64);
    rgba = proceduralPixels(asset.id, asset.role, width, height);
  }

  // Convert sRGB color maps to linear storage for shading.
  if ((asset.colorSpace ?? "srgb") === "srgb" && (asset.role === "color" || !asset.role)) {
    const lin = new Uint8Array(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      lin[i] = Math.round(srgbToLinear(rgba[i]! / 255) * 255);
      lin[i + 1] = Math.round(srgbToLinear(rgba[i + 1]! / 255) * 255);
      lin[i + 2] = Math.round(srgbToLinear(rgba[i + 2]! / 255) * 255);
      lin[i + 3] = rgba[i + 3]!;
    }
    rgba = lin;
  }

  const mips =
    asset.sampler?.minFilter === "mipmap-linear" ? buildMips(width, height, rgba) : undefined;

  return {
    id: asset.id,
    role: asset.role,
    width,
    height,
    pixels: rgba,
    colorSpace: "linear",
    wrapS,
    wrapT,
    filter,
    mips,
  };
}

function texelNearest(tex: LoadedTexture, level: number, x: number, y: number): Rgba {
  const pixels = tex.mips?.[level] ?? tex.pixels;
  let w = tex.width;
  let h = tex.height;
  for (let i = 0; i < level; i++) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  const xx = Math.min(w - 1, Math.max(0, x));
  const yy = Math.min(h - 1, Math.max(0, y));
  const i = (yy * w + xx) * 4;
  return [pixels[i]! / 255, pixels[i + 1]! / 255, pixels[i + 2]! / 255, pixels[i + 3]! / 255];
}

/** Bilinear sample (max quality without GPU anisotropic). */
export function sampleTexture(
  tex: LoadedTexture,
  u: number,
  v: number,
  lod = 0,
): Rgba {
  const uu = wrapCoord(u, tex.wrapS);
  const vv = wrapCoord(v, tex.wrapT);
  const level = Math.max(0, Math.min((tex.mips?.length ?? 1) - 1, Math.floor(lod)));
  let w = tex.width;
  let h = tex.height;
  for (let i = 0; i < level; i++) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  if (tex.filter === "nearest") {
    return texelNearest(
      tex,
      level,
      Math.floor(uu * w),
      Math.floor(vv * h),
    );
  }
  const x = uu * w - 0.5;
  const y = vv * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const c00 = texelNearest(tex, level, x0, y0);
  const c10 = texelNearest(tex, level, x0 + 1, y0);
  const c01 = texelNearest(tex, level, x0, y0 + 1);
  const c11 = texelNearest(tex, level, x0 + 1, y0 + 1);
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return [
    mix(mix(c00[0], c10[0], fx), mix(c01[0], c11[0], fx), fy),
    mix(mix(c00[1], c10[1], fx), mix(c01[1], c11[1], fx), fy),
    mix(mix(c00[2], c10[2], fx), mix(c01[2], c11[2], fx), fy),
    mix(mix(c00[3], c10[3], fx), mix(c01[3], c11[3], fx), fy),
  ];
}

export class TextureBinder {
  private readonly byId = new Map<string, LoadedTexture>();

  register(tex: LoadedTexture): void {
    this.byId.set(tex.id, tex);
  }

  loadAll(assets: readonly TextureAsset[], resolveRoots: string[] = []): void {
    for (const a of assets) this.register(loadTextureAsset(a, resolveRoots));
  }

  get(id: string): LoadedTexture | undefined {
    return this.byId.get(id);
  }

  /**
   * Sample all bound maps for a material at UV; apply tangent-space normal map.
   */
  sampleMaps(
    material: RasterMaterial,
    textureRefs: readonly TextureRef[] | undefined,
    uv: readonly [number, number],
    geometricNormal: Vec3,
    lod = 0,
  ): SampledMaps {
    const out: SampledMaps = {};
    if (!textureRefs?.length) return out;
    let normalSample: Rgba | null = null;

    for (const ref of textureRefs) {
      const tex = this.byId.get(ref.id);
      if (!tex) continue;
      const s = sampleTexture(tex, uv[0], uv[1], lod);
      if (ref.role === "color") {
        out.albedo = [
          material.baseColor[0] * s[0],
          material.baseColor[1] * s[1],
          material.baseColor[2] * s[2],
        ];
      } else if (ref.role === "roughness") {
        out.roughness = clamp01(s[0]);
      } else if (ref.role === "metallic") {
        out.metallic = clamp01(s[0]);
      } else if (ref.role === "emissive") {
        out.emissive = [
          material.emissive[0] + s[0],
          material.emissive[1] + s[1],
          material.emissive[2] + s[2],
        ];
      } else if (ref.role === "ao") {
        out.ao = clamp01(s[0]);
      } else if (ref.role === "normal") {
        normalSample = s;
      }
    }

    if (normalSample) {
      // Tangent-space normal → world (approx TBN from geometric normal).
      const nx = normalSample[0] * 2 - 1;
      const ny = normalSample[1] * 2 - 1;
      const nz = normalSample[2] * 2 - 1;
      const [gx, gy, gz] = geometricNormal;
      // Build arbitrary tangent
      const ax = Math.abs(gx) < 0.9 ? 1 : 0;
      let tx = gy * 0 - gz * ax;
      let ty = gz * ax - gx * 0;
      let tz = gx * ax - gy * 0;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const bx = gy * tz - gz * ty;
      const by = gz * tx - gx * tz;
      const bz = gx * ty - gy * tx;
      let wx = tx * nx + bx * ny + gx * nz;
      let wy = ty * nx + by * ny + gy * nz;
      let wz = tz * nx + bz * ny + gz * nz;
      const wl = Math.hypot(wx, wy, wz) || 1;
      out.normal = [wx / wl, wy / wl, wz / wl];
    }
    return out;
  }
}

/** Build TextureAssets from UniversalMaterial textureRefs (procedural if missing). */
export function ensureTextureAssetsForMaterials(
  materials: readonly UniversalMaterial[],
  existing: readonly TextureAsset[] = [],
): TextureAsset[] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const m of materials) {
    for (const ref of m.textureRefs ?? []) {
      if (byId.has(ref.id)) continue;
      byId.set(ref.id, {
        id: ref.id,
        role: ref.role,
        width: 64,
        height: 64,
        format: ref.role === "normal" ? "normal-rgb8" : "rgba8",
        colorSpace: ref.role === "color" ? "srgb" : "linear",
        checksum: `proc:${ref.id}`,
      });
    }
  }
  return [...byId.values()];
}

export function applySampledMapsToMaterial(
  base: RasterMaterial,
  maps: SampledMaps,
): RasterMaterial {
  return {
    ...base,
    baseColor: maps.albedo ?? base.baseColor,
    roughness: maps.roughness ?? base.roughness,
    metallic: maps.metallic ?? base.metallic,
    emissive: maps.emissive ?? base.emissive,
  };
}
