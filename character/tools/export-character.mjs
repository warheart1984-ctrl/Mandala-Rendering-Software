#!/usr/bin/env node
/**
 * Character pipeline export CLI.
 *
 * One character asset → three stage views (not three characters):
 *   Stage 1  char_wire.glb     + char_wire_render.png
 *   Stage 2  char_rigged.glb   + char_rig_view.png
 *   Stage 3  char_final.glb    + char_final.png  (+ optional char_final.mp4)
 *
 * Usage (from repo root):
 *   node character/tools/export-character.mjs
 *   node character/tools/export-character.mjs --width 128 --preset wire_sim
 *   node character/tools/export-character.mjs --source character/models/source/default-humanoid.json
 *
 * Status: Stage 1 working (procedural mesh + CPU raster).
 *         Stage 2 partial (armature + nearest-bone weights).
 *         Stage 3 partial (PBR specs + Lambert/Blinn stand-in; not Cycles).
 *         Blender/ZBrush: blocked-with-evidence (not on PATH / not required).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

import { buildCharacter, applyTranslationPose, skinPositions, BONE_ORDER, BONE_PARENTS } from "./lib/humanoid-mesh.mjs";
import { encodeGlb, inverseBindFromWorldTranslations, flattenEnergyLines } from "./lib/glb-encode.mjs";
import { renderWire, renderRigView, renderBeauty, orbitCamera } from "./lib/raster-still.mjs";
import { applySim } from "./lib/apply-sim.mjs";
import { exportFbxStub } from "./fbx-export.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PIPELINE_ROOT, "..");
const FFMPEG = resolve(REPO_ROOT, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");

function parseArgs(argv) {
  const opts = {
    source: resolve(PIPELINE_ROOT, "models/source/default-humanoid.json"),
    width: 128,
    height: 128,
    preset: "all",
    turntable: true,
    frame: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") opts.source = resolve(argv[++i]);
    else if (a === "--width") opts.width = parseInt(argv[++i], 10);
    else if (a === "--height") opts.height = parseInt(argv[++i], 10);
    else if (a === "--preset") opts.preset = argv[++i];
    else if (a === "--no-turntable") opts.turntable = false;
    else if (a === "--frame") opts.frame = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extras(stage, character, extra = {}) {
  return {
    mrsCharacterPipeline: {
      assetId: character.sourceId,
      stage,
      oneAssetThreeViews: true,
      status: {
        mesh: "partial",
        skinning: "partial",
        sim: "partial",
        beauty: stage === "final" ? "partial" : "n/a",
        blender: "blocked-with-evidence",
        zbrush: "blocked-with-evidence",
      },
      simulationChamberHook: "character/tools/simulation-chamber-hook.mjs",
      ...extra,
    },
  };
}

function armatureNodes(character) {
  const local = character.boneLocal;
  const indexOf = (name) => BONE_ORDER.indexOf(name);
  const childrenOf = (name) =>
    BONE_ORDER.map((n, i) => (BONE_PARENTS[n] === name ? i : -1)).filter((i) => i >= 0);
  return BONE_ORDER.map((name) => ({
    name,
    translation: local[name],
    children: childrenOf(name),
  }));
}

function splitByRegion(character, positions) {
  const regions = ["skin", "metal", "leather", "fur", "fabric"];
  const meshes = [];
  for (const region of regions) {
    const remap = new Map();
    const pos = [];
    const nrm = [];
    const uv = [];
    const jnt = [];
    const wgt = [];
    const idx = [];
    const take = (vi) => {
      if (remap.has(vi)) return remap.get(vi);
      const ni = pos.length / 3;
      remap.set(vi, ni);
      pos.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
      nrm.push(character.normals[vi * 3], character.normals[vi * 3 + 1], character.normals[vi * 3 + 2]);
      uv.push(character.uvs[vi * 2], character.uvs[vi * 2 + 1]);
      jnt.push(character.joints0[vi * 4], character.joints0[vi * 4 + 1], character.joints0[vi * 4 + 2], character.joints0[vi * 4 + 3]);
      wgt.push(character.weights0[vi * 4], character.weights0[vi * 4 + 1], character.weights0[vi * 4 + 2], character.weights0[vi * 4 + 3]);
      return ni;
    };
    for (let t = 0; t < character.indices.length; t += 3) {
      const a = character.indices[t];
      const b = character.indices[t + 1];
      const c = character.indices[t + 2];
      if (character.regions[a] !== region) continue;
      idx.push(take(a), take(b), take(c));
    }
    if (!idx.length) continue;
    meshes.push({
      name: `body_${region}`,
      mode: 4,
      positions: new Float32Array(pos),
      normals: new Float32Array(nrm),
      uvs: new Float32Array(uv),
      joints: new Uint8Array(jnt),
      weights: new Float32Array(wgt),
      indices: new Uint32Array(idx),
      material: regions.indexOf(region),
    });
  }
  return meshes;
}

const MATS = {
  skin: { name: "skin", pbr: { baseColor: [0.72, 0.52, 0.42, 1], metallic: 0, roughness: 0.48, emissive: [0, 0, 0] } },
  metal: { name: "metal", pbr: { baseColor: [0.72, 0.74, 0.78, 1], metallic: 1, roughness: 0.18, emissive: [0.04, 0.045, 0.055] } },
  leather: { name: "leather", pbr: { baseColor: [0.28, 0.14, 0.08, 1], metallic: 0.04, roughness: 0.72, emissive: [0, 0, 0] } },
  fur: { name: "fur", pbr: { baseColor: [0.22, 0.12, 0.08, 1], metallic: 0.02, roughness: 0.38, emissive: [0.02, 0.01, 0] } },
  fabric: { name: "fabric", pbr: { baseColor: [0.12, 0.16, 0.28, 1], metallic: 0, roughness: 0.82, emissive: [0.01, 0.02, 0.05] } },
  wire: { name: "wire", pbr: { baseColor: [0.55, 0.75, 0.9, 1], metallic: 0, roughness: 0.4, emissive: [0.05, 0.12, 0.18] } },
  energy: { name: "energy", pbr: { baseColor: [0.2, 0.9, 1, 1], metallic: 0, roughness: 0.2, emissive: [0.15, 0.7, 1] } },
};

export function exportCharacterPipeline(options = {}) {
  const source = options.sourceJson || loadJson(options.sourcePath);
  const character = buildCharacter(source);
  const pose = source.pose || {};
  const posedJoints = applyTranslationPose(character, pose);
  const skinned = skinPositions(character, posedJoints);

  const wirePreset = loadJson(resolve(PIPELINE_ROOT, "sim/presets/wire_sim.json"));
  const beautyPreset = loadJson(resolve(PIPELINE_ROOT, "sim/presets/beauty_sim.json"));
  const simWire = applySim(character, skinned, wirePreset, options.frame ?? 0);
  const simBeauty = applySim(character, skinned, beautyPreset, options.frame ?? 0);

  const exportsDir = resolve(PIPELINE_ROOT, "models/exports");
  const rendersDir = resolve(PIPELINE_ROOT, "renders");
  mkdirSync(exportsDir, { recursive: true });
  mkdirSync(rendersDir, { recursive: true });

  const boneNodes = armatureNodes(character);
  const ibm = inverseBindFromWorldTranslations(character.boneWorld);
  const skinDef = {
    name: "Armature",
    joints: BONE_ORDER.map((_, i) => i),
    inverseBindMatrices: ibm,
    skeleton: 0,
  };

  const energy = flattenEnergyLines(simWire.energyCurves);

  const wireGlb = encodeGlb({
    extras: extras("wire", character, { preset: "wire_sim" }),
    materials: [MATS.wire, MATS.energy],
    meshes: [
      {
        name: "char_wire",
        mode: 4,
        positions: simWire.positions,
        normals: character.normals,
        uvs: character.uvs,
        indices: character.indices,
        material: 0,
      },
      {
        name: "energy_curves",
        mode: 1,
        positions: energy.positions,
        indices: energy.indices,
        material: 1,
      },
    ],
    nodes: [
      { name: "char_wire", mesh: 0 },
      { name: "energy_curves", mesh: 1 },
    ],
  });

  const meshNodeIndex = BONE_ORDER.length;
  const riggedGlb = encodeGlb({
    extras: extras("rigged", character, {
      simHooks: ["cloth_cape", "hair_scalp", "collide_hips", "collide_shoulders", "collide_chest"],
      bones: BONE_ORDER,
    }),
    materials: [MATS.skin],
    meshes: [
      {
        name: "char_rigged",
        mode: 4,
        positions: character.positions,
        normals: character.normals,
        uvs: character.uvs,
        indices: character.indices,
        joints: character.joints0,
        weights: character.weights0,
        material: 0,
      },
    ],
    nodes: [
      ...boneNodes,
      { name: "char_mesh", mesh: 0, skin: 0 },
    ],
    skins: [skinDef],
  });
  void meshNodeIndex;

  const regionMeshes = splitByRegion(character, simBeauty.positions);
  const finalGlb = encodeGlb({
    extras: extras("final", character, { preset: "beauty_sim", materials: ["fur", "leather", "metal", "skin", "fabric"] }),
    materials: [MATS.skin, MATS.metal, MATS.leather, MATS.fur, MATS.fabric],
    meshes: regionMeshes,
    nodes: regionMeshes.map((m, i) => ({ name: m.name, mesh: i })),
  });

  const width = options.width || 128;
  const height = options.height || 128;
  const wirePng = renderWire(character, simWire.positions, {
    width, height, energyCurves: simWire.energyCurves,
  });
  const rigPng = renderRigView(character, simWire.positions, posedJoints, { width, height });
  const finalPng = renderBeauty(character, simBeauty.positions, {
    width, height, hairCurves: simBeauty.hairCurves,
  });

  const paths = {
    char_wire: resolve(exportsDir, "char_wire.glb"),
    char_rigged: resolve(exportsDir, "char_rigged.glb"),
    char_final: resolve(exportsDir, "char_final.glb"),
    char_wire_render: resolve(rendersDir, "char_wire_render.png"),
    char_rig_view: resolve(rendersDir, "char_rig_view.png"),
    char_final_png: resolve(rendersDir, "char_final.png"),
  };
  writeFileSync(paths.char_wire, wireGlb);
  writeFileSync(paths.char_rigged, riggedGlb);
  writeFileSync(paths.char_final, finalGlb);
  writeFileSync(paths.char_wire_render, wirePng);
  writeFileSync(paths.char_rig_view, rigPng);
  writeFileSync(paths.char_final_png, finalPng);

  const fbx = exportFbxStub(resolve(exportsDir, "char_rigged.fbx.json"), character);

  let turntable = null;
  if (options.turntable !== false && existsSync(FFMPEG)) {
    const framesDir = resolve(rendersDir, "turntable-frames");
    mkdirSync(framesDir, { recursive: true });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const cam = orbitCamera((i / n) * Math.PI * 2);
      const png = renderBeauty(character, simBeauty.positions, {
        width, height, camera: cam, hairCurves: simBeauty.hairCurves,
      });
      writeFileSync(resolve(framesDir, `frame-${String(i).padStart(4, "0")}.png`), png);
    }
    const mp4 = resolve(rendersDir, "char_final.mp4");
    try {
      execSync(
        `"${FFMPEG}" -y -framerate 8 -i "${framesDir}/frame-%04d.png" -c:v libx264 -pix_fmt yuv420p "${mp4}"`,
        { stdio: "pipe", timeout: 20000 },
      );
      turntable = mp4;
    } catch (err) {
      turntable = { status: "blocked-with-evidence", error: String(err.message || err).slice(0, 120) };
    }
  } else if (options.turntable !== false) {
    turntable = { status: "blocked-with-evidence", error: `ffmpeg not found at ${FFMPEG}` };
  }

  const receipt = {
    assetId: character.sourceId,
    vertexCount: character.vertexCount,
    quadCount: character.quadCount,
    triCount: character.triCount,
    bones: BONE_ORDER,
    hashes: {
      char_wire: sha256(wireGlb),
      char_rigged: sha256(riggedGlb),
      char_final: sha256(finalGlb),
    },
    byteLengths: {
      char_wire: wireGlb.length,
      char_rigged: riggedGlb.length,
      char_final: finalGlb.length,
      char_wire_render: wirePng.length,
      char_rig_view: rigPng.length,
      char_final_png: finalPng.length,
    },
    status: {
      stage1_wire: "working",
      stage2_rigged: "partial",
      stage3_final: "partial",
      sim: "partial",
      blender: "blocked-with-evidence",
      zbrush: "blocked-with-evidence",
      fbx: fbx.status,
      turntable: turntable && typeof turntable === "string" ? "partial" : (turntable?.status || "skipped"),
    },
    paths,
    turntable,
    fbx: fbx.path,
  };

  const receiptMd = [
    "# Character pipeline export receipt",
    "",
    `- asset: \`${character.sourceId}\``,
    `- verts: ${character.vertexCount}  quads: ${character.quadCount}  tris: ${character.triCount}`,
    `- Stage 1 wire: **working** — \`${paths.char_wire}\` (${wireGlb.length} bytes)`,
    `- Stage 2 rigged: **partial** — \`${paths.char_rigged}\` (${riggedGlb.length} bytes)`,
    `- Stage 3 final: **partial** — \`${paths.char_final}\` (${finalGlb.length} bytes)`,
    `- renders: char_wire_render.png, char_rig_view.png, char_final.png`,
    `- sim presets: wire_sim / beauty_sim (CPU stand-in, frame ${options.frame ?? 0})`,
    `- Blender: blocked-with-evidence (not on PATH)`,
    `- ZBrush: blocked-with-evidence (not used)`,
    `- Simulation Chamber hook: \`character/tools/simulation-chamber-hook.mjs\` → consume \`char_rigged.glb\``,
    "",
  ].join("\n");
  writeFileSync(resolve(rendersDir, "export-receipt.md"), receiptMd);

  return { character, receipt };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node character/tools/export-character.mjs [options]
  --source <json>   Character source (default: models/source/default-humanoid.json)
  --width N         Still width (default 128)
  --height N        Still height (default 128)
  --preset NAME     wire_sim | beauty_sim | all (default all)
  --no-turntable    Skip optional MP4
  --frame N         Sim frame (default 0)`);
    process.exit(0);
  }
  console.log("Character pipeline export — one asset, three views");
  console.log("  source:", opts.source);
  const { receipt } = exportCharacterPipeline({
    sourcePath: opts.source,
    width: opts.width,
    height: opts.height,
    turntable: opts.turntable,
    frame: opts.frame,
  });
  console.log("  verts:", receipt.vertexCount, "quads:", receipt.quadCount);
  console.log("  wrote:", receipt.paths.char_wire);
  console.log("  wrote:", receipt.paths.char_rigged);
  console.log("  wrote:", receipt.paths.char_final);
  console.log("  wrote:", receipt.paths.char_wire_render);
  console.log("  wrote:", receipt.paths.char_rig_view);
  console.log("  wrote:", receipt.paths.char_final_png);
  if (typeof receipt.turntable === "string") console.log("  wrote:", receipt.turntable);
  else if (receipt.turntable) console.log("  turntable:", receipt.turntable.status, receipt.turntable.error || "");
  console.log("  status:", JSON.stringify(receipt.status));
}
