#!/usr/bin/env node
/**
 * run-anime-continuity-5shot.mjs
 *
 * Constitutional Anime Rendering — 5-shot continuity cycle.
 * Same two characters · three camera angles · changing lighting ·
 * one 4D-portal transform · dual-run frozen-param replay.
 *
 * Status: **partial** (Engine3D soft-raster + profile-aligned cel banding).
 * Not photoreal. Not CKL-enforced. Ink-cel InkOptions binding remains declared.
 *
 * Usage (from repo root or package):
 *   node mrs/packages/engine3d-core/scripts/run-anime-continuity-5shot.mjs
 *   ENGINE3D_CONTINUITY=1 node ... --out-dir tmp/constitutional-anime-continuity-5shot
 *
 * Gate: --engine3d-continuity or ENGINE3D_CONTINUITY=1
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const REPO_ROOT = join(PKG_ROOT, "..", "..", "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function hexColorToRgb01(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function translateMat4(tx, ty, tz) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

function mulMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function scaleTranslate(sx, sy, sz, tx, ty, tz) {
  const S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  return mulMat4(translateMat4(tx, ty, tz), S);
}

function sha256Json(obj) {
  return createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex");
}

/** Profile-aligned cel banding (honest ink-cel post proxy). */
function applyCelBanding(beauty, width, height, boundaries, levels) {
  const out = new Uint8Array(beauty.length);
  const b0 = boundaries[0] ?? 0.3;
  const b1 = boundaries[1] ?? 0.7;
  const l0 = levels[0] ?? 0.18;
  const l1 = levels[1] ?? 0.62;
  const l2 = levels[2] ?? 1.0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = beauty[o] / 255;
    const g = beauty[o + 1] / 255;
    const b = beauty[o + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let band = l2;
    if (lum < b0) band = l0;
    else if (lum < b1) band = l1;
    const scale = lum > 1e-6 ? band / lum : band;
    out[o] = Math.max(0, Math.min(255, Math.round(r * scale * 255)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round(g * scale * 255)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round(b * scale * 255)));
    out[o + 3] = 255;
  }
  return out;
}

/** Cheap silhouette ink from depth/normal discontinuities (declared → partial proxy). */
function applyInkOutline(beauty, depth, normal, width, height, inkRgb, strength) {
  if (!depth || !normal || strength <= 0) return beauty;
  const out = new Uint8Array(beauty);
  const ink = inkRgb.map((c) => Math.round(c * 255));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const o = i * 4;
      const dC = depth[o];
      const dR = depth[((y) * width + (x + 1)) * 4];
      const dD = depth[((y + 1) * width + x) * 4];
      const nC = normal[o] + normal[o + 1] + normal[o + 2];
      const nR =
        normal[((y) * width + (x + 1)) * 4] +
        normal[((y) * width + (x + 1)) * 4 + 1] +
        normal[((y) * width + (x + 1)) * 4 + 2];
      const nD =
        normal[((y + 1) * width + x) * 4] +
        normal[((y + 1) * width + x) * 4 + 1] +
        normal[((y + 1) * width + x) * 4 + 2];
      const edge =
        Math.abs(dC - dR) > 12 ||
        Math.abs(dC - dD) > 12 ||
        Math.abs(nC - nR) > 40 ||
        Math.abs(nC - nD) > 40;
      if (edge) {
        const t = Math.min(1, strength);
        out[o] = Math.round(out[o] * (1 - t) + ink[0] * t);
        out[o + 1] = Math.round(out[o + 1] * (1 - t) + ink[1] * t);
        out[o + 2] = Math.round(out[o + 2] * (1 - t) + ink[2] * t);
      }
    }
  }
  return out;
}

function makeMaterial(api, baseColor, id, type = "basic", emissive = [0, 0, 0]) {
  const mat = api.rasterMaterialFromBaseColor(baseColor, id);
  mat.type = type;
  mat.emissive = emissive;
  if (type === "skin") mat.roughness = 0.5;
  if (type === "cloth") mat.roughness = 0.75;
  if (type === "emissive" || type === "tesseract-surface") {
    mat.roughness = 0.25;
  }
  return mat;
}

