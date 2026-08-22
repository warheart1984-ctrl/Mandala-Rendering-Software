/**
 * Translation layer: BulkGeometry → BoundaryInformation (Claim A).
 *
 * | Bulk                         | Boundary                                      |
 * |------------------------------|-----------------------------------------------|
 * | curvature / φ gradients      | entanglement/info gradients (proxy)           |
 * | worldlines / defects         | correlation chains along face                 |
 * | causal cones                 | light-sheet / null-constraint stub            |
 * | energy density               | boundary operator ≈ face φ or |∇φ|            |
 *
 * Time is encoded as information (causalStamp + infoDensity), not a drawn axis.
 * Status: **partial** — approximate / preview only; ≠ certified bulk.
 */

import { createHash } from "node:crypto";
import { PROTO_SHAPE, idx } from "../proto/constitution.mjs";
import {
  FACE_IDS,
  encodeBoundary,
  hashBoundary,
  HOLOGRAPHY_STATUS,
  CLAIM,
} from "./boundary.mjs";
import {
  inducedMetricOnSlice,
  INDUCED_METRIC_IDS,
  MINKOWSKI_C,
  nullConstraintOk,
} from "./metric.mjs";

export const TRANSLATION_STATUS = "partial";
export const TRANSLATION_CLAIM =
  "BulkGeometry → BoundaryInformation — computational encoding only; not AdS/CFT / RT / HRT";

/** Default Δt window (slices) for causalStamp when temporal cache exists. */
export const DEFAULT_CAUSAL_DT = 3;

/** Inward-normal depth samples when temporal history is thin. */
export const DEFAULT_INWARD_DEPTH = 4;

function assertShape(shape) {
  const nx = shape?.nx | 0;
  const ny = shape?.ny | 0;
  const nz = shape?.nz | 0;
  if (nx < 2 || ny < 2 || nz < 2) {
    throw new Error(`translate needs nx,ny,nz ≥ 2, got ${nx}×${ny}×${nz}`);
  }
  return { nx, ny, nz, cellCount: nx * ny * nz, nt: shape?.nt | 0 };
}

/**
 * Face layouts: each face is (u,v) with fixed normal axis.
 * Returns { getBulk(u,v,depth), faceLen, wu, hv } where depth≥0 walks inward.
 */
