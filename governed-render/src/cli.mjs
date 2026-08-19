#!/usr/bin/env node
/**
 * Studio trial CLI for governed-render.
 *
 * Renders a governed still + a governed movie, writes PNG/MP4 + record JSON to
 * output/, and prints a concise trial summary so a studio can see exactly what
 * they'd get: deterministic replay + FMCE constitutional evidence per artifact.
 *
 * Usage:
 *   npm run trial
 *   npm run trial -- --prompt "cyan tesseract lattice" --seed 20260816 --width 448
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderGovernedStill, renderGovernedMovie, ffmpegAvailable, OUTPUT_ROOT, FIXED_TIMESTAMP } from "./core.mjs";

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
}

const prompt = opt("--prompt", "cyan tesseract lattice");
const seed = Number(opt("--seed", "20260816"));
const width = Number(opt("--width", "256"));
const height = Number(opt("--height", "256"));
const samples = Number(opt("--samples", "16"));
const frames = Number(opt("--frames", "16"));
const fps = Number(opt("--fps", "8"));
const movieW = Number(opt("--movie-width", "160"));
const movieH = Number(opt("--movie-height", "160"));

const outDir = join(OUTPUT_ROOT, "trial");
mkdirSync(outDir, { recursive: true });

console.log(`[governed-render] trial prompt="${prompt}" seed=${seed}`);
console.log(`[governed-render] deterministic RT4D render, NOT text-to-image / NOT diffusion.`);

const { record, png } = renderGovernedStill({ prompt, seed, width, height, samples });
writeFileSync(join(outDir, "still.png"), png);
writeFileSync(join(outDir, "still-record.json"), JSON.stringify(record, null, 2));

console.log(`\n[still]  ${width}x${height}@${samples}  credits=${record.credits}`);
console.log(`[still]  sha256   ${record.provenance.sha256}`);
console.log(`[still]  replay   verified=${record.replay.verified}`);
console.log(`[still]  D-class  ${record.constitution.finalDeterminismClass} / ${record.constitution.finalStatus}`);
console.log(`[still]  decision ${record.constitution.decision}`);
console.log(`[still]  -> output/trial/still.png`);

const hasFfmpeg = ffmpegAvailable();
console.log(`\n[movie]  ffmpeg   ${hasFfmpeg ? "available" : "NOT FOUND (frames only)"}`);
const movie = renderGovernedMovie({ prompt, seed, width: movieW, height: movieH, samples: 8, frames, fps });
writeFileSync(join(outDir, "movie-record.json"), JSON.stringify(movie.record, null, 2));
console.log(`[movie]  ${movieW}x${movieH}@8  frames=${frames} fps=${fps}  credits=${movie.record.credits}`);
console.log(`[movie]  movieHash ${movie.record.movieHash}`);
console.log(`[movie]  replay   verified=${movie.record.replay.verified}`);
console.log(`[movie]  -> output/trial/frames/ (${frames} PNG)`);
if (movie.mp4) console.log(`[movie]  -> ${movie.mp4}`);

console.log(`\n[record] every artifact carries FMCE evidence + authority token.`);
console.log(`[record] validatedAt=${FIXED_TIMESTAMP}`);
console.log(`\nTRIAL COMPLETE — browse output/trial/.`);
