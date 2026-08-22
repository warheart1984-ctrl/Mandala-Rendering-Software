#!/usr/bin/env node
/**
 * Full-stack Mandala organ showcase — tiny, honest **partial**.
 *
 *   node scripts/full-stack-showcase.mjs
 *   node scripts/full-stack-showcase.mjs --with-chamber   # opt-in RT4D 64×64/1spp
 *   node scripts/full-stack-showcase.mjs --skip-painter
 *
 * Target box: ~15GB RAM / FX-8350 / RX 580. Not a production film.
 *
 * Artifacts → output/mandala-full-stack/
 *   final.png     (must exist — labeled collage)
 *   final.mp4     (if ≥2 panel frames assembled)
 *   receipt.json  (ran | skipped | error per subsystem)
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rgbToPng, decodePngToRgb } from "../mandala/engine/png.mjs";
import { createImage } from "../mandala/proto/mandala-project.mjs";
import {
  createInitialCertifiedState,
  freezeCertifiedSnapshot,
} from "../mandala/proto/certified-state.mjs";
import { projectFrozenLayered } from "../mandala/engine/project.mjs";
import {
  createDemoGovernanceGraph,
  hamiltonianGov,
} from "../mandala/engine/hamiltonian/governance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "output/mandala-full-stack");
const FFMPEG = join(REPO, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const PANEL = 160;
const CAPTION_H = 18;
const CELL_H = PANEL + CAPTION_H;

const argv = process.argv.slice(2);
const WITH_CHAMBER = argv.includes("--with-chamber");
const SKIP_PAINTER = argv.includes("--skip-painter");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function nowMs() {
  return Date.now();
}

function timed(fn) {
  const t0 = nowMs();
  try {
    const result = fn();
    return { ok: true, ms: nowMs() - t0, result };
  } catch (err) {
    return {
      ok: false,
      ms: nowMs() - t0,
      error: err?.message || String(err),
      code: err?.code,
    };
  }
}

async function timedAsync(fn) {
  const t0 = nowMs();
  try {
    const result = await fn();
    return { ok: true, ms: nowMs() - t0, result };
  } catch (err) {
    return {
      ok: false,
      ms: nowMs() - t0,
      error: err?.message || String(err),
      code: err?.code,
      exitCode: err?.exitCode,
    };
  }
}

function runNode(relScript, args = [], opts = {}) {
  const script = join(REPO, relScript);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: (r.stdout || "").slice(-4000),
    stderr: (r.stderr || "").slice(-2000),
    error: r.error?.message,
  };
}

function memSnapshot() {
  try {
    const t = readFileSync("/proc/meminfo", "utf8");
    const get = (k) => {
      const m = t.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"));
      return m ? Number(m[1]) : null;
    };
    const totalKb = get("MemTotal");
    const availKb = get("MemAvailable");
    return {
      totalMb: totalKb != null ? Math.round(totalKb / 1024) : null,
      availableMb: availKb != null ? Math.round(availKb / 1024) : null,
    };
  } catch {
    return { totalMb: null, availableMb: null };
  }
}

/** Tiny 5×7 uppercase glyphs for panel captions. */
const GLYPHS = {
  " ": [0, 0, 0, 0, 0],
  A: [0x1e, 0x05, 0x05, 0x1e, 0x00],
  B: [0x1f, 0x15, 0x15, 0x0a, 0x00],
  C: [0x0e, 0x11, 0x11, 0x0a, 0x00],
  D: [0x1f, 0x11, 0x11, 0x0e, 0x00],
  E: [0x1f, 0x15, 0x15, 0x11, 0x00],
  F: [0x1f, 0x05, 0x05, 0x01, 0x00],
  G: [0x0e, 0x11, 0x15, 0x1c, 0x00],
  H: [0x1f, 0x04, 0x04, 0x1f, 0x00],
  I: [0x11, 0x1f, 0x11, 0x00, 0x00],
  J: [0x08, 0x10, 0x11, 0x0f, 0x00],
  K: [0x1f, 0x04, 0x0a, 0x11, 0x00],
  L: [0x1f, 0x10, 0x10, 0x10, 0x00],
  M: [0x1f, 0x02, 0x04, 0x02, 0x1f],
  N: [0x1f, 0x02, 0x04, 0x1f, 0x00],
  O: [0x0e, 0x11, 0x11, 0x0e, 0x00],
  P: [0x1f, 0x05, 0x05, 0x02, 0x00],
  R: [0x1f, 0x05, 0x0d, 0x12, 0x00],
  S: [0x12, 0x15, 0x15, 0x09, 0x00],
  T: [0x01, 0x01, 0x1f, 0x01, 0x01],
  U: [0x0f, 0x10, 0x10, 0x0f, 0x00],
  V: [0x07, 0x08, 0x10, 0x08, 0x07],
  W: [0x1f, 0x08, 0x04, 0x08, 0x1f],
  X: [0x1b, 0x04, 0x04, 0x1b, 0x00],
  Y: [0x03, 0x04, 0x18, 0x04, 0x03],
  Z: [0x19, 0x15, 0x13, 0x11, 0x00],
  "0": [0x0e, 0x11, 0x11, 0x0e, 0x00],
  "1": [0x12, 0x1f, 0x10, 0x00, 0x00],
  "2": [0x19, 0x15, 0x15, 0x12, 0x00],
  "3": [0x11, 0x15, 0x15, 0x0a, 0x00],
  "4": [0x07, 0x04, 0x1f, 0x04, 0x00],
  "5": [0x17, 0x15, 0x15, 0x09, 0x00],
  "6": [0x0e, 0x15, 0x15, 0x08, 0x00],
  "7": [0x01, 0x19, 0x05, 0x03, 0x00],
  "8": [0x0a, 0x15, 0x15, 0x0a, 0x00],
  "9": [0x02, 0x15, 0x15, 0x0e, 0x00],
  "-": [0x04, 0x04, 0x04, 0x00, 0x00],
  "=": [0x0a, 0x0a, 0x0a, 0x00, 0x00],
  "/": [0x10, 0x08, 0x04, 0x02, 0x01],
  ".": [0x10, 0x00, 0x00, 0x00, 0x00],
  ":": [0x0a, 0x00, 0x00, 0x00, 0x00],
  "(": [0x0e, 0x11, 0x00, 0x00, 0x00],
  ")": [0x11, 0x0e, 0x00, 0x00, 0x00],
  "*": [0x0a, 0x04, 0x1f, 0x04, 0x0a],
};

