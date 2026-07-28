/**
 * CECP Mod 6 — ProtonField→Lighting4D
 *
 * STATUS: **enforced**
 *
 * Deterministic 4D inverse-square-ish falloff → LitProtonField
 * (same protons with lit color). No PRNG.
 */

import { createHash } from "node:crypto";

/**
 * @typedef {object} Light4D
 * @property {[number, number, number, number]} position
 * @property {number} [intensity]
 * @property {number} [falloff]  k in 1/(1+k·r²)
 * @property {[number, number, number]} [color]
 */

/**
 * @param {[number, number, number, number]} a
 * @param {[number, number, number, number]} b
 */
function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const d = (Number(a[i]) || 0) - (Number(b[i]) || 0);
    s += d * d;
  }
  return s;
}

/**
 * @param {import("./sceneToProtonField.js").ProtonField} field
 * @param {Light4D[]|Light4D} lights
 * @returns {import("./sceneToProtonField.js").ProtonField}
 */
export function applyLighting4D(field, lights = []) {
  if (!field || !Array.isArray(field.protons)) {
    throw new Error("applyLighting4D: ProtonField required");
  }
  const list = Array.isArray(lights) ? lights : lights ? [lights] : [];
  const defaultLight =
    list.length === 0
      ? [{ position: [2, 3, -4, 1], intensity: 1.2, falloff: 0.15, color: [1, 1, 1] }]
      : list;

  const litProtons = field.protons.map((p) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const L of defaultLight) {
      if (!L || !Array.isArray(L.position)) continue;
      const k = typeof L.falloff === "number" ? L.falloff : 0.15;
      const I = typeof L.intensity === "number" ? L.intensity : 1;
      const lc = Array.isArray(L.color) ? L.color : [1, 1, 1];
      const atten = I / (1 + k * dist2(p.center, /** @type {[number,number,number,number]} */ (L.position)));
      r += (p.color[0] || 0) * (Number(lc[0]) || 0) * atten;
      g += (p.color[1] || 0) * (Number(lc[1]) || 0) * atten;
      b += (p.color[2] || 0) * (Number(lc[2]) || 0) * atten;
    }
    // Soft Reinhard-ish keep in [0,1] without introducing seed
    const tone = (c) => c / (1 + c);
    return {
      ...p,
      color: /** @type {[number, number, number]} */ ([
        tone(r),
        tone(g),
        tone(b),
      ]),
      metadata: {
        ...p.metadata,
        lit: true,
      },
    };
  });

  litProtons.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fieldHash = createHash("sha256")
    .update(JSON.stringify(litProtons))
    .digest("hex");

  return {
    ...field,
    protons: litProtons,
    fieldHash,
    status: "enforced",
  };
}
