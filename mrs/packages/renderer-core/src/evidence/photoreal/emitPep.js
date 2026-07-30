/**
 * PEP v1.0 emitter — Photoreal Evidence Packet from Cycles params + beauty + hashes.
 * STATUS: **partial** — never sets photorealClaimLevel: full automatically.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  evaluateFullPhotorealEligibility,
  scorePepCompleteness,
} from "./completeness.js";

function sha256File(path) {
  if (!path || !existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonicalHash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/**
 * @param {object} opts
 * @returns {{ pep: object, completeness: object }}
 */
export function emitPep(opts = {}) {
  const sceneSpec = opts.sceneSpec || null;
  const provenance = opts.provenance || {};
  const beautyPath = opts.beautyPath || null;
  const beautySha = opts.beautySha256 || sha256File(beautyPath);
  const glbHash = opts.glbHash || "";
  const width = Number(opts.width ?? provenance?.width ?? 64) || 64;
  const height = Number(opts.height ?? provenance?.height ?? 64) || 64;
  const samples = Number(opts.samples ?? 8) || 8;
  const seed = Number(
    opts.seed ?? provenance?.seed ?? sceneSpec?.output?.seed ?? 0,
  );
  const device = opts.device || "cpu";
  const rendererName = opts.rendererName || "Cycles";
  const rendererVersion = opts.rendererVersion || null;
  const executionMode = opts.executionMode || "governed-external-pbr";
  const trailPath = opts.governanceTrail || null;
  const esfrHook =
    opts.esfrHook ||
    "docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/06-engineer-standards.md";
  const inspectorHook =
    opts.inspectorHook ||
    "docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/05-inspector-acceptance.md";

  const materials = Array.isArray(sceneSpec?.materials)
    ? sceneSpec.materials
    : [];
  const lights = Array.isArray(sceneSpec?.lights) ? sceneSpec.lights : [];
  const materialCount = materials.length || Number(provenance?.materialCount) || 0;
  const lightCount = lights.length || Number(provenance?.lightCount) || 0;

  const materialFidelityProof =
    materials.length > 0
      ? materials.map((m) => ({
          materialId: String(m.id || "material"),
          source: "scene-spec",
          shaderGraphHash: canonicalHash({
            id: m.id,
            color: m.color,
            opacity: m.opacity,
          }),
          textureProvenance: [],
          bsdfJustification: {
            model: "principled-approx",
            physicalBasis:
              "SceneSpecification color/opacity mapped to Cycles Principled (partial — not audited BSDF)",
            energyConservation: null,
          },
        }))
      : materialCount > 0
        ? Array.from({ length: materialCount }, (_, i) => ({
            materialId: `material-${i}`,
            source: "glb-provenance-count",
            shaderGraphHash: null,
            textureProvenance: [],
            bsdfJustification: {
              model: null,
              physicalBasis: "Undeclared — count-only provenance",
              energyConservation: null,
            },
          }))
        : [];

  const lightingJustificationRecord =
    lights.length > 0
      ? lights.map((l) => {
          const emission = Array.isArray(l.emission) ? l.emission : null;
          const intensity = emission
            ? emission.reduce((a, b) => a + Number(b || 0), 0) / emission.length
            : null;
          return {
            lightId: String(l.id || "light"),
            type: l.radius != null ? "area" : "point",
            intensity,
            intensityJustification: emission
              ? `mean(emission)=${intensity}`
              : "undeclared",
            colorTemperature: null,
            colorJustification: "RGB emission from SceneSpecification (no CCT)",
            shadowPlausibility: null,
            globalIlluminationContribution: null,
          };
        })
      : lightCount > 0
        ? Array.from({ length: lightCount }, (_, i) => ({
            lightId: `light-${i}`,
            type: "unknown",
            intensity: null,
            intensityJustification: "Count-only from glb-provenance",
            colorTemperature: null,
            colorJustification: null,
            shadowPlausibility: null,
            globalIlluminationContribution: null,
          }))
        : [];

  const primitiveCount = Number(provenance?.primitiveCount ?? 0) || 0;
  const executionParameters = {
    seed,
    width,
    height,
    samples,
    device,
    renderer: rendererName,
    executionMode,
    glbHash: glbHash || null,
    beautySha256: beautySha || null,
  };
  const deterministicHash = canonicalHash(executionParameters);

  const pep = {
    "@context": "https://sovereign-x.org/ciems/pep-v1",
    artifact: "PhotorealEvidencePacket",
    version: "1.0",
    id: opts.id || `pep-${(beautySha || glbHash || randomUUID()).slice(0, 16)}`,
    timestamp: opts.timestamp || new Date().toISOString(),
    status: "partial",
    photorealClaimLevel: "partial",
    authorityRecord: {
      renderer: {
        name: rendererName,
        version: rendererVersion,
        device,
        executionMode,
      },
      constitutionalRuntime: {
        jcrVersion: opts.jcrVersion || "mrs.governed-render.v1",
        executionHash: deterministicHash,
      },
      sceneIdentityHash: glbHash || provenance?.specHash || "",
    },
    materialFidelityProof,
    lightingJustificationRecord,
    geometryTopologyEvidence: {
      meshCount: primitiveCount || null,
      meshes:
        primitiveCount > 0
          ? [
              {
                meshId: "glb-primitives",
                vertexCount: null,
                faceCount: null,
                normalIntegrity: null,
                uvIntegrity: null,
                topologyHash: provenance?.specHash || null,
              },
            ]
          : [],
    },
    cameraExposureEvidence: {
      cameraId: sceneSpec?.camera ? "scene-spec-camera" : "cycles-active-camera",
      model: "perspective",
      fov: sceneSpec?.camera?.fovY ?? null,
      fovJustification:
        sceneSpec?.camera?.fovY != null
          ? "SceneSpecification.camera.fovY"
          : "Cycles default / script camera — FOV undeclared",
      exposure: null,
      exposureJustification: "undeclared",
      sensorModel: null,
    },
    physicalPlausibilityLedger: {
      energyConservation: null,
      lightTransport: null,
      materialReflectanceBounds: null,
      noiseDistribution:
        samples < 64 ? "high-noise-expected (smoke samples)" : "undeclared",
      sampleDistribution: `samples=${samples}`,
    },
    replayDeterminismRecord: {
      seed,
      resolution: `${width}x${height}`,
      samples,
      device,
      executionParameters,
      deterministicHash,
    },
    beautyArtifact: {
      path: beautyPath,
      sha256: beautySha,
      pixelsProduced: !!(beautyPath && beautySha),
    },
    auditHooks: {
      esfrHook,
      inspectorHook,
      governanceTrail: trailPath,
      evidenceCompletenessScore: 0,
    },
  };

  const completeness = scorePepCompleteness(pep);
  pep.auditHooks.evidenceCompletenessScore = completeness.score;
  pep.completeness = {
    score: completeness.score,
    level: completeness.level,
    gaps: completeness.gaps,
    note: "Partial until MFP/LJC/PPL fully justified — not Full Photoreal",
  };

  if (
    evaluateFullPhotorealEligibility(completeness.score, 1, { forceFull: false })
  ) {
    pep.photorealClaimLevel = "full";
  } else {
    pep.photorealClaimLevel = completeness.level === "none" ? "none" : "partial";
  }

  return { pep, completeness };
}