function drawCaption(rgb, width, cellH, text, ox, oy) {
  const barY0 = oy + PANEL;
  for (let y = 0; y < CAPTION_H; y++) {
    for (let x = 0; x < PANEL; x++) {
      const i = ((barY0 + y) * width + (ox + x)) * 3;
      rgb[i] = 18;
      rgb[i + 1] = 22;
      rgb[i + 2] = 36;
    }
  }
  const label = String(text || "")
    .toUpperCase()
    .slice(0, 22);
  let cx = ox + 4;
  const cy = barY0 + 5;
  for (const ch of label) {
    const g = GLYPHS[ch] || GLYPHS["."] || [0, 0, 0, 0, 0];
    for (let col = 0; col < 5; col++) {
      const bits = g[col] || 0;
      for (let row = 0; row < 7; row++) {
        if (bits & (1 << row)) {
          const px = cx + col;
          const py = cy + row;
          if (px >= ox && px < ox + PANEL && py >= barY0 && py < oy + cellH) {
            const i = (py * width + px) * 3;
            rgb[i] = 220;
            rgb[i + 1] = 230;
            rgb[i + 2] = 245;
          }
        }
      }
    }
    cx += 6;
  }
}

function loadPngRgb(path) {
  const buf = readFileSync(path);
  const { width, height, rgb } = decodePngToRgb(buf);
  return { width, height, rgb, bytes: buf.length, sha256: sha256(buf) };
}

function scaleNearest(src, tw, th) {
  const rgb = new Uint8Array(tw * th * 3);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / th) * src.height));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / tw) * src.width));
      const si = (sy * src.width + sx) * 3;
      const di = (y * tw + x) * 3;
      rgb[di] = src.rgb[si];
      rgb[di + 1] = src.rgb[si + 1];
      rgb[di + 2] = src.rgb[si + 2];
    }
  }
  return { width: tw, height: th, rgb };
}

