/**
 * Mandala organ wrapper — layered projection + optional 2-sample observer accumulation.
 * Must not mutate certified buffers (proof 4).
 * Status: **partial**
 */

import { freezeCertifiedSnapshot } from "../proto/certified-state.mjs";
import { createImage, projectFrozen } from "../proto/mandala-project.mjs";
import { shadeCell } from "./materials/index.mjs";

export const ENGINE_PROJECT_STATUS = "partial";

function clampByte(v) {
  const n = Math.round(v * 255);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/**
 * Project a frozen snapshot with temporal layered BSDF (substrate + defect).
 * Mutates only `out.rgb`.
 */
export function projectFrozenLayered(snapshot, out) {
  if (!snapshot.frozen) {
    throw new Error("Mandala may only project a frozen certified snapshot");
  }
  const w = out.width;
  const h = out.height;
  const zPlane = snapshot.observer.z;
  const pixels = out.rgb;
  let p = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = ((px + 0.5) * snapshot.shape.nx) / w;
      const y = ((py + 0.5) * snapshot.shape.ny) / h;
      const s = shadeCell(snapshot, x, y, zPlane);
      pixels[p++] = clampByte(s.rgb[0]);
      pixels[p++] = clampByte(s.rgb[1]);
      pixels[p++] = clampByte(s.rgb[2]);
    }
  }
  const d = snapshot.defect;
  const dx = Math.min(w - 1, Math.max(0, Math.round((d.x / snapshot.shape.nx) * w)));
  const dy = Math.min(h - 1, Math.max(0, Math.round((d.y / snapshot.shape.ny) * h)));
  const di = (dy * w + dx) * 3;
  pixels[di] = 255;
  pixels[di + 1] = 48;
  pixels[di + 2] = 48;
  out.provenance = {
    organ: "Mandala",
    stateHash: snapshot.hash,
    constitutionId: snapshot.constitutionId,
    seed: snapshot.seed,
    observer: { ...snapshot.observer },
    rule: "orthographic-z-slice-layered-bsdf",
    t: snapshot.t,
    mutatesCertified: false,
  };
  return out;
}

/**
 * Average two observer z samples. Does not touch live certified buffers.
 */
export function accumulateObserverSamples(snapshot, out) {
  const a = { width: out.width, height: out.height, rgb: new Uint8Array(out.rgb.length) };
  const b = { width: out.width, height: out.height, rgb: new Uint8Array(out.rgb.length) };
  const snapA = {
    ...snapshot,
    observer: { ...snapshot.observer },
    defect: { ...snapshot.defect },
    material: { ...snapshot.material, albedo: [...(snapshot.material?.albedo || [])] },
    scalar: snapshot.scalar,
    vector: snapshot.vector,
    frozen: true,
  };
  const zAlt = Math.min(snapshot.shape.nz - 1, Math.max(0, (snapshot.observer.z | 0) + 1));
  const snapB = { ...snapA, observer: { ...snapA.observer, z: zAlt } };
  projectFrozenLayered(snapA, a);
  projectFrozenLayered(snapB, b);
  for (let i = 0; i < out.rgb.length; i++) {
    out.rgb[i] = (a.rgb[i] + b.rgb[i]) >> 1;
  }
  out.provenance = {
    ...(a.provenance || {}),
    rule: "temporal-accumulation-2-observer-samples",
    observerZ: [snapA.observer.z, snapB.observer.z],
    mutatesCertified: false,
  };
  return out;
}

export function projectCertifiedLayered(state, image, { accumulate = false } = {}) {
  const snap = freezeCertifiedSnapshot(state);
  if (accumulate) accumulateObserverSamples(snap, image);
  else projectFrozenLayered(snap, image);
  return { image, snapshotHash: snap.hash, liveHash: state.hash };
}

export { createImage, projectFrozen };
