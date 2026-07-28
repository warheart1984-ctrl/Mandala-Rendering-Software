/**
 * CECP Mod 2 — ProtonField→4DProjection
 *
 * STATUS: **enforced**
 *
 * Camera4D { origin∈R⁴, basis 4×3 (three R⁴ axes), params }
 * → ProjectedProtonField. No silent loss: every proton is in
 * `protons[]` or `dropped[]` with an explicit reason.
 */

import { Projector4D } from "../output/projector.js";

/**
 * @typedef {object} Camera4DProton
 * @property {[number, number, number, number]} origin
 * @property {[[number, number, number, number], [number, number, number, number], [number, number, number, number]]} [basis]
 *   Columns: right, up, forward (each length-4). Optional — default identity screen axes.
 * @property {{ d4?: number, d3?: number, scale?: number, width?: number, height?: number, nearW?: number }} [params]
 */

/**
 * @typedef {object} ProjectedProton
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} sigma
 * @property {number} depth  Non-negative view-space depth proxy
 * @property {[number, number, number]} color
 * @property {number} density
 * @property {[number, number, number]} normal3  View-space unit normal proxy
 * @property {Record<string, unknown>} metadata
 * @property {boolean} [clipped]
 */

/**
 * @typedef {object} ProjectedProtonField
 * @property {ProjectedProton[]} protons
 * @property {{ id: string, reason: string }[]} dropped
 * @property {Camera4DProton} camera
 * @property {string} status
 */

/**
 * @param {number[]} v
 * @param {number[]} o
 */
function sub4(v, o) {
  return [
    (Number(v[0]) || 0) - (Number(o[0]) || 0),
    (Number(v[1]) || 0) - (Number(o[1]) || 0),
    (Number(v[2]) || 0) - (Number(o[2]) || 0),
    (Number(v[3]) || 0) - (Number(o[3]) || 0),
  ];
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function dot4(a, b) {
  return (
    (a[0] || 0) * (b[0] || 0) +
    (a[1] || 0) * (b[1] || 0) +
    (a[2] || 0) * (b[2] || 0) +
    (a[3] || 0) * (b[3] || 0)
  );
}

/**
 * Default Camera4D looking along +z from origin offset.
 * @param {Partial<Camera4DProton> & { width?: number, height?: number }} [opts]
 * @returns {Camera4DProton}
 */
export function defaultCamera4D(opts = {}) {
  return {
    origin: opts.origin ?? [0, 0, -2, 0],
    basis: opts.basis ?? [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ],
    params: {
      d4: 4,
      d3: 4,
      scale: 80,
      width: opts.width ?? opts.params?.width ?? 256,
      height: opts.height ?? opts.params?.height ?? 256,
      nearW: 0.05,
      ...(opts.params ?? {}),
    },
  };
}

/**
 * @param {import("./sceneToProtonField.js").ProtonField} field
 * @param {Camera4DProton|Record<string, unknown>} [cameraIn]
 * @returns {ProjectedProtonField}
 */
export function projectProtonField(field, cameraIn = {}) {
  if (!field || !Array.isArray(field.protons)) {
    throw new Error("projectProtonField: ProtonField required");
  }
  const camera = defaultCamera4D(
    /** @type {Partial<Camera4DProton> & { width?: number, height?: number }} */ (
      cameraIn && typeof cameraIn === "object" ? cameraIn : {}
    ),
  );
  const params = camera.params ?? {};
  const projector = new Projector4D({
    d4: params.d4 ?? 4,
    d3: params.d3 ?? 4,
    scale: params.scale ?? 80,
    width: params.width ?? 256,
    height: params.height ?? 256,
  });
  const origin = camera.origin ?? [0, 0, -2, 0];
  const basis = camera.basis ?? [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ];
  const nearW = typeof params.nearW === "number" ? params.nearW : 0.05;

  /** @type {ProjectedProton[]} */
  const protons = [];
  /** @type {{ id: string, reason: string }[]} */
  const dropped = [];

  const sorted = field.protons.slice().sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const p of sorted) {
    if (!p || typeof p !== "object") {
      dropped.push({ id: "?", reason: "invalid_proton" });
      continue;
    }
    const center = p.center;
    if (!Array.isArray(center) || center.length < 3) {
      dropped.push({ id: String(p.id ?? "?"), reason: "missing_center" });
      continue;
    }
    if (
      !center.every((c) => Number.isFinite(Number(c))) ||
      !Number.isFinite(p.radius)
    ) {
      dropped.push({ id: String(p.id), reason: "non_finite" });
      continue;
    }

    const rel = sub4(center, origin);
    // Express in camera basis (right, up, forward)
    const local = [
      dot4(rel, basis[0]),
      dot4(rel, basis[1]),
      dot4(rel, basis[2]),
      rel[3],
    ];
    const point = { x: local[0], y: local[1], z: local[2], w: local[3] };
    const p3d = projector.project4Dto3D(point);
    const { sx, sy } = projector.project3Dto2D(p3d);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      dropped.push({ id: String(p.id), reason: "non_finite_screen" });
      continue;
    }

    const wFactor = projector.d4 / (projector.d4 + point.w);
    const z3 = p3d.z;
    const zFactor = z3 === 0 ? 1 : projector.d3 / (projector.d3 + z3);
    const sigmaWorld = (p.radius > 0 ? p.radius : 0.5) / 2;
    const sigma = Math.max(0.5, sigmaWorld * projector.scale * wFactor * zFactor);

    // Depth proxy: non-negative distance along forward after 4D→3D
    const depth = Math.max(0, Math.hypot(p3d.x, p3d.y, p3d.z));
    const clipped = Math.abs(point.w) < nearW * projector.d4;

    // Normal: from camera origin toward proton in 3D view space
    const nx = p3d.x;
    const ny = p3d.y;
    const nz = p3d.z;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    const normal3 = /** @type {[number, number, number]} */ ([
      nx / nlen,
      ny / nlen,
      nz / nlen,
    ]);

    protons.push({
      id: String(p.id),
      x: sx,
      y: sy,
      sigma,
      depth,
      color: p.color,
      density: p.density,
      normal3,
      clipped: clipped || undefined,
      metadata: { ...p.metadata },
    });
  }

  // No silent loss: accounted === input
  const accounted = protons.length + dropped.length;
  if (accounted !== sorted.length) {
    dropped.push({
      id: "__field__",
      reason: `accounting_mismatch accounted=${accounted} input=${sorted.length}`,
    });
  }

  return {
    protons,
    dropped,
    camera,
    status: "enforced",
  };
}
