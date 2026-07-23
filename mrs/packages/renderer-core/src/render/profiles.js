export const renderProfiles = Object.freeze({
  technical: {
    background: "#0e1216", renderMode: "wireframe", lineWidth: 1.1,
    scaleMode: "fit", padding: 0.12, vertexScale: 0.8, showVertices: true,
  },
  cinematic: {
    background: "#080b10", renderMode: "solid", lineWidth: 0.65,
    scaleMode: "fit", padding: 0.15, strokeEdges: true, fogDensity: 0.08,
    ambient: 0.3, diffuse: 0.9, showVertices: false, lightDirection: { x: -0.35, y: -0.55, z: 0.76 },
  },
  "solid-copper": {
    background: "#0b1016", renderMode: "solid", scaleMode: "fit", padding: 0.14,
    strokeEdges: true, depthColorA: [35, 55, 88], depthColorB: [224, 154, 96],
    ambient: 0.28, diffuse: 0.95, fogDensity: 0.05, showVertices: false,
  },
  lattice: {
    background: "#0e1216", renderMode: "both", lineWidth: 0.7,
    scaleMode: "fit", padding: 0.1, vertexScale: 0.65, fogDensity: 0.04, showVertices: true,
  },
});

export function getRenderProfile(name = "technical") {
  const profile = renderProfiles[name];
  if (!profile) throw new Error(`Unknown render profile: ${name}`);
  return { ...profile, lightDirection: profile.lightDirection && { ...profile.lightDirection } };
}

export function resolveRenderOptions(profile, overrides = {}) {
  return { ...getRenderProfile(profile), ...overrides };
}
