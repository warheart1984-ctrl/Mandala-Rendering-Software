#!/usr/bin/env node
/**
 * Before/after still: same Engine3D scene with Amendment VII gates off vs on.
 *
 * Intent: prove biometric scale + organic asymmetry improve the same fixture
 * assets (rendering problem) — not a world-profile expansion.
 *
 * Usage:
 *   npm run build --prefix mrs/packages/engine3d-core
 *   node mrs/packages/engine3d-core/scripts/render-amendment-vii-before-after.mjs
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, "..");
const REPO = join(PKG, "..", "..", "..");

function resolveOut() {
  const proofs = join(REPO, "docs", "4d-engine", "proofs", "world-engine");
  mkdirSync(proofs, { recursive: true });
  return proofs;
}

async function loadApi() {
  const dist = join(PKG, "dist", "src", "index.js");
  if (!existsSync(dist)) {
    throw new Error(`Missing ${dist} — run npm run build in engine3d-core`);
  }
  return import(pathToFileURL(dist).href);
}

async function main() {
  const api = await loadApi();
  const outRoot = resolveOut();
  const tmpBook = join(REPO, "tmp", "book-movie-ch1", "amendment-vii-before-after");
  mkdirSync(tmpBook, { recursive: true });

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

  const face = resolveHumanFacePath("HumanFaceRigged");
  if (!existsSync(face.path)) {
    throw new Error(`Face fixture missing: ${face.path}`);
  }
  const rawFace = buildPortraitRasterMeshesFromHumanRig(face.path);
  if (!rawFace?.length) {
    throw new Error("Failed to load face meshes from HumanFaceRigged.glb");
  }

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

  function placeFace(meshes, scale, x, y, z) {
    const s = scale;
    const modelMatrix = [
      s, 0, 0, 0,
      0, s, 0, 0,
      0, 0, s, 0,
      x, y, z, 1,
    ];
    return meshes.map((m, i) => ({
      ...m,
      id: `face:${m.id}`,
      modelMatrix,
      material: m.material,
      baseColor: m.baseColor ?? [0.9, 0.74, 0.62],
    }));
  }

  function buildScene(faceMeshes, characterScale) {
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
    const faces = placeFace(
      faceMeshes,
      characterScale,
      -0.55,
      0.35 + 0.55 * characterScale,
      0.55,
    );
    return [...room, ...faces];
  }

  const camera = {
    id: "vii-proof-cam",
    eye: [0.15, 1.05, 2.6],
    lookAt: [-0.35, 0.85, 0.4],
    up: [0, 1, 0],
    fovY: 0.78,
    near: 0.1,
    far: 40,
    width: 640,
    height: 400,
  };

  function renderVariant(tag, faceSource, characterScale, gateReport) {
    const meshes = buildScene(faceSource, characterScale);
    const lights = createDramaticCinematicLightRig
      ? createDramaticCinematicLightRig([0.35, 0.85, 0.4])
      : undefined;
    const renderer = new HeadlessGLStillRenderer({
      camera,
      meshes,
      lights,
      cinematicLighting: !lights,
      gatherEmissiveLights: true,
      supersample: 2,
      aov: { depth: true, normal: true },
      clearColor: [0.08, 0.07, 0.09],
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
        { focusDepth: 0.45, blurScale: 1.2 },
      );
    }
    if (applyCinematicColorGrade) {
      rgba = applyCinematicColorGrade(rgba, camera.width, camera.height, {
        vignette: 0.35,
      });
    }
    const png = encodePngRgba(camera.width, camera.height, rgba);
    const name = `amendment-vii-${tag}.png`;
    const proofsPath = join(outRoot, name);
    const bookPath = join(tmpBook, name);
    writeFileSync(proofsPath, png);
    writeFileSync(bookPath, png);
    return {
      tag,
      proofsPath,
      bookPath,
      bytes: png.length,
      characterScale,
      gateReport,
    };
  }

  // BEFORE — ad-hoc cinematic-ish scale, no organic gate
  const beforeScale = 0.4;
  const before = renderVariant("before", rawFace, beforeScale, {
    amendmentVII: false,
    note: "Ad-hoc character scale 0.4; symmetric fixture positions untouched",
  });

  // AFTER — soft Amendment VII: lawful head scale + organic asymmetry
  const gated = applyAmendmentVIIToMeshes({
    meshes: rawFace,
    scaleClassOrProfileId: "human-sized",
    mode: "soft",
    bakeScale: false,
  });
  if (!gated.ok) {
    throw new Error(`Amendment VII soft apply failed: ${gated.haltCode} ${gated.issues.join(",")}`);
  }
  const afterScale = gated.uniformScale;
  const after = renderVariant("after", gated.meshes, afterScale, {
    amendmentVII: true,
    mode: "soft",
    uniformScale: gated.uniformScale,
    targetHeadHeightMeters: gated.targetHeadHeightMeters,
    measuredAabbHeight: gated.measuredAabbHeight,
    organicVarianceBefore: gated.organicVarianceBefore,
    organicVarianceAfter: gated.organicVarianceAfter,
    asymmetryApplied: gated.asymmetryApplied,
    gates: gated.gates,
    notes: gated.notes,
    issues: gated.issues,
    ckl: gated.ckl ?? null,
  });

  const priorPath = join(outRoot, "amendment-vii-before-after.prior.json");
  let deltaVsPrior = null;
  if (existsSync(priorPath)) {
    try {
      const prior = JSON.parse(readFileSync(priorPath, "utf8"));
      deltaVsPrior = {
        uniformScaleUnchanged:
          Math.abs((prior.after?.characterScale ?? 0) - afterScale) < 1e-9,
        priorUniformScale: prior.after?.characterScale ?? null,
        newUniformScale: afterScale,
        priorOrganicAfter: prior.after?.gateReport?.organicVarianceAfter ?? null,
        newOrganicAfter: gated.organicVarianceAfter,
        priorNotesHadCklWired: Boolean(
          (prior.after?.gateReport?.notes ?? []).some((n) =>
            String(n).includes("ckl-wired"),
          ),
        ),
        newNotesHadCklWired: Boolean(
          (gated.notes ?? []).some((n) => String(n).includes("ckl-wired")),
        ),
        cklSource: gated.ckl?.source ?? null,
        note:
          "Scale/organic numeric targets held vs prior soft apply; gate authority now CKL-wired",
      };
    } catch {
      deltaVsPrior = { error: "prior-manifest-unreadable" };
    }
  }

  const manifest = {
    kind: "amendment-vii-before-after-still",
    status: "partial",
    priorityFreeze:
      "World-profile / biogeometric expansion frozen — Amendment VII three gates on render path first",
    asset: face.path,
    faceAsset: face.face_asset,
    before,
    after,
    delta: {
      characterScaleBefore: beforeScale,
      characterScaleAfter: afterScale,
      organicAsymmetryApplied: gated.asymmetryApplied,
      scaleRatio: afterScale / beforeScale,
    },
    deltaVsPrior,
    antiOverclaim:
      "Soft-raster stills only. Not photoreal. Not a constitutional world engine. World Profiles remain declared. Soft-gate deny authority is CKL Amendment VII (partial wiring).",
    worldEngineVerdict: "does_not_work_yet_as_world_engine",
    amendmentVIIRenderPath: "partial",
    cklWiring: "partial",
  };

  writeFileSync(
    join(outRoot, "amendment-vii-before-after.json"),
    JSON.stringify(manifest, null, 2),
  );
  writeFileSync(
    join(tmpBook, "amendment-vii-before-after.json"),
    JSON.stringify(manifest, null, 2),
  );

  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
