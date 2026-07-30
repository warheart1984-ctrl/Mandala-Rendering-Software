#!/usr/bin/env node
/**
 * mrs:governed-render — one prompt → one governed soft-raster still + trail.
 *
 * STATUS: **partial**
 * - Primary pixel path: Engine3D soft-raster (deterministic seed) — not photoreal / not SDXL.
 * - Amendment VII soft gates + VIII world-profile soft wrap before raster.
 * - CCC-ImageGen selection logged for honesty; Lemonade **held** (never production claim here).
 * - opencl.gen optional assist if --provider opencl.gen and available; does not block MVP.
 * - Optional `--beauty remote|external-pbr`: photoreal.* providers.
 *   remote = URL stub; external-pbr = local GLB export Held + Cycles when Blender
 *   available — never invent a photoreal PNG labeled as beauty.
 *
 * Usage:
 *   npm run mrs:governed-render -- --prompt "dim room soft light"
 *   npm run mrs:governed-render -- --prompt "…" --beauty remote
 *   node scripts/governed-render.mjs --prompt "…" [--seed 1] [--width 512] [--height 400]
 *
 * Reproducibility: same prompt + seed + width + height + provider + beauty → same runId folder
 * and same soft-raster bytes (Engine3D CPU path). Timestamp in trail is non-content.
 */

import { createHash } from "node:crypto";
import {
  spawnSync,
} from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const ENGINE3D = join(REPO, "mrs", "packages", "engine3d-core");