function buildCharacterMeshes(api, character, materials) {
  const [ox, oy, oz] = character.offset;
  const headM = scaleTranslate(1, 1, 1, ox, oy + 0.55, oz);
  const torsoM = scaleTranslate(1, 1, 1, ox, oy - 0.35, oz);
  const skinMat = makeMaterial(
    api,
    character.skinColor,
    `${character.id}.skin`,
    "skin",
  );
  const clothMat = makeMaterial(
    api,
    character.clothColor,
    `${character.id}.cloth`,
    "cloth",
  );
  const head = api.buildUvSphereMesh(
    `${character.id}.head`,
    0.42,
    24,
    16,
    character.skinColor,
    headM,
  );
  head.material = skinMat;
  const torso = api.buildBoxMesh(
    `${character.id}.torso`,
    [0.95, 0.85, 0.5],
    character.clothColor,
    torsoM,
  );
  torso.material = clothMat;
  materials.push(skinMat, clothMat);
  return [head, torso];
}

function buildPortalMeshes(api, remnant = false) {
  const scale = remnant ? 0.35 : 1.0;
  const emissive = remnant ? [0.35, 0.2, 0.7] : [0.55, 0.25, 1.2];
  const coreMat = makeMaterial(
    api,
    [0.5, 0.3, 1.0],
    "portal.core",
    "emissive",
    emissive,
  );
  const ringMat = makeMaterial(
    api,
    [0.2, 0.7, 1.0],
    "portal.ring",
    "tesseract-surface",
    remnant ? [0.1, 0.25, 0.5] : [0.2, 0.55, 1.0],
  );
  const core = api.buildBoxMesh(
    "portal.tesseract-core",
    [0.55 * scale, 0.55 * scale, 0.55 * scale],
    [0.5, 0.3, 1.0],
    scaleTranslate(1, 1, 1, 0, 0.35, 0.15),
  );
  core.material = coreMat;
  const ring = api.buildBoxMesh(
    "portal.frame",
    [1.1 * scale, 0.12 * scale, 1.1 * scale],
    [0.2, 0.7, 1.0],
    scaleTranslate(1, 1, 1, 0, 0.35, 0.15),
  );
  ring.material = ringMat;
  // Second slab → readable "impossible" cross (4D proxy, not RT4D path-trace)
  const cross = api.buildBoxMesh(
    "portal.cross-slab",
    [0.12 * scale, 1.1 * scale, 1.1 * scale],
    [0.8, 0.3, 1.0],
    scaleTranslate(1, 1, 1, 0, 0.35, 0.15),
  );
  cross.material = ringMat;
  return [core, ring, cross];
}

function buildGround(api, paletteShadow) {
  const mat = makeMaterial(api, paletteShadow, "env.ground", "stone");
  const ground = api.buildBoxMesh(
    "env.ground",
    [6, 0.08, 6],
    paletteShadow,
    scaleTranslate(1, 1, 1, 0, -0.85, 0),
  );
  ground.material = mat;
  return ground;
}

function resolveLights(api, preset) {
  if (preset.rig === "dramatic") {
    return api.createDramaticCinematicLightRig(preset.keyDir);
  }
  return api.createCinematicLightRig(preset.keyDir);
}

function gradeBias(beauty, width, height, bias) {
  if (!bias || bias === "neutral-cool") return beauty;
  const out = new Uint8Array(beauty);
  let wr = 1,
    wg = 1,
    wb = 1;
  if (bias === "warm" || bias === "soft-dawn") {
    wr = 1.08;
    wg = 1.0;
    wb = 0.92;
  } else if (bias === "cool-night") {
    wr = 0.88;
    wg = 0.95;
    wb = 1.12;
  } else if (bias === "spirit-violet") {
    wr = 1.05;
    wg = 0.9;
    wb = 1.18;
  }
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = Math.max(0, Math.min(255, Math.round(out[o] * wr)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round(out[o + 1] * wg)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round(out[o + 2] * wb)));
  }
  return out;
}

async function loadApi() {
  const dist = join(PKG_ROOT, "dist", "src", "index.js");
  if (!existsSync(dist)) {
    throw new Error(
      `Built module missing: ${dist}. Run: npm run build (in mrs/packages/engine3d-core)`,
    );
  }
  return import(pathToFileURL(dist).href);
}

