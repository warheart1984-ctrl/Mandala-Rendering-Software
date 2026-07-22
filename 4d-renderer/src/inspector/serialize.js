import { emptyInspectorResult } from "./types.js";

/** @param {{ x?: number, y?: number, z?: number, w?: number } | number[] | null | undefined} v */
export function vecToArr(v) {
  if (!v) return [0, 0, 0, 0];
  if (Array.isArray(v)) return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0];
}

/**
 * Map internal Inspector4DResult → wire JSON (INSPECTOR_PROTOCOL.md).
 * Vectors are number[4]; miss responses stay compact.
 */
export function resultToWire(result) {
  if (!result?.ok) {
    return {
      type: "inspect_result",
      schemaVersion: result?.schemaVersion ?? "1.1",
      ok: false,
      error: result?.error ?? "unknown",
    };
  }

  const cur = result.curvature ?? {};
  const tb = result.tangentBasis ?? {};
  const prov = result.provenance ?? {};

  return {
    type: "inspect_result",
    schemaVersion: result.schemaVersion ?? "1.1",
    ok: true,
    position: vecToArr(result.position),
    normal4D: vecToArr(result.normal4D),
    tangentBasis: {
      t1: vecToArr(tb.t1),
      t2: vecToArr(tb.t2),
    },
    curvature: {
      k1: cur.k1 ?? 0,
      k2: cur.k2 ?? 0,
      dir1: vecToArr(cur.dir1),
      dir2: vecToArr(cur.dir2),
      // MRS-IC 3.5 — mark stub until second fundamental forms exist
      curvatureStub: cur.curvatureStub !== false,
    },
    jacobian: (result.jacobian ?? []).map((row) => [...row]),
    projectionMatrix: (result.projectionMatrix ?? []).map((row) => [...row]),
    rotationPlanes: (result.rotationPlanes ?? []).map((r) => ({
      axisA: vecToArr(r.axisA),
      axisB: vecToArr(r.axisB),
      angle: r.angle ?? 0,
      label: r.label ?? "",
    })),
    hyperplanes: (result.hyperplanes ?? []).map((h) => ({
      normal: vecToArr(h.normal),
      d: h.d ?? 0,
      distance: h.distance ?? 0,
      onPlane: !!h.onPlane,
    })),
    topology: {
      incidentCellIds: [...(result.topology?.incidentCellIds ?? [])],
      neighborCellIds: [...(result.topology?.neighborCellIds ?? [])],
      isBoundary: !!result.topology?.isBoundary,
    },
    provenance: {
      primitiveId: prov.primitiveId ?? -1,
      bvhPath: [...(prov.bvhPath ?? [])],
      faceIndex: prov.faceIndex ?? -1,
    },
    shaderDebug: result.shaderDebug ?? null,
  };
}

export function resultToJSON(result) {
  return JSON.stringify(resultToWire(result), null, 2);
}

/** Non-crypto fingerprint for skeleton bundles (portable). */
export function fingerprintHex(text) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${h.toString(16)}`;
}

export function buildInspectorEvidenceBundle(result, meta = {}) {
  const body = {
    schemaVersion: "1.1",
    frameIndex: meta.frameIndex ?? 0,
    rayInput: meta.rayInput ?? null,
    screenInput: meta.screenInput ?? null,
    bvhPath: result?.provenance?.bvhPath ?? [],
    primitiveId: result?.provenance?.primitiveId ?? -1,
    result: result ?? emptyInspectorResult(),
  };
  const canonical = JSON.stringify(body);
  return { ...body, hash: fingerprintHex(canonical) };
}
