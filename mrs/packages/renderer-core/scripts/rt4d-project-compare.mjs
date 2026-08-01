#!/usr/bin/env node
/**
 * RT4D hit dump → Projector4D (α=1/d4) vs drop_w → same Engine3D soft-raster plate.
 *
 * Status: **partial** evidence runner (structure lane). Does NOT touch Print SoT /
 * Digital Printer. Reference models are evaluated through evidence, not crowned a priori.
 * No universal winner: Projector4D = 4D story candidate; drop_w = literal debug.
 *
 * Usage:
 *   node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs
 *   node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs --out-dir tmp/rt4d-project-compare
 *   node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs --pole-stress
 *   node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs --scene rich
 *
 * Provenance: every artifact carries projector_id / projection_method
 * (`projector4d-sot` | `drop_w`).
 * Contract: docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { Projector4D } from "../src/render/rt4d/output/projector.js";
import { Scene4D } from "../src/render/rt4d/scene/Scene4D.js";
import { Hypersphere } from "../src/render/rt4d/geometry/hypersurface.js";
import { vec4, normalize, sub } from "../src/render/rt4d/math/vec4.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, "..");
const REPO = join(PKG, "..", "..", "..");
const E3D = join(PKG, "..", "engine3d-core");

const D4 = 4;
const ALPHA = 1 / D4;
const WIDTH = 320;
const HEIGHT = 240;
const SEED = 7;
/** Structure-lane reject ε near pole w=-d4 (does not mutate Print SoT). */
const POLE_EPS = D4 * 0.05;

const PROVENANCE_SCHEMA = "rt4d-project-compare/1.0";
const EVALUATION_STANCE = [
  "Experiment valuable: same hits/camera/scene ⇒ differences attributable to projection model.",
  "Projector4D communicates 4th dim via foreshortening/depth; drop_w is literal XYZ (weaker 4th-axis story).",
  "Provenance of method/reference model ⇒ replayable comparisons.",
  "No universal winner — Projector4D for storytelling; drop_w for debug/literal inspection.",
  "Multi-lane: not one projector for every use case. Print SoT / Digital Printer untouched.",
  "Default anime-structure promotion of Projector4D remains **declared** until richer evidence.",
];

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sha256Json(obj) {
  return sha256Bytes(Buffer.from(JSON.stringify(obj), "utf8"));
}

function provenance(method, extra = {}) {
  const reference_model =
    method === "projector4d-sot"
      ? "(x',y',z') = (d4/(d4+w)) * (x,y,z)"
      : "(x',y',z') = (x,y,z)";
  return {
    schema: PROVENANCE_SCHEMA,
    projector_id: method,
    projection_method: method,
    reference_model,
    alpha: method === "projector4d-sot" ? ALPHA : null,
    d4: method === "projector4d-sot" ? D4 : null,
    lane: "anime-structure",
    print_sot_touched: false,
    digital_printer_touched: false,
    ...extra,
  };
}

function projectDropW(p) {
  return { x: p.x, y: p.y, z: p.z };
}

function projectProjector4D(p, projector) {
  const q = projector.project4Dto3D(p);
  return { x: q.x, y: q.y, z: q.z };
}

function buildAnimeStructureScene(sceneKind = "sparse") {
  const scene = new Scene4D();
  // Structure arc: same xyz footprint, stepped w → foreshortening differs by projector.
  const centers = [
    vec4(-1.2, 0.0, 0.2, -1.5),
    vec4(-0.6, 0.35, 0.0, -0.8),
    vec4(0.0, 0.5, -0.1, 0.0),
    vec4(0.6, 0.35, 0.0, 0.8),
    vec4(1.2, 0.0, 0.2, 1.5),
    vec4(0.0, -0.4, 0.4, -2.2),
    vec4(0.9, -0.2, -0.3, 2.0),
  ];
  const radii = [0.45, 0.38, 0.5, 0.38, 0.45, 0.32, 0.28];
  if (sceneKind === "rich") {
    // Denser scaffold for comprehension compare — still not full ink-cel pipeline.
    const extras = [
      vec4(-1.5, 0.6, 0.3, -2.8),
      vec4(1.5, 0.6, -0.2, 2.8),
      vec4(-0.3, -0.7, 0.5, -3.2),
      vec4(0.4, 0.8, -0.4, 3.0),
      vec4(0.0, 0.0, 0.0, -1.0),
      vec4(-0.9, 0.2, 0.1, 1.2),
      vec4(1.0, -0.5, 0.2, -0.4),
      vec4(-0.2, 0.3, -0.5, 2.4),
    ];
    const extraR = [0.22, 0.22, 0.18, 0.2, 0.55, 0.3, 0.26, 0.24];
    for (let i = 0; i < extras.length; i++) {
      centers.push(extras[i]);
      radii.push(extraR[i]);
    }
  }
  for (let i = 0; i < centers.length; i++) {
    scene.addPrimitive(new Hypersphere(centers[i], radii[i]), `body-${i}`);
  }
  scene.build();
  return { scene, centers, radii, scene_kind: sceneKind };
}

