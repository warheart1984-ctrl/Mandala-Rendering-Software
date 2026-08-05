/**
 * RenderIdentity — the constitutional identity of a render artifact.
 *
 * AC-R10 invariant: different constitutional render identities must never
 * converge onto the same cached geometry, intersector, causal model, or
 * accumulation state unless equivalence is explicitly proven.
 *
 * Every cache in the RT4D pipeline (sampled surface geometry, TriangleMesh4D,
 * BVH construction, intersector instances, path-tracer accumulation, render
 * evidence) must key on renderIdentityHash(). Two intents with different
 * RenderIdentity values must never share cached artifacts.
 */

import { createHash } from "node:crypto";

export const DEFAULT_METRIC_ID = "euclidean";
export const DEFAULT_METRIC_VERSION = "1.0.0";

/** Deterministic canonical serialization (fixed key order) of a RenderIdentity. */
export function canonicalIdentityJson(identity) {
  const canonical = {
    surfaceId: identity.surfaceId,
    geometryEvidenceId: identity.geometryEvidenceId,
    geometryHash: identity.geometryHash,
    metricId: identity.metricId,
    metricVersion: identity.metricVersion,
    timeSeconds: identity.timeSeconds ?? 0,
    projectionId: identity.projectionId,
  };
  return JSON.stringify(canonical);
}

/** Content-addressed hash of a RenderIdentity — the cache/artifact key. */
export function renderIdentityHash(identity) {
  return createHash("sha256").update(canonicalIdentityJson(identity)).digest("hex");
}

/**
 * Stable, content-addressed id for one rendered geometry instance.
 * Covers the parametric surface identity (surfaceHash), the sampling
 * resolution, the bake time, and the projection that consumes the mesh.
 */
export function deriveGeometryEvidenceId(options) {
  const {
    surfaceId,
    resolution,
    timeSeconds = 0,
    surfaceHash = "",
    projectionId = "",
  } = options ?? {};
  return createHash("sha256")
    .update(
      `rt4d-geometry-evidence:v1:${surfaceId}:${resolution}:${timeSeconds}:${projectionId}:${surfaceHash}`,
    )
    .digest("hex");
}

/** Thrown when the render identity evidence chain disagrees at a boundary. */
export class RenderIdentityViolation extends Error {
  constructor(message) {
    super(message);
    this.name = "RenderIdentityViolation";
  }
}

/**
 * Fail-fast boundary for the RendererSurfaceDispatch contract.
 * Throws on any disagreement instead of silently converging caches.
 *
 * @param {object} intent      - the render intent (surfaceId, geometryEvidenceId, metricId, ...)
 * @param {object} evidence    - geometry evidence ({ id, surfaceId, geometryHash })
 * @param {object} mesh        - the concrete mesh about to be traced
 * @param {object} scene       - the Scene4D carrying a metric
 * @param {object} intersector - the intersector bound to the mesh
 */
export function assertRenderIdentityBoundary(intent, evidence, mesh, scene, intersector) {
  if (!intent?.geometryEvidenceId) {
    throw new RenderIdentityViolation("intent.geometryEvidenceId is required");
  }
  if (!intent?.metricId) {
    throw new RenderIdentityViolation("intent.metricId is required");
  }
  if (!evidence?.id || evidence.id !== intent.geometryEvidenceId) {
    throw new RenderIdentityViolation(
      `evidence.id mismatch: expected ${intent.geometryEvidenceId}, got ${evidence?.id ?? "none"}`,
    );
  }
  if (evidence.surfaceId !== intent.surfaceId) {
    throw new RenderIdentityViolation(
      `evidence.surfaceId mismatch: expected ${intent.surfaceId}, got ${evidence.surfaceId}`,
    );
  }
  if (mesh?.geometryHash !== evidence.geometryHash) {
    throw new RenderIdentityViolation(
      `mesh.geometryHash mismatch: expected ${evidence.geometryHash}, got ${mesh?.geometryHash ?? "none"}`,
    );
  }
  if (scene?.metric?.id !== intent.metricId) {
    throw new RenderIdentityViolation(
      `scene.metric.id mismatch: expected ${intent.metricId}, got ${scene?.metric?.id ?? "none"}`,
    );
  }
  if (intersector?.geometryHash !== evidence.geometryHash) {
    throw new RenderIdentityViolation(
      `intersector.geometryHash mismatch: expected ${evidence.geometryHash}, got ${intersector?.geometryHash ?? "none"}`,
    );
  }
}