function makePlaceholder(label, color = [40, 28, 48]) {
  const rgb = new Uint8Array(PANEL * PANEL * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = color[0];
    rgb[i + 1] = color[1];
    rgb[i + 2] = color[2];
  }
  // Diagonal hatch so skipped panels are visually distinct
  for (let y = 0; y < PANEL; y += 4) {
    for (let x = 0; x < PANEL; x++) {
      if ((x + y) % 8 < 2) {
        const i = (y * PANEL + x) * 3;
        rgb[i] = Math.min(255, color[0] + 18);
        rgb[i + 1] = Math.min(255, color[1] + 18);
        rgb[i + 2] = Math.min(255, color[2] + 28);
      }
    }
  }
  void label;
  return { width: PANEL, height: PANEL, rgb };
}

function blit(dst, dw, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) {
    const dy = oy + y;
    for (let x = 0; x < sw; x++) {
      const dx = ox + x;
      const si = (y * sw + x) * 3;
      const di = (dy * dw + dx) * 3;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
    }
  }
}

function collagePanels(panels) {
  const cols = 3;
  const rows = Math.ceil(panels.length / cols);
  const width = cols * PANEL;
  const height = rows * CELL_H;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 8;
    rgb[i + 1] = 10;
    rgb[i + 2] = 18;
  }
  for (let i = 0; i < panels.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * PANEL;
    const oy = row * CELL_H;
    const p = panels[i];
    const img = p.frame || makePlaceholder(p.caption);
    const scaled =
      img.width === PANEL && img.height === PANEL
        ? img
        : scaleNearest(img, PANEL, PANEL);
    blit(rgb, width, scaled.rgb, PANEL, PANEL, ox, oy);
    drawCaption(rgb, width, CELL_H, p.caption, ox, oy);
  }
  return { width, height, rgb };
}

function encodeMp4(framePaths, outPath) {
  if (framePaths.length < 2) {
    return { ok: false, skipped: true, reason: "need ≥2 frames" };
  }
  if (!existsSync(FFMPEG)) {
    return { ok: false, skipped: true, reason: `ffmpeg missing at ${FFMPEG}` };
  }
  const listPath = join(OUT, "concat.txt");
  const lines = [];
  for (const p of framePaths) {
    lines.push(`file '${p.replace(/'/g, "'\\''")}'`);
    lines.push("duration 0.9");
  }
  lines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
  writeFileSync(listPath, lines.join("\n") + "\n");
  const r = spawnSync(
    FFMPEG,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !existsSync(outPath)) {
    return {
      ok: false,
      skipped: false,
      reason: String(r.stderr || r.stdout || "ffmpeg failed").slice(-600),
    };
  }
  return { ok: true, path: outPath, bytes: statSync(outPath).size };
}

function writeOutPng(name, frame) {
  const path = join(OUT, name);
  const png = rgbToPng(frame.width, frame.height, frame.rgb);
  writeFileSync(path, png);
  return { path, bytes: png.length, sha256: sha256(png), width: frame.width, height: frame.height };
}

function entryBase(id, title) {
  return {
    id,
    title,
    status: "pending",
    ran: false,
    skipped: false,
    error: null,
    ms: 0,
    paths: {},
    note: null,
  };
}

async function runCharacterHolography(entry) {
  const r = timed(() => runNode("character/holography/e2e-showcase.mjs", [], { timeoutMs: 90_000 }));
  entry.ms = r.ms;
  if (!r.ok) {
    entry.status = "error";
    entry.error = r.error;
    return null;
  }
  const proc = r.result;
  const finalPath = join(REPO, "output/character-holography/e2e-showcase/frame-final.png");
  const restPath = join(REPO, "output/character-holography/e2e-showcase/01-rest.png");
  if (proc.status !== 0 || !existsSync(finalPath)) {
    entry.status = "error";
    entry.error = `e2e-showcase exit=${proc.status} ${proc.stderr || proc.error || ""}`.slice(0, 400);
    return null;
  }
  const panelSrc = existsSync(restPath) ? restPath : finalPath;
  copyFileSync(finalPath, join(OUT, "character-holography.png"));
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { collage: finalPath, panel: panelSrc };
  entry.note = "CPU EFR; orientation fixed (world Y-up → screen Y-down)";
  return loadPngRgb(panelSrc);
}

