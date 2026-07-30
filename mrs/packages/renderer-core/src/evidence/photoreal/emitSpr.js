/**
 * SPR v1.0 emitter — Scene Provenance Record from GLB + glb-provenance.
 * STATUS: **partial**
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { scoreSprCompleteness } from "./completeness.js";

function sha256File(path) {
  if (!path || !existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @returns {{ spr: object, completeness: object }}
 */
export function emitSpr(opts = {}) {
  const glbPath = opts.glbPath || null;
  const provenancePath = opts.provenancePath || null;
  const provenance = opts.provenance || readJson(provenancePath) || {};
  const exportMeta = opts.exportMeta || null;
  const sceneSpec = opts.sceneSpec || null;
  const trailPath = opts.governanceTrail || null;
  const esfrHook =
    opts.esfrHook ||
    "docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/06-engineer-standards.md";
  const inspectorHook =
    opts.inspectorHook ||
    "docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/05-inspector-acceptance.md";

  const glbHash =
    opts.glbHash ||
    exportMeta?.sha256 ||
    sha256File(glbPath) ||
    "";

  const sceneUUID =
    opts.sceneUUID ||
    provenance?.worldDocument?.id ||
    sceneSpec?.id ||
    (glbHash ? `scene-${glbHash.slice(0, 16)}` : `scene-${randomUUID()}`);

  const creationTimestamp =
    provenance?.timestamp || opts.timestamp || new Date().toISOString();

  const materialCount = Number(provenance?.materialCount ?? 0) || 0;
  const lightCount = Number(provenance?.lightCount ?? 0) || 0;
  const primitiveCount = Number(provenance?.primitiveCount ?? 0) || 0;

  const materialsFromSpec = Array.isArray(sceneSpec?.materials)
    ? sceneSpec.materials
    : [];
  const lightsFromSpec = Array.isArray(sceneSpec?.lights) ? sceneSpec.lights : [];

  const materialProvenance =
    materialsFromSpec.length > 0
      ? materialsFromSpec.map((m) => ({
          materialId: String(m.id || "material"),
          shaderGraphSource: "scene-spec.materials",
          textureSources: [],
          materialLineage: "SceneSpecification material (partial — no texture hashes)",
        }))
      : materialCount > 0
        ? Array.from({ length: materialCount }, (_, i) => ({
            materialId: `material-${i}`,
            shaderGraphSource: null,
            textureSources: [],
            materialLineage:
              "Count from glb-provenance only — shader/texture lineage undeclared",
          }))
        : [];

  const lightingProvenance =
    lightsFromSpec.length > 0
      ? lightsFromSpec.map((l) => ({
          lightId: String(l.id || "light"),
          source: "manual",
          hdrSource: null,
          intensityLineage: Array.isArray(l.emission)
            ? `emission=${JSON.stringify(l.emission)}`
            : "undeclared",
          colorLineage: "undeclared",
        }))
      : lightCount > 0
        ? Array.from({ length: lightCount }, (_, i) => ({
            lightId: `light-${i}`,
            source: "manual",
            hdrSource: null,
            intensityLineage: "Count from glb-provenance — intensity lineage undeclared",
            colorLineage: "undeclared",
          }))
        : [];

  const geometryProvenance =
    primitiveCount > 0
      ? [
          {
            meshId: "glb-primitives",
            vertexCount: null,
            faceCount: null,
            normalIntegrity: null,
            uvIntegrity: null,
            meshLineage: `primitiveCount=${primitiveCount} from glb-provenance (partial)`,
          },
        ]
      : [];

  const assetProvenanceLedger = [];
  if (glbPath) {
    assetProvenanceLedger.push({
      assetId: basename(glbPath),
      source: "procedural",
      importPath: glbPath,
      hash: glbHash,
      license: "MIT (repo)",
      modificationHistory: [
        {
          action: "export",
          timestamp: creationTimestamp,
          hash: provenance?.specHash || null,
        },
      ],
      integrityScore: glbHash ? 0.7 : 0,
    });
  }
  if (provenance?.specHash) {
    assetProvenanceLedger.push({
      assetId: "scene-specification",
      source: "local",
      importPath: exportMeta?.assessment?.specPath || opts.specPath || null,
      hash: provenance.specHash,
      license: null,
      modificationHistory: [],
      integrityScore: 0.6,
    });
  }

  const spr = {
    "@context": "https://sovereign-x.org/ciems/spr-v1",
    artifact: "SceneProvenanceRecord",
    version: "1.0",
    id: opts.id || `spr-${(glbHash || randomUUID()).slice(0, 16)}`,
    timestamp: opts.timestamp || new Date().toISOString(),
    status: "partial",
    sceneIdentityBlock: {
      sceneUUID,
      glbHash,
      glbProvenanceChain: glbPath
        ? [
            {
              source: glbPath,
              hash: glbHash,
              timestamp: creationTimestamp,
            },
          ]
        : [],
      creationTimestamp,
      modificationLedger: provenance?.specHash
        ? [
            {
              action: "export",
              target: "glb",
              timestamp: creationTimestamp,
              hash: provenance.specHash,
            },
          ]
        : [],
    },
    assetProvenanceLedger,
    geometryProvenance,
    materialProvenance,
    lightingProvenance,
    cameraProvenance: {
      cameraId: sceneSpec?.camera ? "scene-spec-camera" : "cycles-active-camera",
      origin: sceneSpec?.camera
        ? "SceneSpecification.camera"
        : "Cycles script active camera (partial lineage)",
      fovLineage: sceneSpec?.camera?.fovY != null
        ? `fovY=${sceneSpec.camera.fovY}`
        : "undeclared",
      exposureLineage: "undeclared",
      sensorModelLineage: "undeclared",
    },
    environmentProvenance: {
      worldShaderSource: null,
      hdrSource: null,
      hash: provenance?.specHash || null,
      modificationLedger: [],
    },
    constitutionalHooks: {
      esfrHook,
      inspectorHook,
      governanceTrail: trailPath,
      evidenceCompletenessScore: 0,
    },
    sourceRefs: {
      provenancePath: provenancePath || null,
      glbPath: glbPath || null,
      provenanceSeed: provenance?.seed ?? null,
    },
  };

  const completeness = scoreSprCompleteness(spr);
  spr.constitutionalHooks.evidenceCompletenessScore = completeness.score;
  spr.completeness = {
    score: completeness.score,
    level: completeness.level,
    gaps: completeness.gaps,
    note: "Partial until texture/topology/HDRI lineage filled — not Full Photoreal",
  };

  return { spr, completeness };
}
