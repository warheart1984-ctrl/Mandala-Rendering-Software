import { Lambertian4D } from "./bsdf4d.js";
import { GGX4D } from "./ggx4d.js";
import { vec4 } from "../math/vec4.js";

function colorVec4(rgb, alpha = 1) {
  return vec4(rgb[0] ?? 1, rgb[1] ?? 1, rgb[2] ?? 1, alpha);
}

function mulColor(a, b) {
  return vec4(a.x * (b[0] ?? 1), a.y * (b[1] ?? 1), a.z * (b[2] ?? 1), a.w);
}

function scalarFromSample(sample, fallback) {
  if (!sample) return fallback;
  return Math.min(1, Math.max(0, sample[0] ?? fallback));
}

export function resolveTexturedMaterial(material, hit, textureRegistry) {
  if (!material || !textureRegistry || !hit?.uv) return material;
  const refs = material.params?.textureRefs;
  if (!Array.isArray(refs) || refs.length === 0) return material;

  let albedo = material.params?.albedo ?? material.bsdf?.albedo ?? vec4(0.8, 0.8, 0.8, 1);
  let roughness = material.params?.roughness ?? 0.7;
  let emission = material.emission ?? vec4(0, 0, 0, 0);
  let normalScale = null;

  for (const ref of refs) {
    const sample = textureRegistry.sample(ref.id, hit.uv);
    if (!sample) continue;
    if (ref.role === "color") albedo = mulColor(albedo, sample);
    if (ref.role === "roughness") roughness = scalarFromSample(sample, roughness);
    if (ref.role === "metallic") {
      // Current CPU fallback keeps the BSDF family fixed; preserve value for evidence/debug.
      material = { ...material, params: { ...material.params, sampledMetallic: scalarFromSample(sample, material.params?.metallic ?? 0) } };
    }
    if (ref.role === "emissive") emission = colorVec4(sample, emission.w ?? 1);
    if (ref.role === "normal") normalScale = sample;
  }

  let bsdf = material.bsdf;
  if (material.type === "ggx") {
    bsdf = new GGX4D(albedo, roughness, material.params?.f0);
  } else if (material.bsdf) {
    bsdf = new Lambertian4D(albedo);
  }

  return {
    ...material,
    bsdf,
    emission,
    params: {
      ...material.params,
      albedo,
      roughness,
      ...(normalScale ? { sampledNormal: normalScale } : {}),
    },
  };
}