/**
 * Deterministic RT4D hit dump.
 * Mix: (1) surface samples on each hypersphere (guarantees w spread for foreshortening),
 * (2) sparse ray grid with w-aim so intersections are not stuck on the w=0 plane.
 */
function dumpHits(scene, centers, radii, grid = 8) {
  const origin = vec4(0, 0.2, -3.2, 0.4);
  /** @type {Array<Record<string, unknown>>} */
  const hits = [];
  let id = 0;

  // Surface samples — primary evidence for w-dependent foreshortening.
  const dirs = [
    [1, 0, 0, 0],
    [-1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, -1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, -1, 0],
    [0, 0, 0, 1],
    [0, 0, 0, -1],
    [0.5, 0.5, 0.5, 0.5],
    [-0.5, 0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5, 0.5],
  ];
  for (let si = 0; si < centers.length; si++) {
    const c = centers[si];
    const r = radii[si];
    for (const d of dirs) {
      const n = normalize(vec4(d[0], d[1], d[2], d[3]));
      const pos = vec4(
        c.x + n.x * r,
        c.y + n.y * r,
        c.z + n.z * r,
        c.w + n.w * r,
      );
      hits.push({
        id: id++,
        t: null,
        sample_kind: "surface",
        position: { x: pos.x, y: pos.y, z: pos.z, w: pos.w },
        normal: { x: n.x, y: n.y, z: n.z, w: n.w },
        materialId: `body-${si}`,
      });
    }
  }

  // Ray grid with intentional w-target variation.
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const u = (i + 0.5) / grid - 0.5;
      const v = (j + 0.5) / grid - 0.5;
      const wAim = ((i + j) / (2 * grid) - 0.5) * 3.2;
      const target = vec4(u * 3.2, v * 2.4, 0.2, wAim);
      const direction = normalize(sub(target, origin));
      const ray = { origin, direction, tMin: 1e-4, tMax: 100 };
      const hit = scene.intersect(ray);
      if (!hit) continue;
      hits.push({
        id: id++,
        t: hit.t,
        sample_kind: "ray",
        position: {
          x: hit.position.x,
          y: hit.position.y,
          z: hit.position.z,
          w: hit.position.w,
        },
        normal: {
          x: hit.normal.x,
          y: hit.normal.y,
          z: hit.normal.z,
          w: hit.normal.w,
        },
        materialId: hit.materialId ?? null,
        ray_uv: [u, v],
        ray_w_aim: wAim,
      });
    }
  }
  return { origin: { x: origin.x, y: origin.y, z: origin.z, w: origin.w }, hits };
}

/**
 * Project hits. For projector4d-sot, structure-lane policy rejects near pole
 * (|d4+w| < POLE_EPS) — does not mutate Print SoT Projector4D.
 * @returns {{ projected: object[], rejected: number, non_finite: number, accepted: number }}
 */
