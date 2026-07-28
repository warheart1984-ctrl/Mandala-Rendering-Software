/**
 * Judge-wow tests — star→proton triptych + AOV encode + determinism.
 *
 * STATUS: **enforced**
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  encodeDepthPng,
  encodeNormalPng,
  writeTriptychAovs,
} from "./aovEncode.js";
import {
  protonFieldFromWorldDocumentRt4d,
  enrichJudgeWowField,
  runProtonPipelineFromField,
  demoSceneSpec,
  runProtonPipeline,
} from "./pipeline.js";
import { defaultCamera4D } from "./projectProtonField.js";
import { depthFromRaster } from "./depthField.js";
import { normalsFromRaster } from "./normalField.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE3D_ROOT = join(__dirname, "../../../../engine3d-core");
const INTENT = "intent-judge-wow-test";

async function loadStarApis() {
  const starDist = join(ENGINE3D_ROOT, "dist", "src", "world", "StarWorld.js");
  const rt4dDist = join(
    ENGINE3D_ROOT,
    "dist",
    "src",
    "scene",
    "WorldDocumentRt4d.js",
  );
  if (!existsSync(starDist) || !existsSync(rt4dDist)) {
    return null;
  }
  const starMod = await import(pathToFileURL(starDist).href);
  const rt4dMod = await import(pathToFileURL(rt4dDist).href);
  return {
    create4dStarWorld: starMod.create4dStarWorld,
    worldDocumentToRt4dPrimitives: rt4dMod.worldDocumentToRt4dPrimitives,
  };
}

describe("judgeWow aovEncode", () => {
  it("exports encodeDepthPng / encodeNormalPng / writeTriptychAovs", () => {
    assert.equal(typeof encodeDepthPng, "function");
    assert.equal(typeof encodeNormalPng, "function");
    assert.equal(typeof writeTriptychAovs, "function");
  });

  it("encodes depth Float32 → grayscale PNG bytes", () => {
    const depth = {
      width: 2,
      height: 2,
      depth: new Float32Array([0, 1, 2, 3]),
      min: 0,
      max: 3,
    };
    const png = encodeDepthPng(depth);
    assert.ok(Buffer.isBuffer(png));
    assert.ok(png.length > 40);
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
  });

  it("encodes normals → RGB PNG via (n*0.5+0.5)*255", () => {
    const normals = {
      width: 1,
      height: 1,
      normals: new Float32Array([0, 0, 1]),
    };
    const png = encodeNormalPng(normals);
    assert.ok(Buffer.isBuffer(png));
    assert.ok(png.length > 40);
  });
});

describe("judgeWow star→proton triptych", () => {
  it("star path protonCount≥30, triptych buffers, same seed → same frameSha256", async () => {
    const apis = await loadStarApis();
    if (!apis) {
      // Dist not built — still prove demo path + AOV encode without engine3d
      const a = runProtonPipeline(demoSceneSpec(), {
        intentId: INTENT,
        width: 64,
        height: 64,
      });
      const b = runProtonPipeline(demoSceneSpec(), {
        intentId: INTENT,
        width: 64,
        height: 64,
      });
      assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
      assert.ok(encodeDepthPng(a.depth).length > 40);
      assert.ok(encodeNormalPng(a.normals).length > 40);
      return;
    }

    const { create4dStarWorld, worldDocumentToRt4dPrimitives } = apis;
    const seed = 42;
    const doc = create4dStarWorld({
      seed,
      armCount: 16,
      includeHalo: true,
      armLength: 2.4,
      coreRadius: 0.45,
      armRadius: 0.14,
    });
    const prims = worldDocumentToRt4dPrimitives(doc);
    const world = { id: doc.id, primitives: prims };

    const field = enrichJudgeWowField(
      protonFieldFromWorldDocumentRt4d(world, {
        intentId: INTENT,
        worldId: world.id,
      }),
    );
    assert.ok(
      field.protons.length >= 30,
      `expected ≥30 protons, got ${field.protons.length}`,
    );
    assert.ok(
      field.protons.every((pr) => pr.radius <= 0.72 + 1e-9),
      "wow enrich must cap radius to avoid fog plate",
    );

    const camera = defaultCamera4D({
      width: 64,
      height: 64,
      origin: [0, 0, -3.2, 0.15],
      params: { d4: 4, d3: 4, scale: 95, nearW: 0.05 },
    });
    const a = runProtonPipelineFromField(field, {
      intentId: INTENT,
      worldId: world.id,
      width: 64,
      height: 64,
      camera,
      skipLighting: true,
      mod1Status: "worlddocument-rt4d",
    });
    const b = runProtonPipelineFromField(field, {
      intentId: INTENT,
      worldId: world.id,
      width: 64,
      height: 64,
      camera,
      skipLighting: true,
      mod1Status: "worlddocument-rt4d",
    });

    assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
    assert.ok(a.image.png.length > 100);
    // Non-faint plate: some pixels must be bright enough to see
    let bright = 0;
    const rgba = a.raster.rgba;
    for (let i = 0; i < rgba.length; i += 4) {
      if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 > 80) bright += 1;
    }
    assert.ok(
      bright > 20,
      `expected visible bright pixels, got ${bright}`,
    );
    assert.ok(a.depth.depth instanceof Float32Array);
    assert.ok(a.normals.normals instanceof Float32Array);
    assert.equal(a.depth.width, 64);
    assert.equal(a.normals.height, 64);

    // Same seed → same world → same fieldHash / frame
    const doc2 = create4dStarWorld({
      seed,
      armCount: 16,
      includeHalo: true,
      armLength: 2.4,
      coreRadius: 0.45,
      armRadius: 0.14,
    });
    const field2 = enrichJudgeWowField(
      protonFieldFromWorldDocumentRt4d(
        { id: doc2.id, primitives: worldDocumentToRt4dPrimitives(doc2) },
        { intentId: INTENT, worldId: doc2.id },
      ),
    );
    const c = runProtonPipelineFromField(field2, {
      intentId: INTENT,
      worldId: doc2.id,
      width: 64,
      height: 64,
      camera,
      skipLighting: true,
      mod1Status: "worlddocument-rt4d",
    });
    assert.equal(c.evidence.frameSha256, a.evidence.frameSha256);

    const depthPng = encodeDepthPng(a.depth);
    const normalPng = encodeNormalPng(a.normals);
    assert.ok(depthPng.length > 40);
    assert.ok(normalPng.length > 40);
    // depthFromRaster / normalsFromRaster already exercised via pipeline
    assert.equal(depthFromRaster(a.raster).status, "enforced");
    assert.equal(normalsFromRaster(a.raster).status, "enforced");
  });

  it("writeTriptychAovs writes beauty+depth+normal under outDir", async (t) => {
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "judge-wow-"));
    t.after(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
    const result = runProtonPipeline(demoSceneSpec(), {
      intentId: INTENT,
      width: 32,
      height: 32,
    });
    const paths = await writeTriptychAovs({
      outDir: dir,
      beautyPng: result.image.png,
      depth: result.depth,
      normals: result.normals,
    });
    assert.ok(existsSync(paths.beautyPath));
    assert.ok(existsSync(paths.depthPath));
    assert.ok(existsSync(paths.normalPath));
    assert.ok(readFileSync(paths.beautyPath).length > 40);
  });
});
