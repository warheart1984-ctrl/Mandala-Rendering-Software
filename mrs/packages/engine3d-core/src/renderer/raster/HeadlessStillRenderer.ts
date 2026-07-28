/**
 * Headless still rasterizer (CPU soft-raster).
 *
 * Drive-G-1 / ENGINE3D_CONSTITUTIONAL_SUITE_v1.0:
 *   Produces beauty + optional depth/normal AOVs from triangle meshes.
 *   This is the portrait *structure* source — not RT4D sphere soup and not diffusion.
 *
 * Status: **prepared / enforced by tests** for box + camera invariants.
 * Native WebGL (`gl`) is optional; CPU path is the Node/CI default.
 */

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { transformPoint, transformVector, normalize3 } from "../../human/mat4.js";
import type { Mat4Tuple } from "../../human/HumanRigTypes.js";
import { shadeRasterFragment } from "./RasterMaterial.js";
import {
  applySampledMapsToMaterial,
  type TextureBinder,
} from "./TextureSampler.js";

export type Vec3 = readonly [number, number, number];

export interface RasterCamera {
  id: string;
  eye: Vec3;
  lookAt: Vec3;
  up: Vec3;
  /** Vertical FOV in radians. */
  fovY: number;
  near: number;
  far: number;
  width: number;
  height: number;
}

export interface RasterMesh {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array | Uint16Array;
  /** Column-major 4x4 model matrix. */
  modelMatrix: Mat4Tuple;
  baseColor: Vec3;
  /** Optional material for shadeRasterFragment (STATUS: enforced when present). */
  material?: import("./RasterMaterial.js").RasterMaterial;
  /** Optional UV0; texture sampling deferred (STATUS: declared / gap). */
  uvs?: Float32Array;
}

export interface RasterStillRequest {
  camera: RasterCamera;
  meshes: RasterMesh[];
  lightDir?: Vec3;
  aov?: { depth?: boolean; normal?: boolean };
  /** Clear color for beauty (linear RGB 0–1). Default dark gray. */
  clearColor?: Vec3;
  /**
   * Optional texture binder for per-pixel UV sampling when meshes carry `uvs`
   * and materials list `textureRefs`. Status: **enforced** by texture-uv tests.
   */
  textures?: TextureBinder;
}

export interface RasterStillBuffers {
  width: number;
  height: number;
  beautyRgba: Uint8Array;
  depthRgba?: Uint8Array;
  normalRgba?: Uint8Array;
}

