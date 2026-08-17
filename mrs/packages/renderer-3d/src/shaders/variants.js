// Shader variants stubs with constitutional provenance
export const provenance = {intentId: "shader-variants-v1", worldId: null, timelineId: null, timeSeconds: 0};

export const DisneyBRDF = {name:"Disney BRDF variant", params:{baseColor:[1,1,1], roughness:0.5, metallic:0}, status:"skeleton"};
export const GGXMultiLobe = {name:"Multi-lobe GGX", params:{lobes:3, roughness:0.3}, status:"skeleton"};
export const Clearcoat = {name:"Clearcoat layer with Fresnel", params:{clearcoat:0.5, clearcoatRoughness:0.1}, status:"skeleton"};
export const SSSDipole = {name:"Subsurface scattering dipole", params:{scatterRadius:0.02, absorption:0.1}, status:"skeleton"};