function faceAccessors(shape) {
  const { nx, ny, nz } = shape;
  return {
    negX: {
      len: ny * nz,
      wu: ny,
      hv: nz,
      sample(bulk, u, v, depth) {
        const x = Math.min(nx - 1, Math.max(0, depth | 0));
        return bulk[idx(x, u, v, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= ny || nv < 0 || nv >= nz) return null;
        return { u: nu, v: nv };
      },
    },
    posX: {
      len: ny * nz,
      wu: ny,
      hv: nz,
      sample(bulk, u, v, depth) {
        const x = Math.min(nx - 1, Math.max(0, nx - 1 - (depth | 0)));
        return bulk[idx(x, u, v, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= ny || nv < 0 || nv >= nz) return null;
        return { u: nu, v: nv };
      },
    },
    negY: {
      len: nx * nz,
      wu: nx,
      hv: nz,
      sample(bulk, u, v, depth) {
        const y = Math.min(ny - 1, Math.max(0, depth | 0));
        return bulk[idx(u, y, v, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= nx || nv < 0 || nv >= nz) return null;
        return { u: nu, v: nv };
      },
    },
    posY: {
      len: nx * nz,
      wu: nx,
      hv: nz,
      sample(bulk, u, v, depth) {
        const y = Math.min(ny - 1, Math.max(0, ny - 1 - (depth | 0)));
        return bulk[idx(u, y, v, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= nx || nv < 0 || nv >= nz) return null;
        return { u: nu, v: nv };
      },
    },
    negZ: {
      len: nx * ny,
      wu: nx,
      hv: ny,
      sample(bulk, u, v, depth) {
        const z = Math.min(nz - 1, Math.max(0, depth | 0));
        return bulk[idx(u, v, z, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= nx || nv < 0 || nv >= ny) return null;
        return { u: nu, v: nv };
      },
    },
    posZ: {
      len: nx * ny,
      wu: nx,
      hv: ny,
      sample(bulk, u, v, depth) {
        const z = Math.min(nz - 1, Math.max(0, nz - 1 - (depth | 0)));
        return bulk[idx(u, v, z, shape)];
      },
      neighbor(u, v, du, dv) {
        const nu = u + du;
        const nv = v + dv;
        if (nu < 0 || nu >= nx || nv < 0 || nv >= ny) return null;
        return { u: nu, v: nv };
      },
    },
  };
}

function sliceAt(state, t, shape) {
  const n = shape.cellCount;
  const filled = state.temporal?.filled | 0;
  if (state.temporal?.scalarCache && filled > 0) {
    const tt = Math.max(0, Math.min(filled - 1, t | 0));
    return state.temporal.scalarCache.subarray(tt * n, tt * n + n);
  }
  return state.scalar;
}

/**
 * Causal ordering stamp: scalar digest of φ along inward normal over a short
 * Δt window (temporal cache) or spatial depth (when history thin).
 * Not a quantum causal diamond — computational proxy.
 */
function buildCausalStamp(faceId, acc, state, shape, t, opts) {
  const stamp = new Float32Array(acc.len);
  const depth = opts.inwardDepth ?? DEFAULT_INWARD_DEPTH;
  const dtWin = opts.causalDt ?? DEFAULT_CAUSAL_DT;
  const filled = state.temporal?.filled | 0;
  const useTemporal = filled > 1;

  for (let v = 0; v < acc.hv; v++) {
    for (let u = 0; u < acc.wu; u++) {
      let mix = 0;
      let wsum = 0;
      if (useTemporal) {
        const t0 = Math.max(0, (t | 0) - dtWin + 1);
        const t1 = Math.min(filled - 1, t | 0);
        for (let tt = t0; tt <= t1; tt++) {
          const bulk = sliceAt(state, tt, shape);
          const phi = acc.sample(bulk, u, v, 0);
          const w = 1 + (tt - t0);
          mix += w * phi;
          wsum += w;
          // fold a cheap rolling hash into fractional part
          mix = mix * 1.0000001 + ((phi * 1e3) % 1) * 0.01;
        }
      } else {
        const bulk = state.scalar;
        for (let d = 0; d < depth; d++) {
          const phi = acc.sample(bulk, u, v, d);
          const w = depth - d;
          mix += w * phi;
          wsum += w;
          mix = mix * 1.0000001 + ((phi * 1e3) % 1) * 0.01;
        }
      }
      stamp[u + acc.wu * v] = wsum ? mix / wsum : 0;
    }
  }
  return stamp;
}

/**
 * correlationProxy / infoDensity: neighbor agreement on the face
 * (cheap “entanglement gradient” analogue — NOT von Neumann entropy).
 * Also fold |∇_face φ| as energy-density stand-in.
 */
function buildInfoAndCorrelation(faceId, acc, facePhi) {
  void faceId;
  const infoDensity = new Float32Array(acc.len);
  const correlationProxy = new Float32Array(acc.len);
  const offs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let v = 0; v < acc.hv; v++) {
    for (let u = 0; u < acc.wu; u++) {
      const i = u + acc.wu * v;
      const phi = facePhi[i];
      let agree = 0;
      let count = 0;
      let grad2 = 0;
      for (const [du, dv] of offs) {
        const n = acc.neighbor(u, v, du, dv);
        if (!n) continue;
        const j = n.u + acc.wu * n.v;
        const d = phi - facePhi[j];
        agree += 1 / (1 + Math.abs(d));
        grad2 += d * d;
        count++;
      }
      correlationProxy[i] = count ? agree / count : 1;
      // infoDensity ≈ |∇φ| proxy + (1 − correlation) as “entanglement gradient” stand-in
      const grad = Math.sqrt(grad2 / Math.max(1, count));
      infoDensity[i] = grad + (1 - correlationProxy[i]);
    }
  }
  return { infoDensity, correlationProxy };
}

/**
 * Defect / worldline → correlation chain markers on faces (binary-ish boost).
 */
function boostDefectChains(infoDensity, correlationProxy, faceId, acc, defect, shape) {
  if (!defect) return;
  const { nx, ny, nz } = shape;
  const { x, y, z } = defect;
  let hit = false;
  let u = 0;
  let v = 0;
  if (faceId === "negX" && x === 0) {
    hit = true;
    u = y;
    v = z;
  } else if (faceId === "posX" && x === nx - 1) {
    hit = true;
    u = y;
    v = z;
  } else if (faceId === "negY" && y === 0) {
    hit = true;
    u = x;
    v = z;
  } else if (faceId === "posY" && y === ny - 1) {
    hit = true;
    u = x;
    v = z;
  } else if (faceId === "negZ" && z === 0) {
    hit = true;
    u = x;
    v = y;
  } else if (faceId === "posZ" && z === nz - 1) {
    hit = true;
    u = x;
    v = y;
  }
  if (!hit) return;
  const i = u + acc.wu * v;
  if (i >= 0 && i < infoDensity.length) {
    infoDensity[i] += 0.5;
    correlationProxy[i] = Math.min(1, correlationProxy[i] + 0.25);
  }
}

function hashBoundaryInformation(boundaryInfo) {
  const h = createHash("sha256");
  h.update("mandala.holography.boundary-information.v1");
  const { shape, inducedMetricId } = boundaryInfo;
  h.update(`\0${shape.nx}x${shape.ny}x${shape.nz}\0${inducedMetricId}\0`);
  h.update(Buffer.from(boundaryInfo.h_ij.buffer, boundaryInfo.h_ij.byteOffset, boundaryInfo.h_ij.byteLength));
  for (const id of FACE_IDS) {
    h.update(id);
    const f = boundaryInfo.faces[id];
    h.update(Buffer.from(f.buffer, f.byteOffset, f.byteLength));
    const info = boundaryInfo.infoDensity[id];
    h.update(Buffer.from(info.buffer, info.byteOffset, info.byteLength));
    const stamp = boundaryInfo.causalStamp[id];
    h.update(Buffer.from(stamp.buffer, stamp.byteOffset, stamp.byteLength));
  }
  return h.digest("hex");
}

/**
 * Map bulk geometry / fields → structured BoundaryInformation.
 *
 * @param {object} bulk — certified state or { scalar, shape, temporal?, defect?, t? }
 * @param {{ t?: number, conformal?: boolean, causalDt?: number, inwardDepth?: number }} [opts]
 * @returns {object} BoundaryInformation
 */
export function bulkToBoundaryInformation(bulk, opts = {}) {
  const shape = assertShape(bulk.shape || PROTO_SHAPE);
  const t = opts.t != null ? opts.t | 0 : bulk.t | 0;
  const scalar =
    bulk.temporal?.scalarCache && (bulk.temporal.filled | 0) > 0
      ? sliceAt(bulk, t, shape)
      : bulk.scalar;
  if (!scalar || scalar.length < shape.cellCount) {
    throw new Error("bulkToBoundaryInformation requires bulk.scalar (or temporal cache)");
  }

  // Observation copy — never mutate certified buffers
  const scalarCopy = new Float32Array(scalar);
  const faceBoundary = encodeBoundary(scalarCopy, shape);
  const induced = inducedMetricOnSlice(
    { scalar: scalarCopy, shape },
    t,
    { conformal: !!opts.conformal },
  );

  const accessors = faceAccessors(shape);
  const infoDensity = {};
  const causalStamp = {};
  const correlationProxy = {};

  const stateLike = {
    scalar: scalarCopy,
    temporal: bulk.temporal,
    shape,
  };

  for (const id of FACE_IDS) {
    const acc = accessors[id];
    const facePhi = faceBoundary.faces[id];
    causalStamp[id] = buildCausalStamp(id, acc, stateLike, shape, t, opts);
    const ic = buildInfoAndCorrelation(id, acc, facePhi);
    infoDensity[id] = ic.infoDensity;
    correlationProxy[id] = ic.correlationProxy;
    boostDefectChains(
      infoDensity[id],
      correlationProxy[id],
      id,
      acc,
      bulk.defect,
      shape,
    );
  }

  const h_ij = new Float32Array(9);
  for (let i = 0; i < 9; i++) h_ij[i] = induced.h[i];

  const boundaryInfo = {
    kind: "boundary-information",
    status: TRANSLATION_STATUS,
    claim: CLAIM,
    translation: TRANSLATION_CLAIM,
    t,
    shape: { nx: shape.nx, ny: shape.ny, nz: shape.nz, cellCount: shape.cellCount },
    faces: faceBoundary.faces,
    faceIds: FACE_IDS,
    h_ij,
    inducedMetricId: induced.id || INDUCED_METRIC_IDS.FLAT_DELTA,
    omega: induced.omega ?? 1,
    infoDensity,
    causalStamp,
    correlationProxy,
    dictionary: Object.freeze({
      curvatureOrPhiGradients: "infoDensity / correlationProxy gradients on faces",
      worldlinesDefects: "correlation-chain boosts where defect meets face",
      causalCones: "nullConstraintOk stub + causalStamp temporal/inward digest",
      energyDensity: "face φ (faces) and |∇_face φ| inside infoDensity",
    }),
    nullConstraint: Object.freeze({
      status: "declared",
      c: MINKOWSKI_C,
      check: "nullConstraintOk(dx,dy,dz,dt)",
      note: "light-sheet / null stub — not continuum geodesic solver",
    }),
    byteLength: faceBoundary.byteLength,
    bulkByteLength: faceBoundary.bulkByteLength,
    facesHash: faceBoundary.hash,
    timeAsInformation: Object.freeze({
      note: "time → causalStamp + infoDensity on the boundary; not a drawn t-axis",
      status: "partial",
    }),
  };

  boundaryInfo.hash = hashBoundaryInformation(boundaryInfo);
  // Preserve faces-only hash for compatibility
  boundaryInfo.facesOnlyHash = hashBoundary(faceBoundary.faces, shape);
  return boundaryInfo;
}

/**
 * Alias matching the user API name BulkGeometry → BoundaryInformation.
 */
export function translateBulkToBoundary(bulkGeometry, opts) {
  return bulkToBoundaryInformation(bulkGeometry, opts);
}

export { nullConstraintOk };