export interface RasterStillFiles {
  beautyPath: string;
  depthPath?: string;
  normalPath?: string;
  beautySha256: string;
  depthSha256?: string;
  normalSha256?: string;
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4Tuple {
  const [fx, fy, fz] = normalize3(
    target[0] - eye[0],
    target[1] - eye[1],
    target[2] - eye[2],
  );
  const [sx, sy, sz] = normalize3(
    fy * up[2] - fz * up[1],
    fz * up[0] - fx * up[2],
    fx * up[1] - fy * up[0],
  );
  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;
  return [
    sx, ux, -fx, 0,
    sy, uy, -fy, 0,
    sz, uz, -fz, 0,
    -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    -(-fx * eye[0] - fy * eye[1] - fz * eye[2]),
    1,
  ];
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4Tuple {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

function mulMat4(a: Mat4Tuple, b: Mat4Tuple): Mat4Tuple {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  }
  return out as unknown as Mat4Tuple;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  const table = CRC_TABLE;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA8 buffer as PNG bytes (filter None). */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function validateCamera(camera: RasterCamera): void {
  if (camera.width <= 0 || camera.height <= 0) {
    throw new Error("RasterCamera width/height must be > 0");
  }
  if (!(camera.near > 0) || !(camera.far > camera.near)) {
    throw new Error("RasterCamera near must be > 0 and far > near");
  }
  if (!(camera.fovY > 0) || camera.fovY >= Math.PI) {
    throw new Error("RasterCamera fovY must be in (0, π)");
  }
}

type ClipV = {
  x: number;
  y: number;
  z: number;
  w: number;
  nx: number;
  ny: number;
  nz: number;
  r: number;
  g: number;
  b: number;
  u: number;
  v: number;
  wx: number;
  wy: number;
  wz: number;
};

function edge(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

/**
 * CPU soft-raster: Lambert beauty + geometric depth/normal AOVs.
 */
export function renderStillBuffers(req: RasterStillRequest): RasterStillBuffers {
  validateCamera(req.camera);
  const { camera, meshes } = req;
  const w = camera.width | 0;
  const h = camera.height | 0;
  const wantDepth = req.aov?.depth !== false;
  const wantNormal = req.aov?.normal !== false;
  const clear = req.clearColor ?? ([0.12, 0.13, 0.16] as Vec3);
  const light = normalize3(
    ...(req.lightDir ?? ([-0.35, -1.0, -0.45] as Vec3)),
  );

  const beauty = new Uint8Array(w * h * 4);
  const depthBuf = wantDepth ? new Uint8Array(w * h * 4) : undefined;
  const normalBuf = wantNormal ? new Uint8Array(w * h * 4) : undefined;
  const zBuf = new Float32Array(w * h);
  zBuf.fill(Number.POSITIVE_INFINITY);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    beauty[o] = Math.round(clear[0] * 255);
    beauty[o + 1] = Math.round(clear[1] * 255);
    beauty[o + 2] = Math.round(clear[2] * 255);
    beauty[o + 3] = 255;
    if (depthBuf) {
      depthBuf[o] = depthBuf[o + 1] = depthBuf[o + 2] = 255;
      depthBuf[o + 3] = 255;
    }
    if (normalBuf) {
      normalBuf[o] = 128;
      normalBuf[o + 1] = 128;
      normalBuf[o + 2] = 255;
      normalBuf[o + 3] = 255;
    }
  }

  const view = lookAt(camera.eye, camera.lookAt, camera.up);
  const proj = perspective(camera.fovY, w / h, camera.near, camera.far);
  const viewProj = mulMat4(proj, view);

  for (const mesh of meshes) {
    const vp = mesh.positions;
    const vn = mesh.normals;
    const idx = mesh.indices;
    const model = mesh.modelMatrix;
    const mvp = mulMat4(viewProj, model);
    const triCount = Math.floor(idx.length / 3);
    const uvs = mesh.uvs;
    const wantTex =
      !!req.textures &&
      !!mesh.material &&
      (mesh.material.textureRefs?.length ?? 0) > 0 &&
      !!uvs &&
      uvs.length >= (vp.length / 3) * 2;

    for (let t = 0; t < triCount; t++) {
      const i0 = idx[t * 3]! * 3;
      const i1 = idx[t * 3 + 1]! * 3;
      const i2 = idx[t * 3 + 2]! * 3;
      const vi0 = idx[t * 3]!;
      const vi1 = idx[t * 3 + 1]!;
      const vi2 = idx[t * 3 + 2]!;
      const verts: ClipV[] = [];
      for (const [ii, vi] of [
        [i0, vi0],
        [i1, vi1],
        [i2, vi2],
      ] as const) {
        const px = vp[ii] ?? 0;
        const py = vp[ii + 1] ?? 0;
        const pz = vp[ii + 2] ?? 0;
        const [wx, wy, wz] = transformPoint(model, px, py, pz);
        const [nx, ny, nz] = normalize3(
          ...transformVector(model, vn[ii] ?? 0, vn[ii + 1] ?? 0, vn[ii + 2] ?? 1),
        );
        // Clip-space via MVP
        const x = mvp[0]! * px + mvp[4]! * py + mvp[8]! * pz + mvp[12]!;
        const y = mvp[1]! * px + mvp[5]! * py + mvp[9]! * pz + mvp[13]!;
        const z = mvp[2]! * px + mvp[6]! * py + mvp[10]! * pz + mvp[14]!;
        const cw = mvp[3]! * px + mvp[7]! * py + mvp[11]! * pz + mvp[15]!;
        const ndl = Math.max(0, -(nx * light[0] + ny * light[1] + nz * light[2]));
        let r: number;
        let g: number;
        let b: number;
        if (mesh.material && !wantTex) {
          // View approx: toward camera from vertex (eye - worldPos)
          const viewDir: Vec3 = normalize3(
            camera.eye[0] - wx,
            camera.eye[1] - wy,
            camera.eye[2] - wz,
          );
          const rgb = shadeRasterFragment(
            mesh.material,
            [nx, ny, nz],
            light,
            viewDir,
          );
          r = rgb[0];
          g = rgb[1];
          b = rgb[2];
        } else if (!wantTex) {
          // Legacy Lambert: baseColor * (0.2 + 0.8 * ndl)
          const shade = 0.2 + 0.8 * ndl;
          r = mesh.baseColor[0] * shade;
          g = mesh.baseColor[1] * shade;
          b = mesh.baseColor[2] * shade;
        } else {
          // Per-pixel texture path shades in the fragment loop.
          r = 1;
          g = 1;
          b = 1;
        }
        const uOff = vi * 2;
        verts.push({
          x,
          y,
          z,
          w: cw,
          nx,
          ny,
          nz,
          r,
          g,
          b,
          u: wantTex ? (uvs![uOff] ?? 0) : 0,
          v: wantTex ? (uvs![uOff + 1] ?? 0) : 0,
          wx,
          wy,
          wz,
        });
      }

      // Perspective divide → NDC → screen
      const scr: Array<{
        sx: number;
        sy: number;
        zndc: number;
        invW: number;
        nx: number;
        ny: number;
        nz: number;
        r: number;
        g: number;
        b: number;
        u: number;
        v: number;
        wx: number;
        wy: number;
        wz: number;
      }> = [];
      let behind = false;
      for (const v of verts) {
        if (Math.abs(v.w) < 1e-8) {
          behind = true;
          break;
        }
        const invW = 1 / v.w;
        const ndcX = v.x * invW;
        const ndcY = v.y * invW;
        const ndcZ = v.z * invW;
        if (ndcZ < -1 || ndcZ > 1) {
          // soft clip: still draw if partially in front
        }
        scr.push({
          sx: (ndcX * 0.5 + 0.5) * w,
          sy: (1 - (ndcY * 0.5 + 0.5)) * h,
          zndc: ndcZ,
          invW,
          nx: v.nx,
          ny: v.ny,
          nz: v.nz,
          r: v.r,
          g: v.g,
          b: v.b,
          u: v.u,
          v: v.v,
          wx: v.wx,
          wy: v.wy,
          wz: v.wz,
        });
      }
      if (behind || scr.length !== 3) continue;

      const a = scr[0]!;
      const b = scr[1]!;
      const c = scr[2]!;
      const area = edge(a.sx, a.sy, b.sx, b.sy, c.sx, c.sy);
      if (Math.abs(area) < 1e-6) continue;
      // Back-face cull (screen space winding)
      if (area < 0) continue;

      const minX = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
      const minY = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const cy = py + 0.5;
          const w0 = edge(b.sx, b.sy, c.sx, c.sy, cx, cy);
          const w1 = edge(c.sx, c.sy, a.sx, a.sy, cx, cy);
          const w2 = edge(a.sx, a.sy, b.sx, b.sy, cx, cy);
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const invA = 1 / area;
          const b0 = w0 * invA;
          const b1 = w1 * invA;
          const b2 = w2 * invA;
          const zndc = b0 * a.zndc + b1 * b.zndc + b2 * c.zndc;
          const pix = py * w + px;
          if (zndc >= zBuf[pix]!) continue;
          zBuf[pix] = zndc;

          const o = pix * 4;
          let rr: number;
          let gg: number;
          let bb: number;
          if (wantTex && mesh.material && req.textures) {
            const u = b0 * a.u + b1 * b.u + b2 * c.u;
            const v = b0 * a.v + b1 * b.v + b2 * c.v;
            const nx = b0 * a.nx + b1 * b.nx + b2 * c.nx;
            const ny = b0 * a.ny + b1 * b.ny + b2 * c.ny;
            const nz = b0 * a.nz + b1 * b.nz + b2 * c.nz;
            const [nnx, nny, nnz] = normalize3(nx, ny, nz);
            const wx = b0 * a.wx + b1 * b.wx + b2 * c.wx;
            const wy = b0 * a.wy + b1 * b.wy + b2 * c.wy;
            const wz = b0 * a.wz + b1 * b.wz + b2 * c.wz;
            const maps = req.textures.sampleMaps(
              mesh.material,
              mesh.material.textureRefs,
              [u, v],
              [nnx, nny, nnz],
            );
            const shadedMat = applySampledMapsToMaterial(mesh.material, maps);
            const nUse = maps.normal ?? ([nnx, nny, nnz] as Vec3);
            const viewDir = normalize3(
              camera.eye[0] - wx,
              camera.eye[1] - wy,
              camera.eye[2] - wz,
            );
            const rgb = shadeRasterFragment(shadedMat, nUse, light, viewDir);
            const ao = maps.ao ?? 1;
            rr = rgb[0] * ao;
            gg = rgb[1] * ao;
            bb = rgb[2] * ao;
          } else {
            rr = b0 * a.r + b1 * b.r + b2 * c.r;
            gg = b0 * a.g + b1 * b.g + b2 * c.g;
            bb = b0 * a.b + b1 * b.b + b2 * c.b;
          }
          beauty[o] = Math.max(0, Math.min(255, Math.round(rr * 255)));
          beauty[o + 1] = Math.max(0, Math.min(255, Math.round(gg * 255)));
          beauty[o + 2] = Math.max(0, Math.min(255, Math.round(bb * 255)));
          beauty[o + 3] = 255;

          if (depthBuf) {
            // Map NDC z [-1,1] → [0,1] then grayscale (near = dark)
            const d = Math.max(0, Math.min(1, zndc * 0.5 + 0.5));
            const g8 = Math.round(d * 255);
            depthBuf[o] = depthBuf[o + 1] = depthBuf[o + 2] = g8;
            depthBuf[o + 3] = 255;
          }
          if (normalBuf) {
            const nx = b0 * a.nx + b1 * b.nx + b2 * c.nx;
            const ny = b0 * a.ny + b1 * b.ny + b2 * c.ny;
            const nz = b0 * a.nz + b1 * b.nz + b2 * c.nz;
            const [nnx, nny, nnz] = normalize3(nx, ny, nz);
            normalBuf[o] = Math.round((nnx * 0.5 + 0.5) * 255);
            normalBuf[o + 1] = Math.round((nny * 0.5 + 0.5) * 255);
            normalBuf[o + 2] = Math.round((nnz * 0.5 + 0.5) * 255);
            normalBuf[o + 3] = 255;
          }
        }
      }
    }
  }

  return {
    width: w,
    height: h,
    beautyRgba: beauty,
    depthRgba: depthBuf,
    normalRgba: normalBuf,
  };
}

/** Write AOV PNGs to disk; returns paths + digests. */
export function writeStillPngs(
  buffers: RasterStillBuffers,
  outDir: string,
  prefix = "",
): RasterStillFiles {
  const beautyPng = encodePngRgba(buffers.width, buffers.height, buffers.beautyRgba);
  const beautyPath = `${outDir.replace(/[/\\]$/, "")}/${prefix}beauty.png`;
  writeFileSync(beautyPath, beautyPng);
  const result: RasterStillFiles = {
    beautyPath,
    beautySha256: sha256Hex(beautyPng),
  };
  if (buffers.depthRgba) {
    const depthPng = encodePngRgba(buffers.width, buffers.height, buffers.depthRgba);
    result.depthPath = `${outDir.replace(/[/\\]$/, "")}/${prefix}depth.png`;
    writeFileSync(result.depthPath, depthPng);
    result.depthSha256 = sha256Hex(depthPng);
  }
  if (buffers.normalRgba) {
    const normalPng = encodePngRgba(buffers.width, buffers.height, buffers.normalRgba);
    result.normalPath = `${outDir.replace(/[/\\]$/, "")}/${prefix}normal.png`;
    writeFileSync(result.normalPath, normalPng);
    result.normalSha256 = sha256Hex(normalPng);
  }
  return result;
}

/** Alias matching the plan name. */
export class HeadlessGLStillRenderer {
  constructor(private readonly req: RasterStillRequest) {}

  renderBuffers(): RasterStillBuffers {
    return renderStillBuffers(this.req);
  }

  renderToDir(outDir: string, prefix = ""): RasterStillFiles {
    return writeStillPngs(this.renderBuffers(), outDir, prefix);
  }
}