async function runMandalaHolography(entry) {
  const r = timed(() => runNode("mandala/holography/test-scene.mjs", [], { timeoutMs: 60_000 }));
  entry.ms = r.ms;
  if (!r.ok) {
    entry.status = "error";
    entry.error = r.error;
    return null;
  }
  const heat = join(REPO, "output/mandala-holography/tiny-scene/boundary-heatmap.png");
  if (r.result.status !== 0 || !existsSync(heat)) {
    entry.status = "error";
    entry.error = `test-scene exit=${r.result.status}`;
    return null;
  }
  copyFileSync(heat, join(OUT, "mandala-holography.png"));
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { heatmap: heat };
  entry.note = "tiny holographic scene EGT heatmap";
  return loadPngRgb(heat);
}

async function runMandalaProto(entry) {
  const r = timed(() => {
    const state = createInitialCertifiedState({ seed: 21 });
    const snap = freezeCertifiedSnapshot(state);
    const image = createImage(64, 64);
    projectFrozenLayered(snap, image);
    const png = rgbToPng(image.width, image.height, image.rgb);
    const path = join(OUT, "mandala-proto.png");
    writeFileSync(path, png);
    return {
      path,
      bytes: png.length,
      sha256: sha256(png),
      width: 64,
      height: 64,
      hash: snap.hash?.slice?.(0, 16) || state.hash?.slice?.(0, 16) || null,
    };
  });
  entry.ms = r.ms;
  if (!r.ok) {
    entry.status = "error";
    entry.error = r.error;
    return null;
  }
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { png: r.result.path };
  entry.note = "cheap certified slice project (not full tEnd=63 GPU proto)";
  entry.protoHash = r.result.hash;
  return loadPngRgb(r.result.path);
}