function projectHitSet(hits, method, projector, { rejectNearPole = false } = {}) {
  const projected = [];
  let rejected = 0;
  let non_finite = 0;
  for (const h of hits) {
    const p = h.position;
    if (method === "projector4d-sot" && rejectNearPole) {
      const denom = D4 + p.w;
      if (!Number.isFinite(denom) || Math.abs(denom) < POLE_EPS) {
        rejected += 1;
        continue;
      }
    }
    const p3 =
      method === "projector4d-sot"
        ? projectProjector4D(p, projector)
        : projectDropW(p);
    const scale = method === "projector4d-sot" ? D4 / (D4 + p.w) : 1;
    const finite =
      Number.isFinite(p3.x) &&
      Number.isFinite(p3.y) &&
      Number.isFinite(p3.z) &&
      Number.isFinite(scale);
    if (!finite) {
      non_finite += 1;
      if (rejectNearPole) {
        rejected += 1;
        continue;
      }
    }
    projected.push({
      id: h.id,
      xyzw: [p.x, p.y, p.z, p.w],
      xyz: [p3.x, p3.y, p3.z],
      w_scale: scale,
      materialId: h.materialId,
      finite,
    });
  }
  return {
    projected,
    rejected,
    non_finite,
    accepted: projected.length,
  };
}

/** Raw SoT projection without reject — for pole diagnostics only. */
function projectRawProjector4D(p, projector) {
  const p3 = projectProjector4D(p, projector);
  const denom = D4 + p.w;
  const scale = denom === 0 ? Infinity : D4 / denom;
  return {
    xyz: [p3.x, p3.y, p3.z],
    w_scale: scale,
    denom,
    finite:
      Number.isFinite(p3.x) &&
      Number.isFinite(p3.y) &&
      Number.isFinite(p3.z) &&
      Number.isFinite(scale),
  };
}

function metrics(projected) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumR = 0;
  const radii = [];
  for (const p of projected) {
    const [x, y, z] = p.xyz;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    const r = Math.hypot(x, y, z);
    radii.push(r);
    sumR += r;
  }
  const n = projected.length || 1;
  const meanR = sumR / n;
  const varR =
    radii.reduce((acc, r) => acc + (r - meanR) ** 2, 0) / n;
  // Pairwise xy-spread vs z-range as crude depth / silhouette proxies.
  const spanXY = Math.hypot(maxX - minX, maxY - minY);
  const spanZ = maxZ - minZ;
  const scaleSpread = projected.reduce(
    (acc, p) => acc + Math.abs((p.w_scale ?? 1) - 1),
    0,
  ) / n;
  return {
    count: projected.length,
    bbox: { minX, maxX, minY, maxY, minZ, maxZ },
    span_xy: spanXY,
    span_z: spanZ,
    mean_radius: meanR,
    radius_variance: varR,
    mean_abs_scale_delta: scaleSpread,
  };
}

function translateMat4(x, y, z, s = 1) {
  // Column-major Mat4Tuple
  return [
    s, 0, 0, 0,
    0, s, 0, 0,
    0, 0, s, 0,
    x, y, z, 1,
  ];
}

/** Minimal PNG encoder (RGBA8) — fallback when Engine3D dist absent. */
function encodePngRgbaFallback(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
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
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

/** Tiny 3D soft-raster of UV spheres — same camera for both methods. */
function softRasterPointCloud(projected, width, height) {
  const eye = { x: 0, y: 0.35, z: -4.2 };
  const rgba = Buffer.alloc(width * height * 4, 0);
  const depth = new Float32Array(width * height);
  depth.fill(Infinity);
  // Dark plate background (anime structure lane mood).
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 12;
    rgba[i * 4 + 1] = 14;
    rgba[i * 4 + 2] = 22;
    rgba[i * 4 + 3] = 255;
  }

  const spheres = projected.map((p, idx) => ({
    c: { x: p.xyz[0], y: p.xyz[1], z: p.xyz[2] },
    r: 0.18 + 0.04 * ((idx % 3) / 2),
    color: hitColor(idx, p.w_scale ?? 1),
  }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ndcX = ((x + 0.5) / width) * 2 - 1;
      const ndcY = 1 - ((y + 0.5) / height) * 2;
      const dir = normalize3({
        x: ndcX * 1.4,
        y: ndcY * 1.05,
        z: 1,
      });
      let bestT = Infinity;
      let bestCol = null;
      for (const s of spheres) {
        const oc = sub3(eye, s.c);
        const a = dot3(dir, dir);
        const b = 2 * dot3(oc, dir);
        const c = dot3(oc, oc) - s.r * s.r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 1e-4 && t < bestT) {
          bestT = t;
          const hit = {
            x: eye.x + dir.x * t,
            y: eye.y + dir.y * t,
            z: eye.z + dir.z * t,
          };
          const n = normalize3(sub3(hit, s.c));
          const light = normalize3({ x: 0.4, y: 0.85, z: -0.35 });
          const ndl = Math.max(0.12, dot3(n, light));
          bestCol = [
            Math.min(255, s.color[0] * ndl),
            Math.min(255, s.color[1] * ndl),
            Math.min(255, s.color[2] * ndl),
          ];
        }
      }
      if (bestCol && bestT < depth[y * width + x]) {
        depth[y * width + x] = bestT;
        const o = (y * width + x) * 4;
        rgba[o] = bestCol[0] | 0;
        rgba[o + 1] = bestCol[1] | 0;
        rgba[o + 2] = bestCol[2] | 0;
        rgba[o + 3] = 255;
      }
    }
  }
  return { rgba, eye };
}

