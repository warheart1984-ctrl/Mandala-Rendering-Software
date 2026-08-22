/**
 * Holographic projection receipt + boundary screen — Claim A.
 * Status: **partial**
 *
 * Keep rendering bulk from certified state as today.
 * Observation path never mutates certified hash.
 */

import { createHash } from "node:crypto";
import {
  encodeBoundary,
  reconstructBulkPreview,
  boundaryInfoDensityBitmap,
  CLAIM,
  HOLOGRAPHY_STATUS,
} from "./boundary.mjs";
import { bulkToBoundaryInformation } from "./translate.mjs";
import { freezeCertifiedSnapshot } from "../proto/certified-state.mjs";
import { PROTO_SHAPE } from "../proto/constitution.mjs";
import { INDUCED_METRIC_IDS } from "./metric.mjs";

function hashFloat32(arr) {
  const h = createHash("sha256");
  h.update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  return h.digest("hex");
}

/**
 * Project a preview bulk from boundary encoding of a certified (or plain) slice.
 *
 * - Works on a **copy** of scalar data; never writes into certified buffers.
 * - Receipt hashes boundary vs bulk and asserts boundary byte size < full volume.
 *
 * @param {object} source — certified state `{ scalar, shape, hash? }` or `{ scalar, shape }`
 * @param {{ screenFace?: string, translation?: boolean, conformal?: boolean, t?: number }} [opts]
 * @returns {{ preview, boundary, receipt, boundaryInfo? }}
 */
export function projectBulkFromBoundary(source, opts = {}) {
  const shape = source.shape || PROTO_SHAPE;
  const liveScalar = source.scalar;
  if (!liveScalar || typeof liveScalar.length !== "number") {
    throw new Error("projectBulkFromBoundary requires source.scalar");
  }

  const certifiedHashBefore =
    typeof source.hash === "string" ? source.hash : null;
  const liveHashBefore = hashFloat32(liveScalar);

  const useTranslation = opts.translation !== false;
  let boundary;
  let boundaryInfo = null;
  let preview;

  if (useTranslation) {
    boundaryInfo = bulkToBoundaryInformation(source, {
      t: opts.t,
      conformal: opts.conformal,
    });
    boundary = {
      kind: "cube-faces-boundary",
      status: HOLOGRAPHY_STATUS,
      claim: CLAIM,
      shape: boundaryInfo.shape,
      faces: boundaryInfo.faces,
      faceIds: boundaryInfo.faceIds,
      byteLength: boundaryInfo.byteLength,
      bulkByteLength: boundaryInfo.bulkByteLength,
      hash: boundaryInfo.facesOnlyHash || boundaryInfo.hash,
      h_ij: boundaryInfo.h_ij,
      omega: boundaryInfo.omega,
      inducedMetricId: boundaryInfo.inducedMetricId,
      causalStamp: boundaryInfo.causalStamp,
      infoDensity: boundaryInfo.infoDensity,
    };
    preview = reconstructBulkPreview(boundary, { metricAware: true });
  } else {
    const scalarCopy = new Float32Array(liveScalar);
    boundary = encodeBoundary(scalarCopy, shape);
    preview = reconstructBulkPreview(boundary, { metricAware: false });
  }

  const previewHash = hashFloat32(preview);

  const liveHashAfter = hashFloat32(liveScalar);
  const mutatedLive = liveHashBefore !== liveHashAfter;
  if (mutatedLive) {
    throw new Error("holography mutated live scalar — forbidden");
  }

  let certifiedHashAfter = certifiedHashBefore;
  if (certifiedHashBefore != null && typeof source.hash === "string") {
    certifiedHashAfter = source.hash;
  }

  const inducedMetricId =
    boundary.inducedMetricId ||
    boundaryInfo?.inducedMetricId ||
    INDUCED_METRIC_IDS.FLAT_DELTA;

  const receipt = {
    kind: "holographic-projection-receipt",
    status: HOLOGRAPHY_STATUS,
    claim: CLAIM,
    bulkHash: liveHashBefore,
    boundaryHash: boundaryInfo?.hash || boundary.hash,
    facesHash: boundary.hash,
    previewHash,
    inducedMetricId,
    bulkByteLength: boundary.bulkByteLength,
    boundaryByteLength: boundary.byteLength,
    sizes: {
      bulkCells: boundary.shape.cellCount,
      boundaryFaceFloats: boundary.byteLength / 4,
      nx: boundary.shape.nx,
      ny: boundary.shape.ny,
      nz: boundary.shape.nz,
    },
    boundarySmallerThanBulk: boundary.byteLength < boundary.bulkByteLength,
    compressionRatio: boundary.bulkByteLength / boundary.byteLength,
    certifiedHashBefore,
    certifiedHashAfter,
    certifiedUnchanged:
      certifiedHashBefore == null || certifiedHashBefore === certifiedHashAfter,
    liveScalarUnchanged: !mutatedLive,
    reconstruction: "approximate-partial-preview",
    note:
      "Partial reconstruct from boundary preview ≠ certified bulk. Duality predicted full rebuild — we only demo coarse preview. Chamber owns evolution; holography observes.",
  };

  if (!receipt.boundarySmallerThanBulk) {
    throw new Error("cube-faces boundary must be smaller than full volume");
  }

  return { preview, boundary, boundaryInfo, receipt };
}

