#!/usr/bin/env node
/**
 * cinematic-grade.mjs — photographic post-process ("film pass") for rendered frames.
 *
 * HONEST SCOPE: this is a 2D image post-process applied with ffmpeg. It is NOT
 * physically-simulated lighting/volumetrics/optics. Physically-simulated effects
 * (soft shadows, multi-bounce GI, ambient-occlusion-like contact darkening, GGX
 * specular) come from the RT4D path tracer itself — raise --samples / --maxDepth
 * on the renderer for those. This pass adds the *camera/film* layer that a real
 * photograph has and a raw render lacks:
 *
 *   - Bloom / glow diffusion  (bright emissive edges bleed into surrounding air)
 *   - Split-tone color temperature (warm highlights ~3200K, cool shadows ~6500K)
 *   - Subtle atmospheric haze (small black lift so nothing is pure void)
 *   - Lens vignette
 *   - Chromatic aberration (channel shift at the edges)
 *   - Mild lens (barrel) distortion
 *   - Film / sensor grain
 *
 * It intentionally does NOT fake depth-of-field (no depth buffer here) — that
 * would need the renderer's aperture path, which is currently non-deterministic.
 *
 * Deterministic w.r.t. inputs + parameters (same frames + same flags => same
 * ffmpeg graph). Uses system ffmpeg (MRS_FFMPEG env override, else `ffmpeg`).
 *
 * Usage:
 *   node scripts/cinematic-grade.mjs --frames <dir> --out <out.mp4> [options]
 *   node scripts/cinematic-grade.mjs --input <in.mp4> --out <out.mp4> [options]
 *
 * Options (all optional; sensible film defaults):
 *   --fps N            Frame rate when reading a --frames dir (default 12)
 *   --pattern P        Frame filename pattern (default frame-%04d.png)
 *   --scale N          Output square size in px (default 512; 0 = keep source)
 *   --strength F       Master intensity multiplier for all effects (default 1.0)
 *   --bloom F          Bloom opacity 0..1 (default 0.34 * strength)
 *   --grain F          Film-grain strength (default 7 * strength)
 *   --vignette F       Vignette angle divisor; smaller = stronger (default 4.6)
 *   --ca F             Chromatic-aberration pixel shift (default 1.1 * strength)
 *   --warm F           Color-temperature split-tone amount (default 1.0 * strength)
 *   --no-lens          Disable barrel lens distortion
 *   --crf N            x264 CRF (default 18)
 *   --print            Print the ffmpeg command and exit (no render)
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { a[key] = true; }
    else { a[key] = next; i++; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const ffmpeg = process.env.MRS_FFMPEG || "ffmpeg";
const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);

const strength = num(args.strength, 1.0);
const fps = num(args.fps, 12);
const pattern = typeof args.pattern === "string" ? args.pattern : "frame-%04d.png";
const scale = num(args.scale, 512);
const crf = num(args.crf, 18);

// Effect parameters (film defaults, scaled by --strength unless explicitly set).
const bloom = num(args.bloom, 0.34 * strength);
const grain = num(args.grain, 7 * strength);
const vignette = num(args.vignette, 4.6);
const ca = num(args.ca, 1.1 * strength);
const warm = num(args.warm, 1.0 * strength);
const lens = !args["no-lens"];

const out = typeof args.out === "string" ? resolve(args.out) : null;
if (!out) {
  process.stderr.write("cinematic-grade: --out <path.mp4> is required\n");
  process.exit(2);
}

// Build the input args (either a frames dir or a single video).
let inputArgs;
if (typeof args.frames === "string") {
  const dir = resolve(args.frames);
  if (!existsSync(dir)) {
    process.stderr.write(`cinematic-grade: frames dir not found: ${dir}\n`);
    process.exit(1);
  }
  inputArgs = ["-y", "-framerate", String(fps), "-start_number", "0", "-i", `${dir}/${pattern}`];
} else if (typeof args.input === "string") {
  inputArgs = ["-y", "-i", resolve(args.input)];
} else {
  process.stderr.write("cinematic-grade: one of --frames <dir> or --input <video> is required\n");
  process.exit(2);
}

// --- Filter graph -----------------------------------------------------------
// 1) Bloom: blur a highlight-biased copy and screen it back → glow diffuses into
//    the surrounding "air", so emissive lines read as scattering light not decals.
// 2) Grade: gentle contrast/saturation, then a warm/cool split-tone that pushes
//    highlights toward tungsten (~3200K) and shadows toward daylight (~6500K).
// 3) Haze: tiny black lift so pure-black regions gain a hint of atmosphere.
// 4) Camera: vignette + chromatic aberration + mild barrel lens + film grain.
const cb = (v) => (Math.round(v * 1000) / 1000);
const parts = [];
parts.push("[0:v]format=gbrp,split=2[base][hi]");
parts.push(`[hi]gblur=sigma=${cb(8 * (0.6 + 0.4 * strength))}:steps=2,curves=all='0/0 0.55/0.28 1/1'[glow]`);
parts.push(`[base][glow]blend=all_mode=screen:all_opacity=${cb(Math.max(0, Math.min(0.9, bloom)))}[bloomed]`);

const grade = [];
grade.push(`eq=contrast=${cb(1 + 0.06 * strength)}:saturation=${cb(1 + 0.08 * strength)}:brightness=${cb(0.008 * strength)}`);
// Warm highlights, cool shadows (split-tone color temperature).
grade.push(
  `colorbalance=` +
  `rs=${cb(0.03 * warm)}:gs=${cb(0.0)}:bs=${cb(-0.03 * warm)}:` +
  `rm=${cb(0.05 * warm)}:gm=${cb(0.01 * warm)}:bm=${cb(-0.05 * warm)}:` +
  `rh=${cb(0.06 * warm)}:gh=${cb(0.0)}:bh=${cb(-0.07 * warm)}`
);
// Atmospheric haze: lift the floor of the curve slightly.
grade.push(`curves=all='0/${cb(0.018 * strength)} 1/0.985'`);
grade.push(`vignette=PI/${cb(vignette)}`);
if (ca > 0) grade.push(`rgbashift=rh=${Math.round(ca)}:bh=${-Math.round(ca)}`);
if (lens) grade.push(`lenscorrection=k1=${cb(-0.035 * strength)}:k2=${cb(-0.008 * strength)}:i=bilinear`);
if (grain > 0) grade.push(`noise=alls=${Math.round(grain)}:allf=t+u`);
if (scale > 0) grade.push(`scale=${scale}:${scale}:flags=lanczos`);
grade.push("format=yuv420p");

parts.push(`[bloomed]${grade.join(",")}[v]`);
const filtergraph = parts.join(";");

const ffmpegArgs = [
  ...inputArgs,
  "-filter_complex", filtergraph,
  "-map", "[v]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", String(crf),
  "-r", String(fps),
  out,
];

if (args.print) {
  process.stdout.write(`${ffmpeg} ${ffmpegArgs.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n`);
  process.exit(0);
}

process.stderr.write(`[cinematic-grade] ffmpeg=${ffmpeg}\n[cinematic-grade] filtergraph:\n  ${filtergraph}\n`);
try {
  execFileSync(ffmpeg, ffmpegArgs, { stdio: ["ignore", "inherit", "inherit"] });
} catch (err) {
  process.stderr.write(`cinematic-grade: ffmpeg failed: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
process.stderr.write(`[cinematic-grade] wrote ${out}\n`);