function parseArgs(argv) {
  const out = {
    prompt: null,
    seed: 1,
    width: 512,
    height: 400,
    provider: "auto",
    beauty: "none",
    outRoot: join(REPO, "tmp", "governed-render"),
    skipVii: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--seed") out.seed = Number(argv[++i] ?? 1);
    else if (a === "--width") out.width = Number(argv[++i] ?? 512);
    else if (a === "--height") out.height = Number(argv[++i] ?? 400);
    else if (a === "--provider") out.provider = String(argv[++i] || "auto");
    else if (a === "--beauty") out.beauty = String(argv[++i] || "none");
    else if (a === "--out-root") out.outRoot = resolve(argv[++i]);
    else if (a === "--skip-vii") out.skipVii = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function runIdFrom(prompt, seed, width, height, provider, beauty = "none") {
  const beautyNorm = String(beauty || "none").trim().toLowerCase() || "none";
  const canonicalObj = {
    prompt: String(prompt).trim(),
    seed: Number(seed),
    width: Number(width),
    height: Number(height),
    provider: String(provider),
    pipeline: "governed-render.v1.engine3d-soft",
  };
  // Keep layout-only runIds stable when beauty is none (matches pre-beauty MVP proofs).
  if (beautyNorm !== "none") {
    canonicalObj.beauty = beautyNorm;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalObj))
    .digest("hex")
    .slice(0, 16);
}

function sha256File(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function ensureEngine3dDist() {
  const dist = join(ENGINE3D, "dist", "src", "index.js");
  if (existsSync(dist)) return dist;
  const r = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build"],
    { cwd: ENGINE3D, stdio: "inherit", shell: false },
  );
  if (r.status !== 0) {
    throw new Error("engine3d-core build failed — required for governed-render");
  }
  if (!existsSync(dist)) {
    throw new Error(`Missing ${dist} after build`);
  }
  return dist;
}

async function applyConstitutionalWrap(opts) {
  const wrapPath = join(
    REPO,
    "sovereign-x/router/modules/gpu/amd/clGenConstitutionalWrap.js",
  );
  if (!existsSync(wrapPath)) {
    return {
      ok: true,
      skipped: true,
      reason: "clGenConstitutionalWrap missing — soft continue",
      gates: [],
    };
  }
  const {
    applyClGenConstitutionalWrap,
    buildClGenIntent,
    buildClGenLawfulEvidence,
  } = await import(pathToFileURL(wrapPath).href);

  if (opts.skipVii) {
    return applyClGenConstitutionalWrap({ skipConstitutional: true });
  }
  return applyClGenConstitutionalWrap({
    intent: buildClGenIntent({
      intentId: opts.intentId,
      worldId: "interior.dim-room",
    }),
    evidence: buildClGenLawfulEvidence({
      evidenceId: `ev-${opts.runId}`,
      worldContext: "interior.dim-room",
    }),
  });
}

async function loadImageGenProviderMod() {
  return import(
    pathToFileURL(
      join(REPO, "sovereign-x/router/modules/gpu/amd/ImageGenProvider.js"),
    ).href
  );
}

async function selectCccHonesty(env) {
  try {
    const mod = await loadImageGenProviderMod();
    // Lemonade held: force local.gpu down for selection honesty on this MVP path.
    const sel = mod.selectImageGenProvider(
      { ...env, IMAGE_GEN_FORCE_GPU_DOWN: "1" },
      { localGpuAvailable: false },
    );
    return {
      capability: mod.CAPABILITY_ID,
      selected: sel.selected,
      available: sel.available,
      fallbackUsed: sel.fallbackUsed,
      reason: sel.reason,
      note:
        "CCC cascade logged for honesty; governed-render production pixels are engine3d.soft (not Lemonade).",
    };
  } catch (err) {
    return {
      capability: "image.gen.provider",
      error: err instanceof Error ? err.message : String(err),
      note: "CCC select unavailable",
    };
  }
}

/**
 * Optional photoreal beauty selection (--beauty remote|external-pbr).
 * external-pbr runs local GLB export (Held) + Cycles when Blender available.
 * Never invents a photoreal PNG.
 */
async function resolveBeautyProvider(beautyMode, env, attemptOpts = {}) {
  try {
    const mod = await loadImageGenProviderMod();
    const selection = mod.selectPhotorealBeautyProvider(beautyMode, env);
    let attempt = null;
    if (selection.selected) {
      attempt = await mod.attemptPhotorealBeautyProvider(selection.selected, {
        env,
        ...attemptOpts,
      });
    }
    return {
      mode: beautyMode,
      selection,
      attempt,
      note:
        "Beauty is optional photoreal provider; layout still is engine3d.soft / opencl.gen. No fake photoreal PNG.",
    };
  } catch (err) {
    return {
      mode: beautyMode,
      error: err instanceof Error ? err.message : String(err),
      note: "beauty provider select unavailable",
    };
  }
}

/**
 * Prompt → soft scene knobs (deterministic heuristics; not LLM).
 * STATUS: **partial**
 */
function promptToSceneHints(prompt, seed) {
  const p = String(prompt).toLowerCase();
  const dim = /dim|dark|night|candle|moody/.test(p);
  const bright = /bright|day|sun|window/.test(p);
  const warm = /warm|amber|candle|fire/.test(p);
  const cool = /cool|blue|moon|cold/.test(p);
  let clear = [0.08, 0.07, 0.09];
  if (dim) clear = [0.05, 0.045, 0.06];
  if (bright) clear = [0.14, 0.13, 0.12];
  if (warm) clear = [0.09, 0.06, 0.045];
  if (cool) clear = [0.06, 0.07, 0.1];
  // Seed nudges camera slightly but stays reproducible.
  const jitter = ((Number(seed) % 7) - 3) * 0.02;
  return {
    clearColor: clear,
    vignette: dim ? 0.42 : 0.32,
    focusDepth: 0.45,
    eye: [0.15 + jitter, 1.05, 2.6],
    lookAt: [-0.35, 0.85, 0.4],
    worldProfileId: "world.architecture",
    worldContext: "interior.dim-room",
  };
}

async function renderEngine3dSoft(api, opts, hints, viiMeshes) {
  const {
    buildBoxMesh,
    buildPortraitRasterMeshesFromHumanRig,
    resolveHumanFacePath,
    createUniversalMaterial,
    rasterMaterialFromUniversal,
    HeadlessGLStillRenderer,
    encodePngRgba,
    applyAmendmentVIIToMeshes,
    createDramaticCinematicLightRig,
    applyScreenSpaceAo,
    applyCinematicColorGrade,
    applyDepthOfFieldProxy,
  } = api;

  const wood = rasterMaterialFromUniversal(
    createUniversalMaterial({
      id: "wood",
      materialType: "wood",
      baseColor: [0.42, 0.28, 0.16],
      roughness: 0.72,
    }),
  );
  const plaster = rasterMaterialFromUniversal(
    createUniversalMaterial({
      id: "plaster",
      materialType: "plaster",
      baseColor: [0.55, 0.52, 0.48],
      roughness: 0.85,
    }),
  );
  const cloth = rasterMaterialFromUniversal(
    createUniversalMaterial({
      id: "cloth",
      materialType: "fabric",
      baseColor: [0.12, 0.14, 0.2],
      roughness: 0.9,
    }),
  );

  let faceMeshes = viiMeshes;
  let viiReport = null;
  if (!faceMeshes) {
    const face = resolveHumanFacePath("HumanFaceRigged");
    if (!existsSync(face.path)) {
      throw new Error(`Face fixture missing: ${face.path}`);
    }
    const rawFace = buildPortraitRasterMeshesFromHumanRig(face.path);
    if (!rawFace?.length) {
      throw new Error("Failed to load face meshes from HumanFaceRigged.glb");
    }
    if (!opts.skipVii && applyAmendmentVIIToMeshes) {
      const gated = applyAmendmentVIIToMeshes({
        meshes: rawFace,
        scaleClassOrProfileId: "human-sized",
        mode: "soft",
        bakeScale: false,
      });
      if (!gated.ok) {
        throw new Error(
          `Amendment VII soft apply failed: ${gated.haltCode} ${(gated.issues || []).join(",")}`,
        );
      }
      faceMeshes = gated.meshes;
      viiReport = {
        ok: true,
        uniformScale: gated.uniformScale,
        organicVarianceBefore: gated.organicVarianceBefore,
        organicVarianceAfter: gated.organicVarianceAfter,
        asymmetryApplied: gated.asymmetryApplied,
        gates: gated.gates,
      };
    } else {
      faceMeshes = rawFace;
      viiReport = { ok: true, skipped: true };
    }
  }

  const characterScale =
    (viiReport && viiReport.uniformScale) || 0.38;

  const room = [
    Object.assign(
      buildBoxMesh("floor", [4.2, 0.08, 3.2], [0.35, 0.32, 0.28], [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.04, 0, 1,
      ]),
      { material: wood },
    ),
    Object.assign(
      buildBoxMesh("back-wall", [4.2, 2.4, 0.08], [0.5, 0.48, 0.45], [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.2, -1.5, 1,
      ]),
      { material: plaster },
    ),
    Object.assign(
      buildBoxMesh("side-wall", [0.08, 2.4, 3.2], [0.48, 0.46, 0.44], [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2.05, 1.2, 0, 1,
      ]),
      { material: plaster },
    ),
    Object.assign(
      buildBoxMesh("table", [1.4, 0.08, 0.7], [0.4, 0.26, 0.14], [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.55, 0.2, 1,
      ]),
      { material: wood },
    ),
    Object.assign(
      buildBoxMesh("torso", [0.55, 0.7, 0.28], [0.1, 0.12, 0.18], [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.55, 0.35, 0.55, 1,
      ]),
      { material: cloth },
    ),
  ];

  const s = characterScale;
  const faces = faceMeshes.map((m) => ({
    ...m,
    id: `face:${m.id}`,
    modelMatrix: [
      s, 0, 0, 0,
      0, s, 0, 0,
      0, 0, s, 0,
      -0.55, 0.35 + 0.55 * s, 0.55, 1,
    ],
    material: m.material,
    baseColor: m.baseColor ?? [0.9, 0.74, 0.62],
  }));

  const camera = {
    id: "governed-render-cam",
    eye: hints.eye,
    lookAt: hints.lookAt,
    up: [0, 1, 0],
    fovY: 0.78,
    near: 0.1,
    far: 40,
    width: opts.width,
    height: opts.height,
  };

  const lights = createDramaticCinematicLightRig
    ? createDramaticCinematicLightRig(hints.lookAt)
    : undefined;

  const renderer = new HeadlessGLStillRenderer({
    camera,
    meshes: [...room, ...faces],
    lights,
    cinematicLighting: !lights,
    gatherEmissiveLights: true,
    supersample: 2,
    aov: { depth: true, normal: true },
    clearColor: hints.clearColor,
  });

  const buf = renderer.renderBuffers();
  let rgba = buf.beautyRgba;
  if (applyScreenSpaceAo && buf.depthRgba) {
    rgba = applyScreenSpaceAo(rgba, buf.depthRgba, camera.width, camera.height, {
      strength: 0.42,
      radius: 3,
    });
  }
  if (applyDepthOfFieldProxy && buf.depthRgba) {
    rgba = applyDepthOfFieldProxy(
      rgba,
      buf.depthRgba,
      camera.width,
      camera.height,
      { focusDepth: hints.focusDepth, blurScale: 1.15 },
    );
  }
  if (applyCinematicColorGrade) {
    rgba = applyCinematicColorGrade(rgba, camera.width, camera.height, {
      vignette: hints.vignette,
    });
  }

  const png = encodePngRgba(camera.width, camera.height, rgba);
  return { png, camera, viiReport, meshCount: room.length + faces.length };
}

async function tryOpenClGenAssist(outDir, opts) {
  const providerPath = join(
    REPO,
    "sovereign-x/router/modules/gpu/amd/openclGenProvider.js",
  );
  if (!existsSync(providerPath)) {
    return { attempted: false, reason: "openclGenProvider missing" };
  }
  const { generateClGenStill, detectOpenClGenAvailable } = await import(
    pathToFileURL(providerPath).href
  );
  if (!detectOpenClGenAvailable(process.env)) {
    return { attempted: false, reason: "opencl.gen unavailable" };
  }
  const outPath = join(outDir, "opencl-gen-assist.png");
  const reportPath = join(outDir, "opencl-gen-assist.json");
  const still = await generateClGenStill({
    outPath,
    reportPath,
    width: Math.min(512, opts.width),
    height: Math.min(512, opts.height),
    intentId: opts.intentId,
    worldId: "interior.dim-room",
    seed: opts.seed,
  });
  return {
    attempted: true,
    ok: !!still.ok,
    pixelsProduced: !!still.pixelsProduced,
    outPath: still.outPath || null,
    message: still.message,
    status: still.status,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.prompt) {
    console.log(`Usage: npm run mrs:governed-render -- --prompt "dim room soft light"
  --seed N         default 1 (deterministic soft-raster)
  --width N        default 512
  --height N       default 400
  --provider MODE  auto|engine3d.soft|opencl.gen  (default auto → engine3d.soft)
  --beauty MODE    none|remote|external-pbr  (default none)
                   remote → photoreal.remote.diffusion (URL stub)
                   external-pbr → photoreal.external.pbr (GLB export Held; Cycles if Blender on PATH)
  --out-root PATH  default tmp/governed-render
  --skip-vii       skip Amendment VII mesh soft-apply (not recommended)

STATUS: partial — Engine3D soft-raster governed still; not photoreal; Lemonade held.
--beauty external-pbr exports GLB under the run folder; Cycles beauty PNG only when Blender is available (else deferred — no fake beauty PNG).
Strategy: docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md`);
    process.exit(args.help ? 0 : 2);
  }

  const providerPref =
    args.provider === "auto" ? "engine3d.soft" : args.provider;
  const beautyMode = String(args.beauty || "none").trim().toLowerCase() || "none";
  const runId = runIdFrom(
    args.prompt,
    args.seed,
    args.width,
    args.height,
    providerPref,
    beautyMode,
  );
  const intentId = `intent-governed-${runId}`;
  const outDir = join(args.outRoot, runId);
  mkdirSync(outDir, { recursive: true });

  const hints = promptToSceneHints(args.prompt, args.seed);
  const policyOrder = [
    "intent.declared",
    "amendment.VII.soft",
    "amendment.VIII.world-profile.soft",
    "ccc.image.gen.select(honesty)",
    "provider.engine3d.soft",
    "beauty.photoreal.select(optional)",
    "artifact.write",
  ];

  const wrap = await applyConstitutionalWrap({
    intentId,
    runId,
    skipVii: args.skipVii,
  });
  if (wrap.halted) {
    const trail = {
      ok: false,
      status: "halted",
      runId,
      prompt: args.prompt,
      haltCode: wrap.haltCode,
      reason: wrap.reason,
      policyOrder,
      constitutionalWrap: wrap,
    };
    writeFileSync(
      join(outDir, "verification-trail.json"),
      JSON.stringify(trail, null, 2),
    );
    console.log(JSON.stringify({ ok: false, runId, outDir, haltCode: wrap.haltCode }, null, 2));
    process.exit(1);
  }

  const ccc = await selectCccHonesty(process.env);
  // Beauty attempt after layout dir exists so external-pbr can write GLB beside still.png
  // (selection runs first for trail; attempt after layout for shared outDir).
  let beauty = await resolveBeautyProvider(beautyMode, process.env, {
    outDir: join(outDir, "external-pbr"),
    width: args.width,
    height: args.height,
    seed: args.seed,
  });

  /** @type {object} */
  let pixelResult = {
    provider: null,
    pixelsProduced: false,
    beautyPath: null,
  };
  let openclAssist = null;

  if (providerPref === "opencl.gen") {
    openclAssist = await tryOpenClGenAssist(outDir, {
      ...args,
      intentId,
    });
    if (openclAssist.ok && openclAssist.outPath) {
      const dest = join(outDir, "still.png");
      copyFileSync(openclAssist.outPath, dest);
      pixelResult = {
        provider: "opencl.gen",
        pixelsProduced: true,
        beautyPath: dest,
        status: "partial",
        note: "opencl.gen assist still — not Engine3D soft-raster parity; not SDXL",
      };
    }
  }

  if (!pixelResult.pixelsProduced) {
    const dist = ensureEngine3dDist();
    const api = await import(pathToFileURL(dist).href);
    const rendered = await renderEngine3dSoft(api, args, hints, null);
    const beautyPath = join(outDir, "still.png");
    writeFileSync(beautyPath, rendered.png);
    pixelResult = {
      provider: "engine3d.soft",
      pixelsProduced: true,
      beautyPath,
      status: "partial",
      meshCount: rendered.meshCount,
      viiMesh: rendered.viiReport,
      note:
        "Engine3D HeadlessGL soft-raster + SSAO/DOF/grade — structure film, not photoreal",
    };

    // Optional opencl.gen side-assist on auto (does not replace engine3d.soft claim)
    if (args.provider === "auto" || args.provider === "engine3d.soft") {
      try {
        openclAssist = await tryOpenClGenAssist(outDir, { ...args, intentId });
      } catch {
        openclAssist = { attempted: false, reason: "opencl assist error" };
      }
    }
  }

  const layoutHash = sha256File(pixelResult.beautyPath);
  const capturedAt = new Date().toISOString();
  const beautySel = beauty?.selection || null;
  const beautyAttempt = beauty?.attempt || null;
  const photorealPixels =
    !!(beautyAttempt && beautyAttempt.pixelsProduced === true);
  const photorealClaim = !!(photorealPixels && beautyAttempt?.photorealClaim === true);

  /** @type {string|null} */
  let photorealBeautyPath = null;
  /** @type {string|null} */
  let photorealBeautySha = null;
  if (photorealPixels && beautyAttempt?.outPath && existsSync(beautyAttempt.outPath)) {
    photorealBeautyPath = beautyAttempt.outPath;
    photorealBeautySha =
      beautyAttempt.beautySha256 || sha256File(photorealBeautyPath);
    // Copy beside layout still for one-folder operator UX
    const dest = join(outDir, "beauty-cycles.png");
    if (resolve(beautyAttempt.outPath) !== resolve(dest)) {
      copyFileSync(beautyAttempt.outPath, dest);
      photorealBeautyPath = dest;
      photorealBeautySha = sha256File(dest);
    }
  }

  const trail = {
    schema: "mrs.governed-render.verification-trail.v1",
    status: "partial",
    ok: !!pixelResult.pixelsProduced,
    runId,
    capturedAt,
    reproducibility: {
      canonicalInputs: {
        prompt: String(args.prompt).trim(),
        seed: args.seed,
        width: args.width,
        height: args.height,
        provider: providerPref,
        beauty: beautyMode,
        pipeline: "governed-render.v1.engine3d-soft",
      },
      runIdAlgorithm: "sha256(canonicalInputs).slice(0,16)",
      deterministicPixels: pixelResult.provider === "engine3d.soft",
      nonDeterminismNotes: [
        "capturedAt timestamp is wall-clock only",
        "opencl.gen host timing may vary; Engine3D CPU soft-raster is seed-stable for same inputs",
        "photoreal beauty stubs do not alter layout still bytes",
        "GLB export is seed/spec deterministic; Cycles samples may vary by Blender/GPU when present",
      ],
    },
    prompt: args.prompt,
    intentId,
    worldContext: hints.worldContext,
    worldProfileId: hints.worldProfileId,
    policyOrder,
    constitutionalWrap: {
      ok: wrap.ok,
      halted: !!wrap.halted,
      skipped: !!wrap.skipped,
      gates: wrap.gates || [],
      reason: wrap.reason,
    },
    cccImageGen: ccc,
    lemonade: {
      status: "held",
      pixelsProduced: false,
      note: "Lemonade held until pixelsProduced:true consistently — not production claim",
    },
    provider: pixelResult.provider,
    layoutProvider: pixelResult.provider,
    fallbackUsed: providerPref !== pixelResult.provider,
    pixelsProduced: pixelResult.pixelsProduced,
    artifact: {
      beautyPath: pixelResult.beautyPath,
      beautySha256: layoutHash,
      layoutPath: pixelResult.beautyPath,
      layoutSha256: layoutHash,
      photorealBeautyPath,
      photorealBeautySha256: photorealBeautySha,
      glbPath: beautyAttempt?.glbPath || beautyAttempt?.export?.glbPath || null,
      glbSha256: beautyAttempt?.export?.sha256 || null,
      width: args.width,
      height: args.height,
      note: photorealPixels
        ? "still.png = layout (engine3d.soft). beauty-cycles.png = Cycles photoreal beauty plate."
        : "still.png is layout (engine3d.soft / opencl.gen). Photoreal beauty plate omitted unless Cycles produced verified pixels.",
    },
    beautyProvider: {
      mode: beautyMode,
      selected: beautySel?.selected ?? null,
      configured: !!beautySel?.configured,
      deferred: beautySel ? !!beautySel.deferred : beautyMode !== "none",
      pixelsProduced: photorealPixels,
      photorealClaim,
      code: beautySel?.code || beautyAttempt?.code || null,
      reason: beautySel?.reason || beauty?.note || null,
      exportStatus: beautyAttempt?.export?.status || null,
      cyclesStatus:
        beautyAttempt?.cycles?.status ||
        beautyAttempt?.assessment?.cyclesStatus ||
        null,
      attempt: beautyAttempt
        ? {
            code: beautyAttempt.code,
            deferred: !!beautyAttempt.deferred,
            pixelsProduced: !!beautyAttempt.pixelsProduced,
            message: beautyAttempt.message,
            endpoint: beautyAttempt.endpoint || null,
            glbPath: beautyAttempt.glbPath || beautyAttempt.export?.glbPath || null,
            outPath: beautyAttempt.outPath || null,
          }
        : null,
      strategyRef: "docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md",
    },
    openclGenAssist: openclAssist,
    honesty: {
      photoreal: photorealClaim,
      sdxl: false,
      softRaster: true,
      engine3d: pixelResult.provider === "engine3d.soft",
      r9_380_localPhotoreal: false,
      esfrFraming: photorealClaim ? "PASS_WITH_GAPS" : "PASS_WITH_GAPS",
    },
    qualityLogRef: "docs/4d-engine/QUALITY_PROGRESS_LOG.md",
    strategyRef: "docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md",
    cecpTrailRef: "docs/governance/cecp/trails/photoreal-provider-strategy-2026-07/",
  };

  writeFileSync(
    join(outDir, "verification-trail.json"),
    JSON.stringify(trail, null, 2),
  );

  /** Phase 2 CIEMS: emit SPR/PEP/CEC after external-pbr (Partial; never auto Full Photoreal). */
  let photorealEvidence = null;
  if (beautyMode === "external-pbr") {
    try {
      const evidenceMod = await import(
        pathToFileURL(
          join(
            REPO,
            "mrs",
            "packages",
            "renderer-core",
            "src",
            "evidence",
            "photoreal",
            "index.js",
          ),
        ).href
      );
      photorealEvidence = evidenceMod.emitPhotorealEvidenceFromRun({
        outDir,
        governanceTrail: join(outDir, "verification-trail.json"),
        write: true,
      });
      trail.photorealEvidence = {
        status: "partial",
        sprPath: photorealEvidence.paths?.spr || null,
        pepPath: photorealEvidence.paths?.pep || null,
        cecPath: photorealEvidence.paths?.cec || null,
        pepCompleteness: photorealEvidence.completeness?.pep ?? null,
        sprCompleteness: photorealEvidence.completeness?.spr ?? null,
        photorealClaimLevel:
          photorealEvidence.completeness?.photorealClaimLevel || "partial",
        fullPhotorealEligible: false,
        promotionEligibility:
          photorealEvidence.completeness?.promotionEligibility || null,
        schemaRefs: [
          "schemas/ciems/pep-v1.json",
          "schemas/ciems/spr-v1.json",
          "schemas/ciems/cec-v1.json",
        ],
        docsRef: "docs/4d-engine/evidence/",
        note: "CIEMS Phase 2 emitters — Partial completeness; do not auto-promote Full Photoreal",
      };
      writeFileSync(
        join(outDir, "verification-trail.json"),
        JSON.stringify(trail, null, 2),
      );
    } catch (err) {
      photorealEvidence = {
        ok: false,
        error: String(err?.message || err).slice(0, 400),
      };
      trail.photorealEvidence = {
        status: "partial",
        ok: false,
        error: photorealEvidence.error,
        note: "SPR/PEP/CEC emit failed — layout/beauty artifacts unchanged",
      };
      writeFileSync(
        join(outDir, "verification-trail.json"),
        JSON.stringify(trail, null, 2),
      );
    }
  }

  const beautyLine = beautySel?.selected
    ? beautySel.deferred
      ? `${beautySel.selected} (export Held / Cycles deferred — no photoreal PNG)`
      : photorealPixels
        ? `${beautySel.selected} (Cycles beauty PNG)`
        : `${beautySel.selected}`
    : "none";
  const evidenceLine =
    beautyMode === "external-pbr" && photorealEvidence?.paths
      ? `\n- Photoreal evidence (Phase 2 **partial**): \`spr.json\` / \`pep.json\` / \`cec.json\` (completeness pep=${photorealEvidence.completeness?.pep ?? "?"} spr=${photorealEvidence.completeness?.spr ?? "?"}; not Full Photoreal)`
      : "";
  writeFileSync(
    join(outDir, "README.md"),
    `# Governed render \`${runId}\`

\`\`\`bash
npm run mrs:governed-render -- --prompt ${JSON.stringify(args.prompt)} --seed ${args.seed} --width ${args.width} --height ${args.height} --provider ${providerPref} --beauty ${beautyMode}
\`\`\`

- Still (layout): \`still.png\`
- Trail: \`verification-trail.json\`
- Layout provider: **${pixelResult.provider}** (Lemonade held)
- Beauty: **${beautyLine}**${evidenceLine}
- Status: **partial** — soft-raster layout${photorealClaim ? "; Cycles beauty pixels present (not production-certified)" : "; not photoreal"}
- Strategy: \`docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md\`
`,
  );

  const summary = {
    ok: trail.ok,
    runId,
    outDir,
    beautyPath: pixelResult.beautyPath,
    beautySha256: layoutHash,
    provider: pixelResult.provider,
    layoutProvider: pixelResult.provider,
    beautyProvider: beautySel?.selected || null,
    beautyDeferred: !!beautySel?.deferred,
    beautyConfigured: !!beautySel?.configured,
    photorealBeautyPath,
    photorealBeautySha256: photorealBeautySha,
    glbPath: trail.artifact.glbPath,
    exportStatus: trail.beautyProvider.exportStatus,
    cyclesStatus: trail.beautyProvider.cyclesStatus,
    fallbackUsed: trail.fallbackUsed,
    lemonadeHeld: true,
    photorealClaim,
    photorealEvidence: photorealEvidence
      ? {
          ok: !!photorealEvidence.ok,
          pepCompleteness: photorealEvidence.completeness?.pep ?? null,
          sprCompleteness: photorealEvidence.completeness?.spr ?? null,
          fullPhotorealEligible: false,
          paths: photorealEvidence.paths || null,
        }
      : null,
    trailPath: join(outDir, "verification-trail.json"),
    status: "partial",
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(trail.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