/**
 * Compute holographic screen data at slice t (infoDensity heatmap tensors + receipt).
 * Does not mutate certified state.
 *
 * @param {object} bulk — certified state
 * @param {number} [t]
 * @param {{ conformal?: boolean }} [opts]
 */
export function computeBoundaryScreen(bulk, t, opts = {}) {
  const tt = t != null ? t | 0 : bulk.t | 0;
  const liveHashBefore =
    bulk.scalar && typeof bulk.scalar.length === "number"
      ? hashFloat32(bulk.scalar)
      : null;
  const certifiedHashBefore =
    typeof bulk.hash === "string" ? bulk.hash : null;

  const boundaryInfo = bulkToBoundaryInformation(bulk, {
    t: tt,
    conformal: opts.conformal,
  });
  const screen = boundaryInfoDensityBitmap(boundaryInfo);

  if (liveHashBefore != null) {
    const liveHashAfter = hashFloat32(bulk.scalar);
    if (liveHashAfter !== liveHashBefore) {
      throw new Error("computeBoundaryScreen mutated live scalar — forbidden");
    }
  }
  if (
    certifiedHashBefore != null &&
    typeof bulk.hash === "string" &&
    bulk.hash !== certifiedHashBefore
  ) {
    throw new Error("computeBoundaryScreen mutated certified hash — forbidden");
  }

  return {
    kind: "holographic-screen",
    t: tt,
    boundaryInfo,
    screen,
    receipt: {
      kind: "holographic-screen-receipt",
      status: HOLOGRAPHY_STATUS,
      boundaryHash: boundaryInfo.hash,
      bulkHash: certifiedHashBefore || liveHashBefore,
      inducedMetricId: boundaryInfo.inducedMetricId,
      sizes: {
        width: screen.width,
        height: screen.height,
        nx: boundaryInfo.shape.nx,
        ny: boundaryInfo.shape.ny,
        nz: boundaryInfo.shape.nz,
        infoDensityFloats: FACE_FLOAT_COUNT(boundaryInfo),
      },
      certifiedUnchanged: true,
      note: "Holographic screen = infoDensity heatmap; time encoded as causalStamp, not an axis",
    },
  };
}

function FACE_FLOAT_COUNT(boundaryInfo) {
  let n = 0;
  for (const id of Object.keys(boundaryInfo.infoDensity || {})) {
    n += boundaryInfo.infoDensity[id].length;
  }
  return n;
}

/**
 * Convenience: freeze certified state, then holography-project the frozen copy.
 * Certified live state is untouched (freeze already copies).
 */
export function projectCertifiedHolography(state, opts = {}) {
  const snap = freezeCertifiedSnapshot(state);
  // Attach temporal cache by reference for causalStamp (read-only observation)
  if (state.temporal) {
    snap.temporal = state.temporal;
  }
  if (state.defect) snap.defect = { ...state.defect };
  const result = projectBulkFromBoundary(snap, opts);
  return {
    ...result,
    frozenHash: snap.hash,
    certifiedLiveHash: state.hash,
  };
}