function loadShotPlan(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadProfile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function freezeParams(params) {
  return JSON.parse(JSON.stringify(params));
}

function paramsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function renderShotPass(api, ctx) {
  const {
    shot,
    plan,
    profile,
    width,
    height,
    charById,
    camById,
    lightPresets,
  } = ctx;

  const camDef = camById.get(shot.cameraAngleId);
  if (!camDef) throw new Error(`Unknown cameraAngleId: ${shot.cameraAngleId}`);
  const lightPreset = lightPresets[shot.lightingPresetId];
  if (!lightPreset) {
    throw new Error(`Unknown lightingPresetId: ${shot.lightingPresetId}`);
  }

  const materials = [];
  const meshes = [];
  const shadowRgb = hexColorToRgb01(
    profile.color_palette?.roles?.shadow ?? "#3A2F4A",
  );
  meshes.push(buildGround(api, shadowRgb));

  for (const cid of shot.characterIds) {
    const ch = charById.get(cid);
    if (!ch) throw new Error(`Unknown characterId: ${cid}`);
    meshes.push(...buildCharacterMeshes(api, ch, materials));
  }

  if (shot.transform) {
    meshes.push(...buildPortalMeshes(api, false));
  } else if (shot.transformRemnant) {
    meshes.push(...buildPortalMeshes(api, true));
  }

  const camera = {
    id: camDef.id,
    eye: [...camDef.eye],
    lookAt: [...camDef.lookAt],
    up: [...(camDef.up || [0, 1, 0])],
    fovY: camDef.fovY ?? 0.78,
    near: 0.1,
    far: 40,
    width,
    height,
  };

  const lights = resolveLights(api, lightPreset);
  const clearColor = lightPreset.clearColor ?? [0.1, 0.1, 0.14];
  const gather = !!lightPreset.gatherEmissiveLights;

  const meshSignature = sha256Json(
    meshes.map((m) => ({
      id: m.id,
      baseColor: m.baseColor,
      modelMatrix: [...m.modelMatrix],
      posLen: m.positions.length,
      idxLen: m.indices.length,
    })),
  );

  const boundaries = profile.shadow_steps?.boundaries ?? [0.3, 0.7];
  const levels = profile.shadow_steps?.levels ?? [0.18, 0.62, 1.0];
  const inkStrength = profile.outline_rules?.inkStrength ?? 0.85;
  const inkColor = profile.outline_rules?.inkColor ?? [0.05, 0.05, 0.08];

  const parameters = freezeParams({
    width,
    height,
    seed: 42,
    camera,
    lights,
    clearColor,
    fogRgb: lightPreset.fogRgb ?? [0.56, 0.66, 0.77],
    fogStrength: lightPreset.fogStrength ?? 0.35,
    celBandBoundaries: boundaries,
    celBandLevels: levels,
    inkStrength,
    inkColor,
    gatherEmissiveLights: gather,
    meshSignature,
    gradeBias: lightPreset.gradeBias ?? "neutral-cool",
    cinematicLighting: false,
    supersample: 1,
  });

  const req = {
    camera,
    meshes,
    lights,
    clearColor,
    gatherEmissiveLights: gather,
    aov: { depth: true, normal: true },
    supersample: 1,
  };

  let buffers = api.renderStillBuffers(req);
  let beauty = buffers.beautyRgba;

  if (buffers.depthRgba) {
    beauty = api.applyDepthFog(
      beauty,
      buffers.depthRgba,
      width,
      height,
      parameters.fogRgb,
      parameters.fogStrength,
    );
  }
  beauty = applyCelBanding(
    beauty,
    width,
    height,
    parameters.celBandBoundaries,
    parameters.celBandLevels,
  );
  beauty = applyInkOutline(
    beauty,
    buffers.depthRgba,
    buffers.normalRgba,
    width,
    height,
    parameters.inkColor,
    parameters.inkStrength,
  );
  beauty = gradeBias(beauty, width, height, parameters.gradeBias);

  const finalBuffers = {
    width,
    height,
    beautyRgba: beauty,
    depthRgba: buffers.depthRgba,
    normalRgba: buffers.normalRgba,
  };

  return { parameters, buffers: finalBuffers, meshCount: meshes.length };
}

function writeReadme(outDir, summary) {
  const shotRows = summary.shots
    .map((s) => {
      const xf = s.transform
        ? "YES (4D portal)"
        : s.transformRemnant
          ? "remnant"
          : "no";
      const dr = s.dualRunMatch ? "PASS" : "FAIL";
      return (
        "| " +
        s.shotId +
        " | " +
        s.cameraAngleId +
        " | " +
        s.lightingPresetId +
        " | " +
        xf +
        " | " +
        dr +
        " |"
      );
    })
    .join("\n");
  const dualTag = summary.dualRunAllMatch ? "enforced" : "blocked";
  const body = [
    "# Constitutional Anime Continuity — 5-Shot Cycle",
    "",
    "| Field | Value |",
    "|---|---|",
    "| planId | `" + summary.planId + "` |",
    "| anime_world_profile_id | `" + summary.anime_world_profile_id + "` |",
    "| worldId | `" + summary.worldId + "` |",
    "| timelineId | `" + summary.timelineId + "` |",
    "| renderer | Engine3D soft-raster + cel/ink post proxy |",
    "| overallStatus | **" + summary.overallStatus + "** |",
    "| dualRunAllMatch | `" + summary.dualRunAllMatch + "` |",
    "| runAt | " + summary.runAt + " |",
    "",
    "## Product story",
    "",
    "Same two named characters across five shots, three camera angles,",
    "changing lighting, one 4D-portal transformation, complete replayable evidence chain.",
    "",
    "## How to re-run",
    "",
    "```bash",
    "cd mrs/packages/engine3d-core",
    "npm run build",
    "node scripts/run-anime-continuity-5shot.mjs --engine3d-continuity \\",
    "  --out-dir ../../../tmp/constitutional-anime-continuity-5shot",
    "```",
    "",
    "Optional: `--width 512 --height 512 --shot-plan <path>`",
    "",
    "## Shot table",
    "",
    "| Shot | Camera | Lighting | Transform | Dual-run |",
    "|---|---|---|---|---|",
    shotRows,
    "",
    "## Status tags",
    "",
    "| Concern | Tag |",
    "|---|---|",
    "| Soft-raster plates | **partial** |",
    "| Character continuity (shared mesh params) | **partial** (enforced in runner) |",
    "| Exactly 3 camera angles | **enforced** (plan + runner assert) |",
    "| Changing lighting | **partial** (presets frozen in evidence) |",
    "| 4D transform | **partial** (emissive tesseract proxy; not RT4D path-trace) |",
    "| Dual-run beauty sha256 | **" + dualTag + "** (this cycle) |",
    "| AnimeWorldProfile CKL gate | **declared** |",
    "| Ink-cel InkOptions binding | **declared** |",
    "| Lemonade SD beauty | **blocked** / unused on this path |",
    "| Photoreal | **non-claim** |",
    "",
    "## Evidence",
    "",
    "Per-shot: `shots/<shotId>/evidence.json` + `beauty.png`",
    "Cycle: `cycle-manifest.json` · Replay: `replay-report.json`",
    "",
    "Provenance fields: intentId, worldId, timelineId, timeSeconds, parameters (frozen),",
    "anime_world_profile_id, beauty_sha256, dual-run pass hashes.",
    "",
    "## Honest gaps",
    "",
    "- Cel/ink is a profile-aligned post proxy — not full ink-cel lane InkOptions.",
    "- Characters are stylized sphere/box silhouettes (governed costume colors), not production face GLBs.",
    "- Portal is soft-raster impossible-architecture proxy, not RT4D hypersphere path-trace.",
    "- CSE host ReplayService param replay remains **partial** at browser layer; this cycle proves dual-run frozen-param equality.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), body, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gated =
    args["engine3d-continuity"] === true ||
    process.env.ENGINE3D_CONTINUITY === "1" ||
    process.env.ENGINE3D_CONTINUITY === "true";
  if (!gated) {
    process.stderr.write(
      "run-anime-continuity-5shot: refused — pass --engine3d-continuity or set ENGINE3D_CONTINUITY=1\n",
    );
    process.exit(2);
  }

  const outDir = resolve(
    typeof args["out-dir"] === "string"
      ? args["out-dir"]
      : join(REPO_ROOT, "tmp", "constitutional-anime-continuity-5shot"),
  );
  mkdirSync(outDir, { recursive: true });

  const planPath = resolve(
    typeof args["shot-plan"] === "string"
      ? args["shot-plan"]
      : join(
          REPO_ROOT,
          "schemas",
          "anime",
          "examples",
          "continuity-5shot.shot-plan.json",
        ),
  );
  const plan = loadShotPlan(planPath);
  const profilePath = resolve(
    join(REPO_ROOT, plan.anime_world_profile_path),
  );
  const profile = loadProfile(profilePath);

  const width = Math.max(
    64,
    Math.min(1024, parseInt(String(args.width || "480"), 10) || 480),
  );
  const height = Math.max(
    64,
    Math.min(1024, parseInt(String(args.height || "360"), 10) || 360),
  );

  const api = await loadApi();

  // Continuity asserts
  const angleIds = new Set(plan.cameraAngles.map((c) => c.id));
  if (angleIds.size !== 3) {
    throw new Error(`Expected exactly 3 camera angles, got ${angleIds.size}`);
  }
  if (plan.characters.length !== 2) {
    throw new Error(`Expected exactly 2 characters, got ${plan.characters.length}`);
  }
  if (plan.shots.length !== 5) {
    throw new Error(`Expected exactly 5 shots, got ${plan.shots.length}`);
  }
  const usedAngles = new Set(plan.shots.map((s) => s.cameraAngleId));
  if (usedAngles.size !== 3) {
    throw new Error(
      `Shots must use all 3 angles (and only those); used=${[...usedAngles]}`,
    );
  }
  const transformShots = plan.shots.filter((s) => s.transform);
  if (transformShots.length !== 1) {
    throw new Error(`Expected exactly one transform shot, got ${transformShots.length}`);
  }
  for (const s of plan.shots) {
    for (const cid of s.characterIds) {
      if (!plan.characters.some((c) => c.id === cid)) {
        throw new Error(`Shot ${s.shotId} references unknown character ${cid}`);
      }
    }
  }

  const charById = new Map(plan.characters.map((c) => [c.id, c]));
  const camById = new Map(plan.cameraAngles.map((c) => [c.id, c]));
  const lightPresets = plan.lightingPresets;

  const shotSummaries = [];
  const replayRows = [];
  let dualRunAllMatch = true;

  for (const shot of plan.shots) {
    const shotDir = join(outDir, "shots", shot.shotId);
    mkdirSync(shotDir, { recursive: true });
    const ctx = {
      shot,
      plan,
      profile,
      width,
      height,
      charById,
      camById,
      lightPresets,
    };

    const pass1 = await renderShotPass(api, ctx);
    const files1 = api.writeStillPngs(pass1.buffers, shotDir, "");
    // Canonical beauty name
    const beautyPath = join(shotDir, "beauty.png");
    if (files1.beautyPath !== beautyPath && existsSync(files1.beautyPath)) {
      copyFileSync(files1.beautyPath, beautyPath);
    }

    // Dual-run: re-render from frozen params; assert sha256 equality
    const pass2 = await renderShotPass(api, ctx);
    const paramsMatch = paramsEqual(pass1.parameters, pass2.parameters);
    const png1 = readFileSync(files1.beautyPath);
    const files2 = api.writeStillPngs(pass2.buffers, shotDir, "replay-");
    const png2 = readFileSync(files2.beautyPath);
    const sha1 = api.sha256Hex(png1);
    const sha2 = api.sha256Hex(png2);
    const dualRunMatch = paramsMatch && sha1 === sha2;
    if (!dualRunMatch) dualRunAllMatch = false;

    const evidence = {
      schemaVersion: "1.0.0",
      kind: "continuity-shot-evidence",
      shotId: shot.shotId,
      intentId: shot.intentId,
      worldId: plan.worldId,
      timelineId: plan.timelineId,
      timeSeconds: shot.timeSeconds,
      anime_world_profile_id: plan.anime_world_profile_id,
      characterIds: [...shot.characterIds],
      cameraAngleId: shot.cameraAngleId,
      lightingPresetId: shot.lightingPresetId,
      transform: !!shot.transform,
      transformKind: shot.transformKind ?? null,
      transformRemnant: !!shot.transformRemnant,
      prompt: shot.prompt,
      beauty_path: beautyPath,
      beauty_sha256: sha1,
      depth_path: files1.depthPath ?? null,
      normal_path: files1.normalPath ?? null,
      parameters: pass1.parameters,
      meshCount: pass1.meshCount,
      replay: {
        mode: "dual-run-frozen-params",
        pass: 2,
        dualRunMatch,
        paramsEqual: paramsMatch,
        pass1_sha256: sha1,
        pass2_sha256: sha2,
        status: dualRunMatch ? "enforced" : "blocked",
      },
      statusTags: {
        plate: "partial",
        celInkProxy: "partial",
        characterContinuity: "partial",
        lighting: "partial",
        transform4d:
          shot.transform || shot.transformRemnant ? "partial" : "n/a",
        dualRun: dualRunMatch ? "enforced" : "blocked",
        cklAnimeGate: "declared",
        photoreal: "non-claim",
      },
      structure_source: "engine3d_raster",
      note:
        "Engine3D soft-raster continuity plate with profile-aligned cel/ink proxy. Not photoreal.",
    };

    writeFileSync(
      join(shotDir, "evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      join(shotDir, "parameters.frozen.json"),
      JSON.stringify(pass1.parameters, null, 2),
    );

    shotSummaries.push({
      shotId: shot.shotId,
      cameraAngleId: shot.cameraAngleId,
      lightingPresetId: shot.lightingPresetId,
      transform: !!shot.transform,
      transformRemnant: !!shot.transformRemnant,
      dualRunMatch,
      beauty_sha256: sha1,
      beauty_path: beautyPath,
    });
    replayRows.push({
      shotId: shot.shotId,
      dualRunMatch,
      paramsEqual: paramsMatch,
      pass1_sha256: sha1,
      pass2_sha256: sha2,
    });

    process.stderr.write(
      `  ${shot.shotId}: camera=${shot.cameraAngleId} light=${shot.lightingPresetId}` +
        ` transform=${!!shot.transform} dualRun=${dualRunMatch ? "PASS" : "FAIL"}\n`,
    );
  }

  const runAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const cycleManifest = {
    schemaVersion: "1.0.0",
    kind: "constitutional-anime-continuity-cycle",
    planId: plan.planId,
    anime_world_profile_id: plan.anime_world_profile_id,
    worldId: plan.worldId,
    timelineId: plan.timelineId,
    runAt,
    width,
    height,
    shotPlanPath: planPath,
    profilePath,
    shots: shotSummaries,
    cameraAnglesUsed: [...usedAngles],
    characters: plan.characters.map((c) => ({
      id: c.id,
      displayName: c.displayName,
    })),
    dualRunAllMatch,
    overallStatus: dualRunAllMatch ? "partial" : "partial-with-replay-gap",
    statusTags: {
      cycle: "partial",
      evidenceChain: "partial",
      dualRun: dualRunAllMatch ? "enforced" : "blocked",
      lemonadeSd: "blocked-unused",
      photoreal: "non-claim",
    },
  };

  const replayReport = {
    schemaVersion: "1.0.0",
    mode: "dual-run-frozen-params",
    status: dualRunAllMatch ? "enforced" : "blocked",
    note:
      "Each shot re-rendered from identical frozen parameters; beauty sha256 compared. " +
      "CSE ReplayService host-layer param replay remains partial.",
    allMatch: dualRunAllMatch,
    shots: replayRows,
  };

  writeFileSync(
    join(outDir, "cycle-manifest.json"),
    JSON.stringify(cycleManifest, null, 2),
  );
  writeFileSync(
    join(outDir, "replay-report.json"),
    JSON.stringify(replayReport, null, 2),
  );
  copyFileSync(planPath, join(outDir, "shot-plan.json"));
  copyFileSync(profilePath, join(outDir, "anime-world-profile.json"));

  writeReadme(outDir, {
    planId: plan.planId,
    anime_world_profile_id: plan.anime_world_profile_id,
    worldId: plan.worldId,
    timelineId: plan.timelineId,
    overallStatus: cycleManifest.overallStatus,
    dualRunAllMatch,
    runAt,
    shots: shotSummaries,
  });

  // Durable pointer README next to runner
  const durableReadme = join(__dirname, "README-anime-continuity-5shot.md");
  writeFileSync(
    durableReadme,
    [
      "# Anime Continuity 5-Shot Runner",
      "",
      "Script: `run-anime-continuity-5shot.mjs`",
      "Shot plan: `schemas/anime/examples/continuity-5shot.shot-plan.json`",
      "Evidence schema: `schemas/anime/ContinuityShotEvidence.v1.schema.json`",
      "Profile: `anime.mandala-cel.v1`",
      "",
      "```bash",
      "cd mrs/packages/engine3d-core && npm run build",
      "node scripts/run-anime-continuity-5shot.mjs --engine3d-continuity \\",
      "  --out-dir ../../../tmp/constitutional-anime-continuity-5shot",
      "```",
      "",
      "Outputs land under `tmp/` (gitignored). Commit the runner + shot plan + schema.",
      "",
    ].join("\n"),
    "utf8",
  );

  process.stdout.write(
    JSON.stringify({
      kind: "constitutional-anime-continuity-5shot",
      status: "ok",
      outDir,
      dualRunAllMatch,
      shots: shotSummaries.map((s) => s.shotId),
    }) + "\n",
  );

  if (!dualRunAllMatch) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`run-anime-continuity-5shot: ${err?.stack || err}\n`);
  process.exit(1);
});
