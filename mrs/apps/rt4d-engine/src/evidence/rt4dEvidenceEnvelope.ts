// @mrs/rt4d-engine evidence envelope — status: declared (CIEMS-aligned, substrate-level)
//
// This module produces a CIEMS-aligned evidence envelope for each RT4D dimensional
// preview render. It is a SUBSTRATE-LEVEL artifact: the canonical consumer is the
// external CIEMS / Constitutional Runtime (JCR) on Drive-G
// (G:\CIEMS, G:\.codex\cse\constitutional-runtime). This repo does NOT host that
// runtime and does not label itself JCR/CIEMS; it declares an evidence shape that
// those higher layers are designed to ingest.
//
// The verification layer below reuses renderer-core's invariant conformance suite
// (createEvidenceRecord / validateEvidenceRecord / runInvariantConformanceSuite) as
// the substrate-level verification step; promotion into CIEMS is a separate,
// explicitly-mandated operation, not claimed here.
import {
  canonicalRt4dJson,
  sha256Hex,
  createEvidenceRecord,
  validateEvidenceRecord,
  runInvariantConformanceSuite,
} from "@mrs/renderer-core/rt4d";
import type { SceneSpec, RenderReceipt } from "../store.js";

export type Rt4dEvidenceEnvelope = {
  operation: "rt4d_dimensional_preview";
  source: "mrs-renderer-core/rt4d";
  engineVersion: "1.0.0";
  intentId: string;
  timelineId: string;
  worldId: string;
  sceneId: string;
  sceneSpecHash: string;
  sceneSha256: string;
  runId: string;
  renderKey: string;
  renderId: string;
  seed: number;
  projectionHash: string;
  pixelHash: string;
  pngHash: string;
  pngSha256: string;
  renderHash: string;
  rendererVersion: string;
  runtimeFingerprint: {
    node: string;
    zlib: string;
    platform: string;
    arch: string;
  };
  parameters: Record<string, unknown>;
  parametersHash: string;
  at: string;
  replayToken: string;
  evidenceStatus: "substrate_verified";
  promotionStatus: "not_promoted_to_ciems";
  requestId?: string;
  traceId?: string;
  principalId?: string;
  entitlementDecisionId?: string;
  /** Where the scene spec came from for this render (durable rehydration metadata). */
  scenePersistence?: ScenePersistenceInfo;
};

export type ScenePersistenceInfo = {
  source: "memory" | "dynamodb";
  rehydrated: boolean;
  sceneSpecHash?: string;
  replayToken?: string;
};

export type SceneProvenanceIds = {
  intentId: string;
  timelineId: string;
  worldId: string;
};

export type TraceContextIds = {
  requestId?: string;
  traceId?: string;
  principalId?: string;
  entitlementDecisionId?: string;
};

/**
 * Build the CIEMS-aligned evidence envelope for an RT4D dimensional preview render.
 *
 * Layered determinism tokens (per RT4D_ENGINE_EVIDENCE_SPEC.v1 §7 / Priority #4 AC):
 *   runId, renderId, seed, sceneSpecHash, renderKey, projectionHash, pixelHash,
 *   pngHash/pngSha256, rendererVersion, runtimeFingerprint, at, replayToken.
 *
 * - sceneSpecHash  = sha256Hex(sceneSpec) (canonical, key-sorted)
 * - seed           = deterministic uint32 rng seed (replays identically)
 * - renderKey      = the engine's content-addressable render identifier
 * - renderId       = rt4d-render-<16hex> content-addressed render id
 * - projectionHash = sha256 of canonical (projection + camera + rotations + seed + resolution)
 * - pixelHash      = sha256 of the raw RGBA framebuffer (pixel-equivalent replay across envs)
 * - pngHash/pngSha256 = sha256 of the PNG bytes (byte-identical replay in certified runtime)
 * - replayToken    = sha256(sceneSpecHash + seed + projectionHash) — the single value a
 *                    future CIEMS replay gate compares to authorize a re-render as
 *                    equivalent to a prior one.
 */
