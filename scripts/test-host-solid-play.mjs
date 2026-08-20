/**
 * CI smoke: solid-face meshes + host solid APIs + one projected "play frame".
 * Stands in for Unity Play Mode / Unreal PIE when editors are not on the runner.
 * Optional: set UNITY_PATH / UE_ROOT to attempt native batch (skipped if unset).
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Prefer the optional `4d-renderer/src` symlink (created by CI's mandala-check
// job); fall back to the canonical renderer-core source so this smoke suite
// runs under `npm test` without the symlink and on platforms where committing
// a symlink is unsafe (e.g. Windows).
const rendererSrc = existsSync(path.join(root, "4d-renderer", "src", "index.js"))
  ? path.join(root, "4d-renderer", "src")
  : path.join(root, "mrs/packages/renderer-core/src");

function importFromPkg(rel) {
  const target = rel.startsWith("src/")
    ? path.join(rendererSrc, rel.slice("src/".length))
    : path.join(root, "4d-renderer", rel);
  return import(pathToFileURL(target).href);
}

const { getSurface, sampleSurface, cinematicRotation, project4Dto3D } =
  await importFromPkg("src/index.js");

// ── mesh export has faces ─────────────────────────────────────────
const meshDir = path.join(root, "engine/surfaces/meshes");
for (const id of ["tesseract", "clifford-torus", "hopf-surface"]) {
  const p = path.join(meshDir, `${id}.mesh.json`);
  assert.ok(existsSync(p), `missing ${p} — run npm run export:surfaces`);
  const mesh = JSON.parse(readFileSync(p, "utf-8"));
  assert.ok(Array.isArray(mesh.faces), `${id} faces array`);
  assert.ok(mesh.faces.length > 0, `${id} must have solid faces`);
  if (id === "tesseract") assert.equal(mesh.faces.length, 48);
}

// ── host source contracts ─────────────────────────────────────────
const unityRenderer = readFileSync(
  path.join(root, "unity/GovernedUnityProject/Assets/Engine/Rendering/FourDTesseractRenderer.cs"),
  "utf-8",
);
assert.ok(unityRenderer.includes("UpdateSolidMesh"), "Unity solid path");
assert.ok(unityRenderer.includes("SmokeSolidFrame"), "Unity PlayMode smoke API");
assert.ok(unityRenderer.includes("MeshFilter"), "Unity MeshFilter solid draw");

const unrealCpp = readFileSync(
  path.join(root, "unreal/GovernedEnginePlugin/Source/GovernedEngine/Private/FourDRendererComponent.cpp"),
  "utf-8",
);
assert.ok(unrealCpp.includes("UpdateSolidMesh"), "Unreal solid path");
assert.ok(unrealCpp.includes("SmokeSolidFrame"), "Unreal PIE smoke API");
assert.ok(unrealCpp.includes("CreateMeshSection_LinearColor"), "Unreal ProceduralMesh solid");

assert.ok(
  existsSync(path.join(root, "unity/GovernedUnityProject/Assets/Engine/Tests/FourDSolidPlayModeTests.cs")),
  "Unity PlayMode tests present",
);
assert.ok(
  existsSync(
    path.join(root, "unreal/GovernedEnginePlugin/Source/GovernedEngineEditor/Private/FourDSolidAutomationTest.cpp"),
  ),
  "Unreal automation test present",
);

// ── simulated play frame (project + count visible solid tris) ─────
const tess = sampleSurface(getSurface("tesseract"));
assert.equal(tess.faces.length, 48);
const rotate = cinematicRotation(0.5);
let visible = 0;
const projected = tess.vertices.map((v) => {
  const r = rotate(v);
  const p3 = project4Dto3D(r, 4);
  return { ...p3, w: r.w };
});
for (const [i, j, k] of tess.faces) {
  const a = projected[i];
  const b = projected[j];
  const c = projected[k];
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross <= 0) visible++; // match browser backface convention
}
assert.ok(visible > 0, "solid play frame should keep some triangles");

console.log(
  `host-solid-play ok — tesseract faces=48, visible≈${visible}, Unity/Unreal solid APIs present`,
);

// ── optional native editors ───────────────────────────────────────
if (process.env.UNITY_PATH && existsSync(process.env.UNITY_PATH)) {
  const project = path.join(root, "unity/GovernedUnityProject");
  const result = spawnSync(
    process.env.UNITY_PATH,
    [
      "-batchmode",
      "-nographics",
      "-projectPath",
      project,
      "-runTests",
      "-testPlatform",
      "EditMode",
      "-testResults",
      path.join(root, "unity-test-results.xml"),
      "-quit",
    ],
    { encoding: "utf-8", timeout: 600_000 },
  );
  console.log(`Unity batch exit=${result.status}`);
  if (result.status !== 0) {
    console.error(result.stdout?.slice(-2000));
    console.error(result.stderr?.slice(-2000));
    process.exit(1);
  }
} else {
  console.log("  (Unity batch skipped — set UNITY_PATH to enable Play/EditMode CI)");
}

if (process.env.UE_ROOT && existsSync(process.env.UE_ROOT)) {
  console.log("  (UE automation: run GovernedEngine.FourD.SolidSmoke in Editor Session Frontend)");
} else {
  console.log("  (UE PIE automation skipped — set UE_ROOT; run SolidSmoke in Session Frontend)");
}
