/**
 * Offline playground — emits LIVE SceneSpecification JSON only.
 *
 * Status: prototype (not a second SoT). Paste output into Genblaze
 * POST /api/render-scene. Does NOT use EmbeddedSurface4D / Material4DDesc.
 *
 * Run: node generate.mjs
 * Docs: docs/4d-engine/v2/scene-spec/SCENE_SPEC_IMPROVEMENT_RFC.md
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashSceneSpecification,
  validateSceneCapabilities,
} from "../renderer-core/src/scene-spec/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tablesPath = join(
  __dirname,
  "../renderer-core/src/scene-spec/mapping-tables.json"
);

const tables = JSON.parse(readFileSync(tablesPath, "utf8"));

function resolveSurfaceId({ paletteTag = "", framing = "", objectClass } = {}) {
  const allowed = new Set(tables.rt4dSurfaceIds || []);
  const def = tables.defaultSurfaceId || "tesseract";
  if (objectClass && tables.objectClassToSurfaceId?.[objectClass]) {
    const sid = tables.objectClassToSurfaceId[objectClass];
    if (allowed.has(sid)) return sid;
  }
  for (const [tag, sid] of Object.entries(tables.paletteTagToSurfaceId || {})) {
    if (tag && paletteTag.includes(tag) && allowed.has(sid)) return sid;
  }
  const fromFrame = tables.framingToSurfaceId?.[framing];
  if (fromFrame && allowed.has(fromFrame)) return fromFrame;
  return allowed.has(def) ? def : "tesseract";
}

/**
 * @param {{
 *   imageId?: string,
 *   dominantColor?: string,
 *   paletteTag?: string,
 *   framing?: string,
 *   objectClass?: string,
 *   seed?: number,
 *   width?: number,
 *   height?: number,
 *   samples?: number,
 *   maxDepth?: number,
 * }} features
 */
export function generateLiveSceneSpec(features = {}) {
  const {
    imageId = "playground-demo",
    dominantColor = "#4a90c8",
    paletteTag = "cool-blue bias",
    framing = "square-ish / centered lattice",
    objectClass,
    seed = 42,
    width = 256,
    height = 256,
    samples = 4,
    maxDepth = 3,
  } = features;

  const surfaceId = resolveSurfaceId({ paletteTag, framing, objectClass });
  const camPol = tables.cameraPolicies?.Perspective4D || {};
  const lights =
    tables.sceneContextToLighting?.studio?.lights ||
    [
      {
        id: "key",
        center: [2.4, 3.3, -1.6, 0.7],
        radius: 0.95,
        emission: [17, 16, 14.5],
      },
    ];

  return {
    schemaVersion: "1.0",
    kind: "SceneSpecification",
    id: `playground-${imageId}`,
    name: "Playground live SceneSpecification",
    description:
      "Prototype generator — live SceneSpecification only; not EmbeddedSurface4D; not reconstruction.",
    materials: [
      {
        id: "mat0",
        color: /^#[0-9a-fA-F]{6}$/.test(dominantColor)
          ? dominantColor.toLowerCase()
          : "#808080",
        opacity: 1,
        wireframe: false,
      },
    ],
    entities: [
      {
        id: "primary",
        materialId: "mat0",
        transform4d: {
          translate: [0, 0, 0, 0],
          rotate: { xw: 0.15, zw: 0.08 },
        },
        geometry: { kind: "surface", surfaceId },
      },
    ],
    defaultObservation: {
      modeId: camPol.modeId || "perspective_w",
      params: camPol.params || { d4: 4 },
    },
    camera: camPol.defaultCamera || {
      position4d: [4.3, 1.4, 0.2, 0.1],
      target4d: [0, 0.1, 0, 0],
      fovX: 52,
      fovY: 52,
      fovZ: 45,
      fovW: 28,
    },
    lights,
    output: { width, height, samples, maxDepth, seed },
    metadata: {
      source: "scene-spec-playground",
      analysis_mode: "scene-interpretation",
      prototype: true,
      mappingTables: "scene-spec/mapping-tables.json",
    },
  };
}

function receiptFor(spec, imageSha256 = null) {
  const hex = hashSceneSpecification(spec);
  return {
    sceneSpecHash: `sha256:${hex}`,
    imageSha256,
    seed: spec.output?.seed ?? null,
    quality: "draft",
    rendererVersion: "mrs-renderer-core/scene-spec",
    observationModeId: spec.defaultObservation?.modeId ?? null,
    surfaceIds: (spec.entities || [])
      .map((e) => e?.geometry?.surfaceId)
      .filter(Boolean),
    source: "scene-spec-playground",
    analysisMode: "scene-interpretation",
    note: "Prototype receipt — live SceneSpecification hash only.",
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const spec = generateLiveSceneSpec({
    imageId: "demo",
    paletteTag: "cool-blue bias",
    framing: "wide / landscape-friendly lattice",
    dominantColor: "#2a6f9e",
  });
  const cap = validateSceneCapabilities(spec, { target: "rt4d" });
  if (!cap.ok) {
    console.error("Capability errors:", cap.errors);
    process.exit(1);
  }
  const receipt = receiptFor(spec);
  console.log(JSON.stringify({ spec, receipt, capability: cap }, null, 2));
  // Touch createHash so unused-import linters stay quiet if tree-shaken oddly
  void createHash;
}
