import { vec4, normalize, sub, length, scale } from "../math/vec4.js";

function v4From3(value, fallback = [0, 0, 0], w = 0) {
  if (value && typeof value === "object" && !Array.isArray(value)) return vec4(value.x ?? fallback[0], value.y ?? fallback[1], value.z ?? fallback[2], value.w ?? w);
  const a = Array.isArray(value) ? value : fallback;
  return vec4(a[0] ?? fallback[0], a[1] ?? fallback[1], a[2] ?? fallback[2], w);
}

function colorToEmission(color = [1, 1, 1], intensity = 1) {
  return vec4((color[0] ?? 1) * intensity, (color[1] ?? 1) * intensity, (color[2] ?? 1) * intensity, intensity);
}

export function normalizeRt4dLight(light) {
  return {
    id: String(light.id ?? `${light.type ?? "light"}-${Math.random()}`),
    type: light.type ?? "point",
    color: light.color ?? [1, 1, 1],
    intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
    position: v4From3(light.position, [0, 0, 0], 0),
    direction: normalize(v4From3(light.direction, [0, -1, 0], 0)),
    range: Number.isFinite(light.range) ? light.range : Infinity,
    coneAngle: Number.isFinite(light.coneAngle) ? light.coneAngle : 45,
    radius: Math.max(0, Number.isFinite(light.radius) ? light.radius : 0),
    width: Math.max(0, Number.isFinite(light.width) ? light.width : 0),
    height: Math.max(0, Number.isFinite(light.height) ? light.height : 0),
    softness: Math.max(0, Number.isFinite(light.softness) ? light.softness : 0),
    shadowBias: Math.max(0, Number.isFinite(light.shadowBias) ? light.shadowBias : 0.001),
  };
}

export function sampleRt4dLight(light, hit) {
  const L = normalizeRt4dLight(light);
  if (L.type === "environment") return null;
  if (L.type === "directional") {
    const wo = normalize(scale(L.direction, -1));
    return { wo, dist: 1e9, pdf: 1, emission: colorToEmission(L.color, L.intensity), light: L };
  }
  const toL = sub(L.position, hit.position);
  const dist = length(toL);
  if (!(dist > 1e-6) || dist > L.range) return null;
  const wo = scale(toL, 1 / dist);
  if (L.type === "spot") {
    const spotCos = -(
      wo.x * L.direction.x +
      wo.y * L.direction.y +
      wo.z * L.direction.z +
      wo.w * L.direction.w
    );
    const minCos = Math.cos((L.coneAngle * Math.PI) / 180);
    if (spotCos < minCos) return null;
  }
  const area = L.type === "area" ? Math.max(1e-6, (L.width || L.radius || 1) * (L.height || L.radius || 1)) : 1;
  const attenuation = L.type === "point" || L.type === "spot" ? 1 / Math.max(1, dist * dist) : 1 / area;
  return { wo, dist, pdf: 1, emission: colorToEmission(L.color, L.intensity * attenuation), light: L };
}

export function environmentToEmission(environment) {
  if (!environment) return vec4(0, 0, 0, 0);
  const color = environment.color ?? [0, 0, 0];
  const intensity = Number.isFinite(environment.intensity) ? environment.intensity : 1;
  return colorToEmission(color, intensity);
}
