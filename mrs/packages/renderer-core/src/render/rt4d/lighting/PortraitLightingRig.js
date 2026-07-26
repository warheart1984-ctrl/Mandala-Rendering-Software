export const DEFAULT_PORTRAIT_LIGHTING_RIG = Object.freeze({
  keyLight: { dir: [-0.45, -0.65, -0.6], intensity: 4.0, color: [1, 0.94, 0.86] },
  fillLight: { dir: [0.7, -0.25, -0.5], intensity: 0.9, color: [0.75, 0.85, 1] },
  rimLight: { dir: [0.55, -0.1, 0.75], intensity: 2.2, color: [0.8, 0.9, 1] },
  envLight: { intensity: 0.12, color: [1, 1, 1] },
});

function normalizeVec3(value, fallback) {
  const v = Array.isArray(value) ? value : fallback;
  return [Number(v[0] ?? fallback[0]), Number(v[1] ?? fallback[1]), Number(v[2] ?? fallback[2])];
}

function normalizeLight(light, fallback) {
  return {
    dir: normalizeVec3(light?.dir, fallback.dir),
    intensity: Number.isFinite(light?.intensity) ? light.intensity : fallback.intensity,
    color: normalizeVec3(light?.color, fallback.color),
  };
}

export function normalizePortraitLightingRig(rig = {}) {
  return {
    keyLight: normalizeLight(rig.keyLight, DEFAULT_PORTRAIT_LIGHTING_RIG.keyLight),
    fillLight: normalizeLight(rig.fillLight, DEFAULT_PORTRAIT_LIGHTING_RIG.fillLight),
    rimLight: normalizeLight(rig.rimLight, DEFAULT_PORTRAIT_LIGHTING_RIG.rimLight),
    envLight: {
      intensity: Number.isFinite(rig.envLight?.intensity) ? rig.envLight.intensity : DEFAULT_PORTRAIT_LIGHTING_RIG.envLight.intensity,
      color: normalizeVec3(rig.envLight?.color, DEFAULT_PORTRAIT_LIGHTING_RIG.envLight.color),
    },
  };
}

export function createPortraitLightingRig(preset = "studio", overrides = {}) {
  const base = normalizePortraitLightingRig();
  if (preset === "void") base.envLight.intensity = 0.02;
  if (preset === "mandala") {
    base.keyLight.color = [0.75, 0.9, 1];
    base.rimLight.color = [1, 0.6, 0.95];
    base.envLight.intensity = 0.25;
  }
  return normalizePortraitLightingRig({ ...base, ...overrides });
}
