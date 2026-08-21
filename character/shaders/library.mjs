/**
 * Material + lighting library for wire / beauty stages.
 *
 * STATUS:
 *   wire/energy, lambert skin, leather, metal, fabric: enforced (analytic)
 *   fur (anisotropic layered): partial
 *   production maps / HDRI: declared
 */
export const LIGHT_RIG = Object.freeze({
  key: { dir: normalize([-0.45, 0.75, 0.48]), color: [1.0, 0.95, 0.88], intensity: 1.15 },
  fill: { dir: normalize([0.55, 0.25, 0.25]), color: [0.45, 0.55, 0.75], intensity: 0.35 },
  rim: { dir: normalize([0.15, 0.2, -0.97]), color: [0.7, 0.85, 1.0], intensity: 0.55 },
});

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export const MATERIALS = Object.freeze({
  wire: {
    id: "wire",
    kind: "wire",
    albedo: [0.05, 0.08, 0.12],
    emissive: [0.15, 0.85, 1.0],
    roughness: 1,
  },
  energy: {
    id: "energy",
    kind: "energy",
    albedo: [0.02, 0.05, 0.08],
    emissive: [0.35, 0.95, 1.0],
    roughness: 1,
  },
  skin: {
    id: "skin",
    kind: "skin",
    albedo: [0.72, 0.52, 0.40],
    roughness: 0.55,
    wrap: 0.35,
  },
  fur: {
    id: "fur",
    kind: "fur",
    albedo: [0.55, 0.32, 0.16],
    roughness: 0.4,
    anisotropic: 0.7,
    status: "partial",
  },
  leather: {
    id: "leather",
    kind: "leather",
    albedo: [0.22, 0.12, 0.08],
    roughness: 0.62,
  },
  metal: {
    id: "metal",
    kind: "metal",
    albedo: [0.72, 0.74, 0.78],
    roughness: 0.22,
    metallic: 1,
  },
  fabric: {
    id: "fabric",
    kind: "fabric",
    albedo: [0.18, 0.22, 0.28],
    roughness: 0.75,
    sheen: 0.25,
  },
});

export function shade(normal, view, material, lights = LIGHT_RIG) {
  const n = normalize(normal);
  const v = normalize(view);
  let r = 0, g = 0, b = 0;
  const wrap = material.wrap || 0;
  const metallic = material.metallic || 0;
  const anisotropic = material.anisotropic || 0;

  for (const L of Object.values(lights)) {
    const ndl = n[0] * L.dir[0] + n[1] * L.dir[1] + n[2] * L.dir[2];
    const diff = Math.max(0, (ndl + wrap) / (1 + wrap));
    const h = normalize([L.dir[0] + v[0], L.dir[1] + v[1], L.dir[2] + v[2]]);
    const ndh = Math.max(0, n[0] * h[0] + n[1] * h[1] + n[2] * h[2]);
    const spec = Math.pow(ndh, metallic > 0.5 ? 64 : 16) * (1 - material.roughness);
    const aniso = anisotropic > 0
      ? Math.pow(Math.abs(n[0] * L.dir[0] + n[2] * L.dir[2]), 4) * anisotropic * 0.4
      : 0;
    const i = L.intensity;
    r += (material.albedo[0] * diff + spec * (0.3 + metallic * 0.7) + aniso) * L.color[0] * i;
    g += (material.albedo[1] * diff + spec * (0.3 + metallic * 0.7) + aniso) * L.color[1] * i;
    b += (material.albedo[2] * diff + spec * (0.3 + metallic * 0.7) + aniso) * L.color[2] * i;
  }
  const e = material.emissive || [0, 0, 0];
  return [
    Math.min(1, r + e[0]),
    Math.min(1, g + e[1]),
    Math.min(1, b + e[2]),
  ];
}

export function materialForRegion(region, species, stage) {
  if (stage === "wire") return MATERIALS.wire;
  if (region === "head" || region === "neck") return MATERIALS.skin;
  if (region === "tail" && species === "anthro") return MATERIALS.fur;
  if (region.startsWith("finger") || region.startsWith("thumb") || region.startsWith("hand")) {
    return species === "anthro" ? MATERIALS.fur : MATERIALS.skin;
  }
  if (region.startsWith("arm") || region.startsWith("leg") || region === "torso") {
    return species === "anthro" ? MATERIALS.fur : MATERIALS.fabric;
  }
  if (region.startsWith("foot")) return MATERIALS.leather;
  return MATERIALS.skin;
}
