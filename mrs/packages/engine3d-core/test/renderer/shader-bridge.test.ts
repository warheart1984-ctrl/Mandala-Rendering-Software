/**
 * ShaderBridge + ACES-approx tone-map tests.
 * Status: bridge **partial**; tone-map **partial**; not photoreal.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bridgeConstitutionalMaterial,
  constitutionalToPbr,
  resolveMaterialType,
} from "../../src/renderer/raster/ShaderBridge.js";
import { applyAcesApproxToneMap } from "../../src/renderer/raster/RasterPostProcess.js";
import { shadeRasterFragment } from "../../src/renderer/raster/RasterMaterial.js";
import { renderStillBuffers, encodePngRgba } from "../../src/renderer/raster/HeadlessStillRenderer.js";
import { buildBoxMesh } from "../../src/renderer/raster/portraitMeshes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up to repo root (constitution/CHARTER.md or mrs/assets/human). */
function resolveRepoRoot(): string {
  let dir = resolve(here);
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "constitution", "CHARTER.md")) ||
      existsSync(join(dir, "mrs", "assets", "human"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(here, "..", "..", "..", "..", "..");
}

function proofsDir(): string {
  return join(resolveRepoRoot(), "docs", "4d-engine", "proofs", "sx-arch-gaps-2026-07");
}

describe("ShaderBridge — constitutional → PBR", () => {
  it("maps semantics to MaterialType", () => {
    assert.equal(resolveMaterialType("chrome"), "metal");
    assert.equal(resolveMaterialType("flesh"), "skin");
    assert.equal(resolveMaterialType("metal"), "metal");
    assert.equal(resolveMaterialType("unknown-xyz"), "basic");
  });

  it("produces finite albedo/roughness/metallic in [0,1]", () => {
    const pbr = constitutionalToPbr({
      id: "skin-a",
      semantic: "human",
      baseColor: [0.8, 0.5, 0.4],
      roughness: 0.6,
      metallic: 0,
    });
    assert.equal(pbr.materialType, "skin");
    assert.ok(pbr.roughness >= 0 && pbr.roughness <= 1);
    assert.ok(pbr.metallic >= 0 && pbr.metallic <= 1);
    assert.ok(pbr.albedo.every((c) => Number.isFinite(c)));
    assert.ok(pbr.subsurface > 0);
  });

  it("bridges to RasterMaterial that shades", () => {
    const result = bridgeConstitutionalMaterial({
      id: "metal-bridge",
      type: "metal",
      intentId: "intent-sx-arch-gaps",
      worldId: "world-proof",
    });
    assert.equal(result.status, "partial");
    assert.equal(result.pbr.metallic, 1);
    assert.equal(result.raster.type, "metal");
    const rgb = shadeRasterFragment(
      result.raster,
      [0, 1, 0],
      [-0.3, -1, -0.2],
      [0, 0, 1],
    );
    assert.ok(rgb.every((c) => Number.isFinite(c) && c >= 0 && c <= 1));
  });
});

describe("ACES-approx tone-map", () => {
  it("changes bright linear pixels measurably", () => {
    const w = 4;
    const h = 4;
    const beauty = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      beauty[o] = 250;
      beauty[o + 1] = 250;
      beauty[o + 2] = 250;
      beauty[o + 3] = 255;
    }
    const out = applyAcesApproxToneMap(beauty, w, h, { exposure: 1.5 });
    let changed = 0;
    for (let i = 0; i < beauty.length; i += 4) {
      if (out[i] !== beauty[i] || out[i + 1] !== beauty[i + 1] || out[i + 2] !== beauty[i + 2]) {
        changed += 1;
      }
    }
    assert.ok(changed > 0, "tone-map should alter bright pixels");
  });

  it("is deterministic", () => {
    const w = 2;
    const h = 2;
    const beauty = Uint8Array.from([180, 90, 40, 255, 10, 20, 30, 255, 200, 200, 50, 255, 0, 0, 0, 255]);
    const a = applyAcesApproxToneMap(beauty, w, h, { exposure: 1.1 });
    const b = applyAcesApproxToneMap(beauty, w, h, { exposure: 1.1 });
    assert.deepEqual([...a], [...b]);
  });
});

describe("shader-bridge proof still", () => {
  it("renders a soft-raster still with bridged metal + tone-map", () => {
    const bridged = bridgeConstitutionalMaterial({
      id: "proof-metal",
      type: "metal",
      baseColor: [0.85, 0.82, 0.78],
    });
    const mesh = {
      ...buildBoxMesh("box", [1.2, 1.2, 1.2], bridged.pbr.albedo, IDENTITY_MAT4),
      material: bridged.raster,
    };
    const buffers = renderStillBuffers({
      camera: {
        id: "c",
        eye: [2.2, 1.8, 2.8],
        lookAt: [0, 0, 0],
        up: [0, 1, 0],
        fovY: Math.PI / 4,
        near: 0.1,
        far: 40,
        width: 96,
        height: 96,
      },
      meshes: [mesh],
      cinematicLighting: true,
      clearColor: [0.08, 0.09, 0.12],
    });
    const toned = applyAcesApproxToneMap(buffers.beautyRgba, 96, 96, { exposure: 1.05 });
    const png = encodePngRgba(96, 96, toned);
    const outDir = proofsDir();
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "shader-bridge-tonemap-proof.png");
    writeFileSync(outPath, png);
    assert.ok(png.length > 100);
    writeFileSync(
      join(outDir, "shader-bridge-proof-manifest.json"),
      JSON.stringify(
        {
          status: "partial",
          bridge: bridged.notes,
          pbr: bridged.pbr,
          proofPng: "shader-bridge-tonemap-proof.png",
          note: "Soft-raster + ACES-approx — not photoreal",
        },
        null,
        2,
      ),
    );
  });
});