function hitColor(idx, scale) {
  // Warm→cool by foreshortening scale so w-effect is visible.
  const t = Math.max(0, Math.min(1, (scale - 0.55) / 0.9));
  const r = 220 - t * 80 + (idx % 2) * 10;
  const g = 140 + t * 40;
  const b = 90 + t * 120;
  return [r, g, b];
}

function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

async function tryEngine3dPlate(projected, outPng, method) {
  const dist = join(E3D, "dist", "src", "index.js");
  if (!existsSync(dist)) {
    return { used: "fallback-soft-raster", reason: "engine3d-core dist missing" };
  }
  try {
    const api = await import(pathToFileURL(dist).href);
    const {
      buildUvSphereMesh,
      encodePngRgba,
      renderStillBuffers,
      rasterMaterialFromBaseColor,
    } = api;
    if (typeof renderStillBuffers !== "function" || typeof buildUvSphereMesh !== "function") {
      return { used: "fallback-soft-raster", reason: "missing soft-raster exports" };
    }
    const meshes = projected.map((p, idx) => {
      const [r, g, b] = hitColor(idx, p.w_scale ?? 1).map((c) => c / 255);
      const mesh = buildUvSphereMesh(
        `${method}-hit-${p.id}`,
        0.2,
        12,
        8,
        [r, g, b],
        translateMat4(p.xyz[0], p.xyz[1], p.xyz[2], 1),
      );
      if (typeof rasterMaterialFromBaseColor === "function") {
        mesh.material = rasterMaterialFromBaseColor([r, g, b]);
      }
      return mesh;
    });
    const camera = {
      eye: [0, 0.35, -4.2],
      target: [0, 0.1, 0],
      up: [0, 1, 0],
      fovY: 42,
      near: 0.05,
      far: 40,
      width: WIDTH,
      height: HEIGHT,
    };
    const buf = renderStillBuffers({ meshes, camera });
    const png = encodePngRgba(buf.width, buf.height, buf.beautyRgba);
    writeFileSync(outPng, png);
    return {
      used: "engine3d-soft-raster",
      sha256: sha256Bytes(png),
      camera,
    };
  } catch (err) {
    return {
      used: "fallback-soft-raster",
      reason: String(err?.message ?? err),
    };
  }
}

function writePlateFallback(projected, outPng) {
  const { rgba, eye } = softRasterPointCloud(projected, WIDTH, HEIGHT);
  const png = encodePngRgbaFallback(WIDTH, HEIGHT, rgba);
  writeFileSync(outPng, png);
  return {
    used: "fallback-soft-raster",
    sha256: sha256Bytes(png),
    camera: { eye, target: [0, 0.1, 0], width: WIDTH, height: HEIGHT },
  };
}