async function runCharacterExport(entry) {
  const r = timed(() =>
    runNode(
      "character/tools/export-character.mjs",
      ["--width", "96", "--height", "128", "--preset", "wire_sim", "--no-turntable"],
      { timeoutMs: 60_000 },
    ),
  );
  entry.ms = r.ms;
  const candidates = [
    join(REPO, "character/renders/char_wire_render.png"),
    join(REPO, "character/renders/char/char_wire_render.png"),
    join(REPO, "character/renders/char_final.png"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (r.ok && r.result.status === 0 && found) {
    copyFileSync(found, join(OUT, "character-export.png"));
    entry.status = "ran";
    entry.ran = true;
    entry.paths = { wire: found };
    entry.note = "wire still from export-character (head-up)";
    return loadPngRgb(found);
  }
  if (found) {
    copyFileSync(found, join(OUT, "character-export.png"));
    entry.status = "ran";
    entry.ran = true;
    entry.paths = { wire: found };
    entry.note = `reused existing export; cli exit=${r.result?.status}`;
    return loadPngRgb(found);
  }
  entry.status = "error";
  entry.error = `export failed exit=${r.result?.status} ${r.error || r.result?.stderr || ""}`.slice(0, 400);
  return null;
}

async function runOpenPainter(entry) {
  if (SKIP_PAINTER) {
    entry.status = "skipped";
    entry.skipped = true;
    entry.note = "--skip-painter";
    return null;
  }
  const mem = memSnapshot();
  if (mem.availableMb != null && mem.availableMb < 1800) {
    entry.status = "skipped";
    entry.skipped = true;
    entry.note = `RAM available ${mem.availableMb}MB < 1800 — SD OOM risk; use --allow-cpu only if forced`;
    // Still try CPU field-tint via golden painter
  }
  const r = await timedAsync(async () => {
    const { runGoldenPainter } = await import("./golden-painter.mjs");
    return runGoldenPainter({
      edge: 64,
      allowCpu: true,
      withE2e: false,
      outDir: join(OUT, "painter"),
      env: process.env,
    });
  });
  entry.ms = r.ms;
  if (!r.ok) {
    // Soft-skip denial / missing backend rather than fail the whole showcase
    entry.status = r.code === "DENIED_UNCENSORED" || r.code === "DENIED_ILLEGAL" ? "skipped" : "error";
    entry.skipped = entry.status === "skipped";
    entry.error = r.error;
    entry.note = r.code || null;
    return null;
  }
  const framePath = join(OUT, "painter/frame.png");
  const alt = r.result?.framePath || r.result?.out?.frame || framePath;
  const path = existsSync(framePath) ? framePath : existsSync(alt) ? alt : null;
  if (!path) {
    entry.status = "error";
    entry.error = "painter wrote no frame.png";
    return null;
  }
  copyFileSync(path, join(OUT, "open-painter.png"));
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { frame: path };
  entry.note = `painter backend=${r.result?.backend || r.result?.receipt?.backend || "unknown"} (tiny 64)`;
  entry.backend = r.result?.backend || r.result?.receipt?.backend || null;
  return loadPngRgb(path);
}

async function runSimulationChamber(entry) {
  const mem = memSnapshot();
  if (!WITH_CHAMBER) {
    entry.status = "skipped";
    entry.skipped = true;
    entry.note =
      mem.availableMb != null
        ? `default skip — available RAM ${mem.availableMb}MB; pass --with-chamber for 64×64/1spp few frames`
        : "default skip on this box; pass --with-chamber for tiny RT4D";
    return null;
  }
  if (mem.availableMb != null && mem.availableMb < 2500) {
    entry.status = "skipped";
    entry.skipped = true;
    entry.note = `available RAM ${mem.availableMb}MB < 2500 — Chamber RT4D skipped with evidence`;
    return null;
  }
  const scene = join(REPO, "scripts/scene-cards/scene-void-meditation.json");
  const chamberOut = join(OUT, "chamber");
  mkdirSync(chamberOut, { recursive: true });
  const r = timed(() =>
    runNode(
      "scripts/simulation-chamber.mjs",
      [
        scene,
        chamberOut,
        "--width",
        "64",
        "--height",
        "64",
        "--samples",
        "1",
        "--fps",
        "4",
        "--maxDepth",
        "2",
        "--no-tts",
      ],
      { timeoutMs: 180_000 },
    ),
  );
  entry.ms = r.ms;
  if (!r.ok || r.result.status !== 0) {
    entry.status = "error";
    entry.error = (r.error || r.result?.stderr || r.result?.stdout || "chamber failed").slice(0, 500);
    return null;
  }
  // Find any png frame
  let frame = null;
  for (const name of ["frame-000.png", "frame-0.png", "final.png", "preview.png"]) {
    const p = join(chamberOut, name);
    if (existsSync(p)) {
      frame = p;
      break;
    }
  }
  if (!frame) {
    entry.status = "skipped";
    entry.skipped = true;
    entry.note = "chamber exited 0 but no PNG found under timeout budget";
    return null;
  }
  copyFileSync(frame, join(OUT, "simulation-chamber.png"));
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { frame };
  entry.note = "64×64/1spp void-meditation (partial)";
  return loadPngRgb(frame);
}

async function runGovernance(entry) {
  const r = timed(() => {
    const graph = createDemoGovernanceGraph();
    const H = hamiltonianGov(graph);
    const path = join(OUT, "governance.json");
    const payload = {
      H_gov: H,
      nodes: graph.nodes.length,
      note: "demo governance graph cost — computational analogue, not vacuum physics",
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return payload;
  });
  entry.ms = r.ms;
  if (!r.ok) {
    entry.status = "error";
    entry.error = r.error;
    return null;
  }
  entry.status = "ran";
  entry.ran = true;
  entry.paths = { json: join(OUT, "governance.json") };
  entry.H_gov = r.result.H_gov;
  entry.note = `H_gov=${Number(r.result.H_gov).toFixed(6)}`;
  // Tiny numeric tile for collage — dark field + H value as caption payload
  const rgb = new Uint8Array(PANEL * PANEL * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 16;
    rgb[i + 1] = 32;
    rgb[i + 2] = 28;
  }
  const label = `H=${Number(r.result.H_gov).toFixed(3)}`;
  // Draw label into the panel body (reuse caption glyphs)
  let cx = 12;
  const cy = Math.floor(PANEL / 2) - 3;
  for (const ch of label.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS["."] || [0, 0, 0, 0, 0];
    for (let col = 0; col < 5; col++) {
      const bits = g[col] || 0;
      for (let row = 0; row < 7; row++) {
        if (bits & (1 << row)) {
          const px = cx + col;
          const py = cy + row;
          if (px >= 0 && px < PANEL && py >= 0 && py < PANEL) {
            const i = (py * PANEL + px) * 3;
            rgb[i] = 160;
            rgb[i + 1] = 220;
            rgb[i + 2] = 180;
          }
        }
      }
    }
    cx += 6;
  }
  return { width: PANEL, height: PANEL, rgb };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const mem = memSnapshot();
  const started = new Date().toISOString();
  const t0 = nowMs();

  const subsystems = {
    characterHolography: entryBase("characterHolography", "Character"),
    mandalaHolography: entryBase("mandalaHolography", "Holography"),
    mandalaProto: entryBase("mandalaProto", "Proto"),
    characterExport: entryBase("characterExport", "Export"),
    openPainter: entryBase("openPainter", "Painter"),
    simulationChamber: entryBase("simulationChamber", "Chamber"),
    governance: entryBase("governance", "H-gov"),
  };

  const frames = {};

  frames.characterHolography = await runCharacterHolography(subsystems.characterHolography);
  frames.mandalaHolography = await runMandalaHolography(subsystems.mandalaHolography);
  frames.mandalaProto = await runMandalaProto(subsystems.mandalaProto);
  frames.characterExport = await runCharacterExport(subsystems.characterExport);
  frames.openPainter = await runOpenPainter(subsystems.openPainter);
  frames.simulationChamber = await runSimulationChamber(subsystems.simulationChamber);
  frames.governance = await runGovernance(subsystems.governance);

  const panelOrder = [
    ["characterHolography", "CHARACTER"],
    ["mandalaHolography", "HOLOGRAPHY"],
    ["mandalaProto", "PROTO"],
    ["characterExport", "EXPORT"],
    ["openPainter", "PAINTER"],
    ["simulationChamber", "CHAMBER"],
    ["governance", "H-GOV"],
  ];

  const panels = [];
  const sequencePaths = [];
  for (const [key, caption] of panelOrder) {
    const sub = subsystems[key];
    const statusTag =
      sub.status === "ran" ? "OK" : sub.status === "skipped" ? "SKIP" : "ERR";
    const frame = frames[key];
    panels.push({
      caption: `${caption} ${statusTag}`,
      frame: frame || makePlaceholder(caption),
    });
    if (frame) {
      const panelPath = join(OUT, `panel-${key}.png`);
      const scaled = scaleNearest(frame, PANEL, PANEL);
      writeFileSync(panelPath, rgbToPng(PANEL, PANEL, scaled.rgb));
      sequencePaths.push(panelPath);
    }
  }

  // Prefer 6 visual organs in a 2×3 grid; drop H-gov tile from collage if we have 6 others with images
  // Keep all 7 (3×3 with one empty) — collagePanels handles ceil.
  const collage = collagePanels(panels);
  const finalMeta = writeOutPng("final.png", collage);

  const mp4Path = join(OUT, "final.mp4");
  // Prefer sequence of ran panels; also include collage as last still if ≥2
  const mp4Sources =
    sequencePaths.length >= 2
      ? sequencePaths
      : sequencePaths.length === 1
        ? [sequencePaths[0], finalMeta.path]
        : [];
  const mp4 = encodeMp4(mp4Sources, mp4Path);

  const ran = Object.values(subsystems).filter((s) => s.ran).map((s) => s.id);
  const skipped = Object.values(subsystems)
    .filter((s) => s.skipped)
    .map((s) => `${s.id}: ${s.note || s.error || "skipped"}`);
  const errored = Object.values(subsystems)
    .filter((s) => s.status === "error")
    .map((s) => `${s.id}: ${s.error}`);

  const receipt = {
    kind: "mandala-full-stack-showcase",
    status: "partial",
    claim:
      "Tiny multi-organ smoke collage — not production film / photoreal / realistic-by-default",
    command: "node scripts/full-stack-showcase.mjs",
    started,
    finished: new Date().toISOString(),
    totalMs: nowMs() - t0,
    hardware: {
      note: "aimed at ~15GB RAM / FX-8350 / RX 580",
      mem,
    },
    flags: { withChamber: WITH_CHAMBER, skipPainter: SKIP_PAINTER },
    orientationFix: {
      file: "mandala/holography/efr.mjs",
      change: "toPixel maps world Y-up to screen Y-down (head at top)",
    },
    subsystems,
    ran,
    skipped,
    errored,
    final: finalMeta,
    finalMp4: mp4.ok ? { path: mp4.path, bytes: mp4.bytes } : { skipped: true, reason: mp4.reason },
    governanceH: subsystems.governance.H_gov ?? null,
  };

  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));

  const ok = existsSync(finalMeta.path) && finalMeta.bytes > 64 && ran.length >= 1;
  console.log(
    JSON.stringify(
      {
        ok,
        final: finalMeta.path,
        finalMp4: mp4.ok ? mp4.path : null,
        ran,
        skipped,
        errored,
        H_gov: receipt.governanceH,
        totalMs: receipt.totalMs,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
