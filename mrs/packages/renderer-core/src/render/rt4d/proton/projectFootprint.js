/**
 * Project Proton4D → 2D isotropic footprints for soft splat.
 *
 * STATUS: **enforced** (isotropic MVP)
 *
 * Screen sigma:
 *   sigma_px = max(0.5, (radius/2) * scale * (d4/(d4+mu.w)) * (d3/(d3+z3)))
 *
 * Anisotropic Σ∈R⁴ˣ⁴ is **declared** — ignored with clear skip reason when
 * present without usable isotropic radius.
 */

import { Projector4D } from "../output/projector.js";
import { resolveMu } from "./types.js";

/**
 * @param {import("./types.js").Proton4D} proton
 * @param {Projector4D} projector
 * @returns {import("./types.js").ProtonFootprint2D|null}
 */
function projectOne(proton, projector) {
  const muArr = resolveMu(proton);
  if (!muArr) return null;
  if (
    (proton.Sigma != null ||
      /** @type {Record<string, unknown>} */ (proton).covariance != null) &&
    !(typeof proton.radius === "number" && proton.radius > 0)
  ) {
    // Anisotropic-only: reject for MVP
    return null;
  }
  const radius =
    typeof proton.radius === "number" && proton.radius > 0
      ? proton.radius
      : 0.5;
  const point = { x: muArr[0], y: muArr[1], z: muArr[2], w: muArr[3] };
  const p3d = projector.project4Dto3D(point);
  const { sx, sy } = projector.project3Dto2D(p3d);
  const wFactor = projector.d4 / (projector.d4 + point.w);
  const z3 = p3d.z;
  const zFactor = z3 === 0 ? 1 : projector.d3 / (projector.d3 + z3);
  const sigmaWorld = radius / 2;
  const sigma_px = Math.max(
    0.5,
    sigmaWorld * projector.scale * wFactor * zFactor,
  );
  const opacity =
    typeof proton.opacity === "number"
      ? proton.opacity
      : typeof proton.weight === "number"
        ? proton.weight
        : 1;
  /** @type {import("./types.js").ProtonFootprint2D} */
  const fp = {
    id: proton.id,
    x: sx,
    y: sy,
    sigma: sigma_px,
    opacity,
  };
  if (proton.color != null) fp.color = proton.color;
  return fp;
}

/**
 * @param {import("./types.js").Proton4D[]|import("./types.js").Proton4D} protons
 * @param {Record<string, unknown>|Projector4D} [cameraOrOpts]
 * @returns {import("./types.js").ProtonFootprint2D[]}
 */
export function projectFootprint(protons, cameraOrOpts = {}) {
  const list = Array.isArray(protons) ? protons : protons ? [protons] : [];
  /** @type {Projector4D} */
  let projector;
  if (cameraOrOpts instanceof Projector4D) {
    projector = cameraOrOpts;
  } else {
    const opts =
      cameraOrOpts && typeof cameraOrOpts === "object" ? cameraOrOpts : {};
    projector = new Projector4D({
      d4: opts.d4 ?? opts.camera?.d4 ?? 4,
      d3: opts.d3 ?? opts.camera?.d3 ?? 4,
      scale: opts.scale ?? opts.camera?.scale ?? 80,
      width: opts.width ?? 256,
      height: opts.height ?? 256,
    });
  }

  /** @type {import("./types.js").ProtonFootprint2D[]} */
  const out = [];
  // Stable order by id (P4) before projection
  const sorted = list.slice().sort((a, b) => {
    const ia = String(a?.id ?? "");
    const ib = String(b?.id ?? "");
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  });
  for (const p of sorted) {
    const fp = projectOne(p, projector);
    if (fp) out.push(fp);
  }
  return out;
}