function comparisonTable(mSot, mDrop, hashes) {
  const xyRel =
    Math.abs(mSot.span_xy - mDrop.span_xy) / Math.max(mDrop.span_xy, 1e-6);
  const zRel =
    Math.abs(mSot.span_z - mDrop.span_z) / Math.max(Math.abs(mDrop.span_z), 1e-6);
  const scaleContrast = mSot.mean_abs_scale_delta;
  const foreshortening =
    scaleContrast > 0.05
      ? `Projector4D mean|scale-1|=${scaleContrast.toFixed(3)}; drop_w scale=1`
      : "weak w-contrast on this hit set";
  const silhouette =
    xyRel > 0.08
      ? `xy footprint differs (rel Δ=${xyRel.toFixed(3)})`
      : `xy footprint closer (rel Δ=${xyRel.toFixed(3)})`;
  const depth =
    zRel > 0.08 || Math.abs(mSot.radius_variance - mDrop.radius_variance) > 1e-6
      ? `z-span/radial variance diverge (rel z Δ=${zRel.toFixed(3)})`
      : `depth spans closer (rel z Δ=${zRel.toFixed(3)})`;
  const replay =
    hashes.sot_a === hashes.sot_b && hashes.drop_a === hashes.drop_b
      ? "PASS (dual-run point-set hashes match)"
      : "FAIL (hashes differ)";
  const hashesDifferAcrossMethods = hashes.sot_a !== hashes.drop_a;
  const comprehension = hashesDifferAcrossMethods
    ? "Projector4D nests far-w nodes by scale; drop_w keeps literal xyz (flatter 4D story)"
    : "Point sets identical on this dump; plates may still match";

  return [
    {
      criterion: "silhouette_preservation",
      projector4d_sot: `span_xy=${mSot.span_xy.toFixed(3)}`,
      drop_w: `span_xy=${mDrop.span_xy.toFixed(3)}`,
      verdict: silhouette,
    },
    {
      criterion: "foreshortening",
      projector4d_sot: foreshortening,
      drop_w: "none (identity in xyz)",
      verdict: foreshortening,
    },
    {
      criterion: "depth_perception",
      projector4d_sot: `span_z=${mSot.span_z.toFixed(3)}, r_var=${mSot.radius_variance.toFixed(4)}`,
      drop_w: `span_z=${mDrop.span_z.toFixed(3)}, r_var=${mDrop.radius_variance.toFixed(4)}`,
      verdict: depth,
    },
    {
      criterion: "replay_determinism",
      projector4d_sot: hashes.sot_a === hashes.sot_b ? "match" : "mismatch",
      drop_w: hashes.drop_a === hashes.drop_b ? "match" : "mismatch",
      verdict: replay,
    },
    {
      criterion: "viewer_comprehension",
      projector4d_sot: "w readable as size/nearness",
      drop_w: "w discarded; structure may look flatter / more parallel",
      verdict: comprehension,
    },
  ];
}

