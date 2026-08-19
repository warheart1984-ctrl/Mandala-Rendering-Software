export const provenance = {intentId: "presets-procedural-v1", worldId: null, timelineId: null, timeSeconds: 0, parameters: {}};
export const presets = [
  {name: "Frosted glass microflake BRDF", category: "Procedural Materials", tags: ["procedural","brdf","glass"], params: {roughness:0.1, flakeScale:0.01, ior:1.33}, status:"skeleton"},
  {name: "Iridescent thin-film interference", category: "Procedural Materials", tags: ["procedural","thin-film"], params: {thickness:200, ior:1.5}, status:"skeleton"},
  {name: "Procedural snow with subsurface scattering", category: "Procedural Materials", tags: ["procedural","sss"], params: {albedo:[0.95,0.95,1], sssRadius:0.02}, status:"skeleton"},
  {name: "Lava crust + molten core blend", category: "Procedural Materials", tags: ["procedural","blend"], params: {crustRoughness:0.8, coreTemp:1200}, status:"skeleton"},
  {name: "Wet asphalt with micro-roughness", category: "Procedural Materials", tags: ["procedural","roughness"], params: {roughness:0.3, wetness:0.7}, status:"skeleton"},
  {name: "Rust growth simulation", category: "Procedural Materials", tags: ["procedural","decay"], params: {growthRate:0.5, rustColor:[0.6,0.2,0.1]}, status:"skeleton"},
  {name: "Procedural marble with veins", category: "Procedural Materials", tags: ["procedural","marble"], params: {veinFrequency:8, veinContrast:0.6}, status:"skeleton"},
  {name: "Sandstone erosion layers", category: "Procedural Materials", tags: ["procedural","erosion"], params: {layers:5, erosion:0.3}, status:"skeleton"},
  {name: "Ice with internal cracks", category: "Procedural Materials", tags: ["procedural","ice"], params: {crackDensity:0.2, ior:1.31}, status:"skeleton"},
  {name: "Volcanic basalt columns", category: "Procedural Materials", tags: ["procedural","basalt"], params: {columnHeight:2, roughness:0.9}, status:"skeleton"},
  {name: "Procedural wood rings + knots", category: "Procedural Materials", tags: ["procedural","wood"], params: {ringsPerMeter:12, knotDensity:0.05}, status:"skeleton"},
  {name: "Moss overgrowth mask", category: "Procedural Materials", tags: ["procedural","moss"], params: {maskScale:0.5, coverage:0.6}, status:"skeleton"},
  {name: "Crystalline quartz shader", category: "Procedural Materials", tags: ["procedural","crystal"], params: {anisotropy:0.8, ior:1.55}, status:"skeleton"},
  {name: "Procedural granite speckle", category: "Procedural Materials", tags: ["procedural","granite"], params: {speckleScale:0.02, speckleContrast:0.8}, status:"skeleton"},
  {name: "Metallic car paint flakes", category: "Procedural Materials", tags: ["procedural","paint"], params: {flakeDensity:0.4, flakeSize:0.001}, status:"skeleton"},
  {name: "Brushed aluminum anisotropic", category: "Procedural Materials", tags: ["procedural","anisotropic"], params: {aniso:0.9, roughness:0.2}, status:"skeleton"},
  {name: "Velvet BRDF", category: "Procedural Materials", tags: ["brdf","velvet"], params: {sheen:0.8}, status:"skeleton"},
  {name: "Satin sheen micro-normal", category: "Procedural Materials", tags: ["brdf","satin"], params: {sheenRoughness:0.15}, status:"skeleton"},
  {name: "Procedural clay", category: "Procedural Materials", tags: ["procedural","clay"], params: {roughness:0.6, albedo:[0.85,0.75,0.65]}, status:"skeleton"},
  {name: "Procedural concrete with pores", category: "Procedural Materials", tags: ["procedural","concrete"], params: {poreScale:0.01, roughness:0.7}, status:"skeleton"}
];
