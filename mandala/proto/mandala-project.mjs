/**
 * Mandala organ — geometry, fields, visibility, projection.
 *
 * The renderer does not decide what reality is. It receives a certified
 * (frozen) snapshot and answers: what does this state look like from this
 * observation manifold?
 *
 * Status: **partial** (CPU orthographic slice + defect marker). Not a production renderer.
 */

import { idx } from "./constitution.mjs";
import { freezeCertifiedSnapshot } from "./certified-state.mjs";

export const MANDALA_PROJECT_STATUS = "partial";

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function samplePhi(snap, x, y, z) {
  const { nx, ny, nz } = snap.shape;
  const xi = Math.min(nx - 1, Math.max(0, x | 0));
  const yi = Math.min(ny - 1, Math.max(0, y | 0));
  const zi = Math.min(nz - 1, Math.max(0, z | 0));
  return snap.scalar[idx(xi, yi, zi, snap.shape)];
}

/**
 * Project a frozen snapshot to RGB bytes. Mutates only `out` (the image).
 * AI Painter is **declared**: albedo scales luminance; no neural appearance.
 */
export function projectFrozen(snapshot, out, { width, height } = {}) {
  if (!snapshot.frozen) {
    throw new Error("Mandala may only project a frozen certified snapshot");
  }
  const w = width || out.width;
  const h = height || out.height;
  const zPlane = snapshot.observer.z;
  const albedo = snapshot.material.albedo;
  const pixels = out.rgb;
  let p = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = ((px + 0.5) * snapshot.shape.nx) / w;
      const y = ((py + 0.5) * snapshot.shape.ny) / h;
      const phi = samplePhi(snapshot, x, y, zPlane);
      const lum = clamp01(0.5 + phi * 0.25);
      pixels[p++] = Math.round(clamp01(lum * albedo[0]) * 255);
      pixels[p++] = Math.round(clamp01(lum * albedo[1]) * 255);
      pixels[p++] = Math.round(clamp01(lum * albedo[2]) * 255);
    }
  }
  const d = snapshot.defect;
  const dx = Math.min(w - 1, Math.max(0, Math.round((d.x / snapshot.shape.nx) * w)));
  const dy = Math.min(h - 1, Math.max(0, Math.round((d.y / snapshot.shape.ny) * h)));
  const di = (dy * w + dx) * 3;
  pixels[di] = 255;
  pixels[di + 1] = 40;
  pixels[di + 2] = 40;
  out.provenance = {
    organ: "Mandala",
    stateHash: snapshot.hash,
    constitutionId: snapshot.constitutionId,
    seed: snapshot.seed,
    observer: { ...snapshot.observer },
    rule: "orthographic-z-slice",
    t: snapshot.t,
  };
  return out;
}

export function createImage(width = 64, height = 64) {
  return { width, height, rgb: new Uint8Array(width * height * 3), provenance: null };
}

/**
 * Safe entry: freeze internally so callers passing live state cannot project-mutate it.
 * Still copies; live hash is returned unchanged.
 */
export function projectCertified(state, image) {
  const snap = freezeCertifiedSnapshot(state);
  projectFrozen(snap, image);
  return { image, snapshotHash: snap.hash, liveHash: state.hash };
}

export function imageToPpm(image) {
  const header = `P6\n${image.width} ${image.height}\n255\n`;
  return Buffer.concat([Buffer.from(header, "ascii"), Buffer.from(image.rgb)]);
}