async function runOnce(outDir, runTag, sceneKind = "sparse") {
  const { scene, centers, radii } = buildAnimeStructureScene(sceneKind);
  const grid = sceneKind === "rich" ? 12 : 8;
  const dump = dumpHits(scene, centers, radii, grid);
  const projector = new Projector4D({ d4: D4, d3: 4, width: WIDTH, height: HEIGHT });

  const sotRes = projectHitSet(dump.hits, "projector4d-sot", projector);
  const dropRes = projectHitSet(dump.hits, "drop_w", projector);
  const projectedSot = sotRes.projected;
  const projectedDrop = dropRes.projected;

  const hitPath = join(outDir, "hits.json");
  const sotPts = join(outDir, "projected-projector4d-sot.json");
  const dropPts = join(outDir, "projected-drop_w.json");

  const hitDoc = {
    provenance: {
      schema: PROVENANCE_SCHEMA,
      lane: "anime-structure",
      note: "Raw RT4D intersections before projection; dual consumers below.",
      print_sot_touched: false,
    },
    d4: D4,
    alpha_for_sot: ALPHA,
    seed: SEED,
    run_tag: runTag,
    scene_kind: sceneKind,
    origin: dump.origin,
    hit_count: dump.hits.length,
    hits: dump.hits,
  };
  writeFileSync(hitPath, JSON.stringify(hitDoc, null, 2) + "\n");

  const sotDoc = {
    provenance: provenance("projector4d-sot", { run_tag: runTag, scene_kind: sceneKind }),
    points: projectedSot,
    metrics: metrics(projectedSot),
  };
  const dropDoc = {
    provenance: provenance("drop_w", { run_tag: runTag, scene_kind: sceneKind }),
    points: projectedDrop,
    metrics: metrics(projectedDrop),
  };
  writeFileSync(sotPts, JSON.stringify(sotDoc, null, 2) + "\n");
  writeFileSync(dropPts, JSON.stringify(dropDoc, null, 2) + "\n");

  const plateSot = join(outDir, "plate-projector4d-sot.png");
  const plateDrop = join(outDir, "plate-drop_w.png");

  let plateMetaSot = await tryEngine3dPlate(projectedSot, plateSot, "projector4d-sot");
  if (plateMetaSot.used !== "engine3d-soft-raster") {
    plateMetaSot = { ...writePlateFallback(projectedSot, plateSot), ...plateMetaSot };
  }
  let plateMetaDrop = await tryEngine3dPlate(projectedDrop, plateDrop, "drop_w");
  if (plateMetaDrop.used !== "engine3d-soft-raster") {
    plateMetaDrop = { ...writePlateFallback(projectedDrop, plateDrop), ...plateMetaDrop };
  }

  writeFileSync(
    join(outDir, "plate-projector4d-sot.provenance.json"),
    JSON.stringify(
      provenance("projector4d-sot", {
        run_tag: runTag,
        artifact: "plate-projector4d-sot.png",
        plate_backend: plateMetaSot.used,
        asset_sha256: plateMetaSot.sha256 ?? null,
        camera: plateMetaSot.camera ?? null,
        scene_kind: sceneKind,
      }),
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(outDir, "plate-drop_w.provenance.json"),
    JSON.stringify(
      provenance("drop_w", {
        run_tag: runTag,
        artifact: "plate-drop_w.png",
        plate_backend: plateMetaDrop.used,
        asset_sha256: plateMetaDrop.sha256 ?? null,
        camera: plateMetaDrop.camera ?? null,
        scene_kind: sceneKind,
      }),
      null,
      2,
    ) + "\n",
  );

  return {
    hit_count: dump.hits.length,
    scene_kind: sceneKind,
    sot_hash: sha256Json(projectedSot),
    drop_hash: sha256Json(projectedDrop),
    metrics_sot: sotDoc.metrics,
    metrics_drop: dropDoc.metrics,
    plate_sot: plateMetaSot,
    plate_drop: plateMetaDrop,
  };
}

/**
 * Pole stress: synthetic hits with w ≈ −d4.
 * Documents Print SoT raw (may be non-finite) vs structure-lane reject wrapper.
 */
function runPoleStress(outDir) {
  mkdirSync(outDir, { recursive: true });
  const projector = new Projector4D({ d4: D4, d3: 4, width: WIDTH, height: HEIGHT });
  const offsets = [
    -1.0, -0.5, -0.2, -POLE_EPS * 2, -POLE_EPS, -POLE_EPS / 2, 0,
    POLE_EPS / 2, POLE_EPS, POLE_EPS * 2, 0.2, 0.5, 1.0,
  ];
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  let raw_non_finite = 0;
  let lane_rejected = 0;
  let drop_ok = 0;

  for (let i = 0; i < offsets.length; i++) {
    const eps = offsets[i];
    const w = -D4 + eps;
    const p = { x: 1, y: 0.5, z: -0.25, w };
    const raw = projectRawProjector4D(p, projector);
    if (!raw.finite) raw_non_finite += 1;
    const hit = { id: i, position: p, materialId: null };
    const sotLane = projectHitSet([hit], "projector4d-sot", projector, {
      rejectNearPole: true,
    });
    const dropLane = projectHitSet([hit], "drop_w", projector);
    if (sotLane.rejected > 0) lane_rejected += 1;
    if (dropLane.accepted > 0) drop_ok += 1;
    rows.push({
      w,
      denom_d4_plus_w: raw.denom,
      abs_denom: Math.abs(raw.denom),
      below_pole_eps: Math.abs(raw.denom) < POLE_EPS,
      projector4d_raw_finite: raw.finite,
      projector4d_raw_xyz: raw.xyz,
      projector4d_raw_scale: raw.w_scale,
      structure_lane_reject: sotLane.rejected > 0,
      drop_w_xyz: dropLane.projected[0]?.xyz ?? null,
    });
  }

  const report = {
    provenance: {
      schema: PROVENANCE_SCHEMA,
      experiment: "pole-stress",
      lane: "anime-structure",
      print_sot_touched: false,
      digital_printer_touched: false,
      d4: D4,
      pole_eps: POLE_EPS,
      pole_at_w: -D4,
      policy:
        "Structure-lane compare rejects |d4+w| < pole_eps. Print SoT Projector4D unchanged (may yield non-finite).",
    },
    evaluation_stance: EVALUATION_STANCE,
    counts: {
      samples: rows.length,
      raw_non_finite,
      structure_lane_rejected: lane_rejected,
      drop_w_always_finite_accepted: drop_ok,
    },
    rows,
  };
  writeFileSync(join(outDir, "pole-stress.json"), JSON.stringify(report, null, 2) + "\n");

  const readme = [
    "# Pole stress — w ≈ −d₄",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Status | **partial** evidence |",
    "| d4 | " + D4 + " |",
    "| Pole | w = −d4 = " + -D4 + " |",
    "| Structure-lane ε | " + POLE_EPS + " (|d4+w| < ε ⇒ reject) |",
    "| Print SoT touched | false |",
    "",
    "## Policy",
    "",
    "- **Print SoT `Projector4D`:** no reject — raw scale may be non-finite near the pole.",
    "- **Structure-lane wrapper:** reject (skip) when `|d4+w| < ε` (ε = 0.05·d4).",
    "- **drop_w:** always finite (identity on xyz).",
    "- No silent clamp for storytelling honesty.",
    "",
    "## Counts",
    "",
    "- samples: " + rows.length,
    "- Print SoT raw non-finite: " + raw_non_finite,
    "- Structure-lane rejected: " + lane_rejected,
    "- drop_w accepted: " + drop_ok,
    "",
    "## Evaluation stance",
    "",
    ...EVALUATION_STANCE.map((s) => "- " + s),
    "",
    "See `pole-stress.json` for per-sample rows.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), readme);
  return report;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      "rt4d-project-compare.mjs — RT4D hits → Projector4D vs drop_w → Engine3D plate\n" +
        "  --out-dir <dir>   default: <repo>/tmp/rt4d-project-compare\n" +
        "  --pole-stress     near-pole reject/finite diagnostics (subdir pole-stress/)\n" +
        "  --scene rich      denser hypersphere scaffold (still not full ink-cel)\n",
    );
    process.exit(0);
  }

  const baseOut =
    typeof args["out-dir"] === "string"
      ? resolve(String(args["out-dir"]))
      : resolve(REPO, "tmp", "rt4d-project-compare");
  mkdirSync(baseOut, { recursive: true });

  if (args["pole-stress"]) {
    const poleDir = join(baseOut, "pole-stress");
    const report = runPoleStress(poleDir);
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          experiment: "pole-stress",
          outDir: poleDir,
          counts: report.counts,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const sceneKind = args.scene === "rich" ? "rich" : "sparse";
  const outDir =
    sceneKind === "rich" ? join(baseOut, "scene-rich") : baseOut;
  mkdirSync(outDir, { recursive: true });

  const runA = await runOnce(outDir, "A", sceneKind);
  const builtB = buildAnimeStructureScene(sceneKind);
  const grid = sceneKind === "rich" ? 12 : 8;
  const dumpB = dumpHits(builtB.scene, builtB.centers, builtB.radii, grid);
  const projector = new Projector4D({ d4: D4, d3: 4, width: WIDTH, height: HEIGHT });
  const sotB = projectHitSet(dumpB.hits, "projector4d-sot", projector).projected;
  const dropB = projectHitSet(dumpB.hits, "drop_w", projector).projected;
  const hashes = {
    sot_a: runA.sot_hash,
    sot_b: sha256Json(sotB),
    drop_a: runA.drop_hash,
    drop_b: sha256Json(dropB),
  };

  const table = comparisonTable(runA.metrics_sot, runA.metrics_drop, hashes);
  const report = {
    provenance: {
      schema: PROVENANCE_SCHEMA,
      lane: "anime-structure",
      print_sot_touched: false,
      digital_printer_touched: false,
      scene_kind: sceneKind,
      note: "Compare evidence for two reference-model implementations on one hit set.",
      contract:
        "docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md",
    },
    evaluation_stance: EVALUATION_STANCE,
    camera_shared: true,
    scene_shared: true,
    hit_count: runA.hit_count,
    plate_backend_sot: runA.plate_sot.used,
    plate_backend_drop: runA.plate_drop.used,
    metrics: { projector4d_sot: runA.metrics_sot, drop_w: runA.metrics_drop },
    replay_hashes: hashes,
    criteria: table,
    default_promotion:
      "Projector4D as anime-structure default remains **declared** until richer ink/cel evidence.",
    artifacts: [
      "hits.json",
      "projected-projector4d-sot.json",
      "projected-drop_w.json",
      "plate-projector4d-sot.png",
      "plate-drop_w.png",
      "plate-projector4d-sot.provenance.json",
      "plate-drop_w.provenance.json",
      "comparison.json",
      "README.md",
    ],
  };
  writeFileSync(join(outDir, "comparison.json"), JSON.stringify(report, null, 2) + "\n");

  const readme = [
    "# RT4D → Engine3D projection compare (anime structure lane)",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Status | **partial** evidence |",
    "| Scene | `" + sceneKind + "` |",
    "| Print SoT | untouched |",
    "| Digital Printer | untouched |",
    "| Hit count | " + runA.hit_count + " |",
    "| Plate backend (sot / drop) | `" +
      runA.plate_sot.used +
      "` / `" +
      runA.plate_drop.used +
      "` |",
    "| Shared camera + scene | yes |",
    "| Contract | `docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md` |",
    "",
    "## Evaluation stance (binding)",
    "",
    ...EVALUATION_STANCE.map((s) => "- " + s),
    "",
    "## Provenance example",
    "",
    "```json",
    JSON.stringify(provenance("projector4d-sot"), null, 2),
    "```",
    "",
    "## Criteria table",
    "",
    "| Criterion | projector4d-sot | drop_w | Verdict |",
    "| --- | --- | --- | --- |",
    ...table.map(
      (r) =>
        `| ${r.criterion} | ${r.projector4d_sot} | ${r.drop_w} | ${r.verdict} |`,
    ),
    "",
    "## Geometry notes",
    "",
    "- Same RT4D hypersphere arc (stepped w); rays from fixed origin.",
    "- `projector4d-sot`: scale d4/(d4+w) with d4=" + D4 + " (α=" + ALPHA + ").",
    "- `drop_w`: identity on xyz — w discarded.",
    "- Soft-raster shading is 3D only (not full 4D transport).",
    sceneKind === "rich"
      ? "- Scene `rich`: denser scaffold for comprehension — **not** full ink-cel pipeline (**skeleton/partial**)."
      : "- Scene `sparse`: baseline arc; use `--scene rich` for denser scaffold.",
    "",
    "## Replay",
    "",
    "- Dual-run point-set sha256: sot `" +
      hashes.sot_a.slice(0, 12) +
      "…` vs `" +
      hashes.sot_b.slice(0, 12) +
      "…`; drop `" +
      hashes.drop_a.slice(0, 12) +
      "…` vs `" +
      hashes.drop_b.slice(0, 12) +
      "…`.",
    "- Determinism verdict: **" +
      (hashes.sot_a === hashes.sot_b && hashes.drop_a === hashes.drop_b
        ? "PASS"
        : "FAIL") +
      "**.",
    "",
    "## Gaps",
    "",
    "- Sparse/rich point dump ≠ full ink-cel production pipeline.",
    "- Viewer comprehension is qualitative (operator read), not a psychometric score.",
    "- If Engine3D dist missing, plates use in-script fallback soft-raster (same camera).",
    "- Print SoT / observation aperture / Digital Printer not exercised.",
    "- Default Projector4D promotion for anime-structure remains **declared**.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), readme);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        outDir,
        scene_kind: sceneKind,
        hit_count: runA.hit_count,
        replay_pass:
          hashes.sot_a === hashes.sot_b && hashes.drop_a === hashes.drop_b,
        plate_backend: runA.plate_sot.used,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
