/**
 * Stage orchestrator: one asset → sim → three GLB + PNG exports.
 *
 * Always runs sim before wire, rig, and beauty. Same CharacterAsset.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { buildCharacterAsset } from "../models/character.mjs";
import { runCharacterSim } from "../sim/run-sim.mjs";
import { rasterStage } from "../renders/presets.mjs";
import { exportCharacterGlb } from "./export-glb.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FFMPEG = resolve(__dirname, "../../runtime/toolchain/ffmpeg/usr/bin/ffmpeg");

/**
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {"human"|"anthro"} [opts.species]
 * @param {string} opts.outDir
 * @param {number} [opts.width]
 * @param {number} [opts.simFrames]
 * @param {boolean} [opts.turntable]
 */
export function buildPipeline(opts) {
  const id = opts.id || "char";
  const outDir = resolve(opts.outDir);
  mkdirSync(outDir, { recursive: true });

  const asset = buildCharacterAsset({ id, species: opts.species || "human" });
  const sim = runCharacterSim(asset, { frames: opts.simFrames ?? 12 });
  const size = opts.width || 384;

  const wireGlb = exportCharacterGlb(asset, "wire", sim);
  const rigGlb = exportCharacterGlb(asset, "rigged", sim);
  const finalGlb = exportCharacterGlb(asset, "final", sim);

  const wirePng = rasterStage(asset, sim, "wire", { width: size, height: size });
  const rigPng = rasterStage(asset, sim, "rig", { width: size, height: size });
  const finalPng = rasterStage(asset, sim, "beauty", { width: size, height: size });

  const paths = {
    char_wire_glb: resolve(outDir, "char_wire.glb"),
    char_wire_png: resolve(outDir, "char_wire_render.png"),
    char_rigged_glb: resolve(outDir, "char_rigged.glb"),
    char_rig_png: resolve(outDir, "char_rig_view.png"),
    char_final_glb: resolve(outDir, "char_final.glb"),
    char_final_png: resolve(outDir, "char_final.png"),
    manifest: resolve(outDir, "pipeline-manifest.json"),
  };

  writeFileSync(paths.char_wire_glb, wireGlb);
  writeFileSync(paths.char_wire_png, wirePng);
  writeFileSync(paths.char_rigged_glb, rigGlb);
  writeFileSync(paths.char_rig_png, rigPng);
  writeFileSync(paths.char_final_glb, finalGlb);
  writeFileSync(paths.char_final_png, finalPng);

  let turntable = null;
  if (opts.turntable) {
    const framesDir = resolve(outDir, "turntable");
    mkdirSync(framesDir, { recursive: true });
    const n = opts.turntableFrames || 16;
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2;
      const png = rasterStage(asset, sim, "beauty", { width: size, height: size, yaw });
      writeFileSync(resolve(framesDir, `frame-${String(i).padStart(4, "0")}.png`), png);
    }
    const mp4 = resolve(outDir, "char_final.mp4");
    if (existsSync(FFMPEG)) {
      try {
        execSync(
          `"${FFMPEG}" -y -framerate 12 -i "${framesDir}/frame-%04d.png" -c:v libx264 -pix_fmt yuv420p "${mp4}"`,
          { stdio: "pipe", timeout: 20000 },
        );
        turntable = mp4;
        paths.char_final_mp4 = mp4;
      } catch {
        turntable = { status: "partial", reason: "ffmpeg encode failed" };
      }
    } else {
      turntable = { status: "declared", reason: "ffmpeg binary missing" };
    }
  }

  const manifest = {
    id,
    species: asset.species,
    status: asset.status,
    sim: { ran: sim.ran, frames: sim.frames, cloakMoved: sim.cloakMoved, status: sim.status },
    topology: { verts: asset.mesh.vertexCount, quads: asset.mesh.faceCount, ok: asset.topo.ok },
    armature: asset.bones,
    presets: ["wire_sim", "beauty_sim"],
    exports: Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, v])),
    turntable,
    organ: {
      mandala: "pixels",
      simulationChamber: "motion-hooks",
    },
  };
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));
  return { asset, sim, paths, manifest };
}