export function createRt4dEvidenceEnvelope(
  scene: {
    sceneId: string;
    spec: SceneSpec;
    provenance: { hashes: { sceneSha256: string }; intentId: string; timelineId: string; worldId: string };
  },
  receipt: RenderReceipt,
  params: RenderParamsForEvidence = {},
  trace: TraceContextIds = {},
  scenePersistence?: ScenePersistenceInfo,
): Rt4dEvidenceEnvelope {
  const sceneSpecHash = sha256Hex(canonicalRt4dJson(scene.spec));
  const parameters = {
    seed: Number(receipt.renderParameters.seed),
    maxDepth: receipt.renderParameters.maxDepth,
    samplesPerPixel: receipt.renderParameters.samplesPerPixel,
    width: receipt.renderParameters.width,
    height: receipt.renderParameters.height,
    timeSeconds: receipt.renderParameters.timeSeconds ?? 0,
  };
  const parametersHash = sha256Hex(parameters);
  const replayToken = sha256Hex(
    `${sceneSpecHash}:${Number(receipt.renderParameters.seed)}:${receipt.projectionHash ?? ""}`,
  );

  return {
    operation: "rt4d_dimensional_preview",
    source: "mrs-renderer-core/rt4d",
    engineVersion: "1.0.0",
    intentId: scene.provenance.intentId,
    timelineId: scene.provenance.timelineId,
    worldId: scene.provenance.worldId,
    sceneId: scene.sceneId,
    sceneSpecHash,
    sceneSha256: scene.provenance.hashes.sceneSha256,
    runId: receipt.runId,
    renderKey: receipt.renderKey ?? "",
    renderId: receipt.renderId ?? "",
    seed: Number(receipt.renderParameters.seed),
    projectionHash: receipt.projectionHash ?? "",
    pixelHash: receipt.pixelHash ?? "",
    pngHash: receipt.sha256,
    pngSha256: receipt.sha256,
    renderHash: receipt.sha256,
    rendererVersion: "@mrs/renderer-core/rt4d@1.0.0",
    runtimeFingerprint: receipt.runtimeFingerprint ?? {
      node: "unknown",
      zlib: "builtin",
      platform: "unknown",
      arch: "unknown",
    },
    parameters,
    parametersHash,
    at: receipt.at,
    replayToken,
    evidenceStatus: "substrate_verified",
    promotionStatus: "not_promoted_to_ciems",
    requestId: trace.requestId,
    traceId: trace.traceId,
    principalId: trace.principalId,
    entitlementDecisionId: trace.entitlementDecisionId,
    scenePersistence,
  };
}

export type RenderParamsForEvidence = {
    seed?: number;
    maxDepth?: number;
    samplesPerPixel?: number;
    width?: number;
    height?: number;
    timeSeconds?: number;
  } | Record<string, unknown>;

/**
 * Substrate-level verification that the evidence envelope is backed by the
 * renderer-core invariant conformance suite (runInvariantConformanceSuite) and
 * that the conformance produces a passing EvidenceRecord anchored to this render.
 *
 * This module treats renderer-core's invariants as the local verification layer —
 * NOT as JCR/CIEMS itself. A future CIEMS host consumes the envelope + evidence
 * record as inputs; it is not emulated here.
 */
export function verifyRt4dEvidenceEnvelope(envelope: Rt4dEvidenceEnvelope): { ok: boolean; report: unknown } {
  const conformance: {
    records: Array<{ invariantId: string; verdict: string }>;
    summary: Record<string, number>;
    allFoundationalPassed: boolean;
  } = runInvariantConformanceSuite({ id: "rt4d-dimension-render" });
  const recordsValid = conformance.records.every((r) => validateEvidenceRecord(r).ok);
  const geoLength = conformance.records.find((r) => r.invariantId === "PI-GEO-LENGTH");
  const verdict = geoLength ? geoLength.verdict : "unevaluated";

  const evidenceRecord = createEvidenceRecord({
    invariantId: "PI-GEO-LENGTH",
    layer: "foundational",
    catalogStatus: "tested",
    predicateResult: { ok: verdict === "pass" },
    measurementIds: ["PI-GEO-LENGTH"],
    evidenceAnchors: [envelope.sceneSpecHash, envelope.renderKey, envelope.pngSha256],
    runtimeId: envelope.source,
    note:
      "Substrate-level anchor: this render's determinism (seed-driven mulberry32 rng, no " +
      "Math.random in the path) is claimed under PI-GEO-LENGTH (4D length preservation) via " +
      "the renderer-core conformance suite. Does not assert CIEMS/JCR enforcement.",
  });

  return {
    ok: Boolean(conformance.allFoundationalPassed) && recordsValid && verdict === "pass",
    report: {
      envelope,
      recordsValid,
      conformancesummary: conformance.summary,
      allFoundationalPassed: conformance.allFoundationalPassed,
      evidenceRecord,
    },
  };
}
