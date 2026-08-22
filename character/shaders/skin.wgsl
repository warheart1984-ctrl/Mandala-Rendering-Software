// skin.wgsl — declared/partial skin BSDF contract for Mandala character pipeline.
// CPU beauty raster does NOT execute this. Status: partial (Lambert + wrap stand-in).
// Holography: rho / w_sum / K modulate tint + shininess (partial) — buffers not wired in RT4D yet.

struct SkinMaterial {
  base_color: vec3<f32>,
  roughness: f32,
  sss_radius: vec3<f32>,
  sss_scale: f32,
};

/// Per-vertex holography fields from character/holography skin EGT (partial).
struct SkinHolo {
  rho: f32,    // activation / info density
  w_sum: f32,  // epsilon = Σ w_ij
  K: f32,      // curvature proxy from mandala/holography
};

fn skin_holo_tint(base: vec3<f32>, holo: SkinHolo) -> vec3<f32> {
  // Higher rho → warmer; higher |K| → slightly tighter / cooler specular bias
  let warm = vec3<f32>(0.15, 0.04, 0.02) * clamp(holo.rho, 0.0, 1.0);
  return clamp(base + warm, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn skin_brdf(n: vec3<f32>, l: vec3<f32>, v: vec3<f32>, m: SkinMaterial) -> vec3<f32> {
  let ndotl = max(dot(n, l), 0.0);
  let wrap = max(dot(n, l) * 0.5 + 0.5, 0.0);
  let diffuse = m.base_color * (0.65 * ndotl + 0.35 * wrap);
  let h = normalize(l + v);
  let spec = pow(max(dot(n, h), 0.0), mix(16.0, 4.0, m.roughness));
  return diffuse + vec3<f32>(spec * 0.08);
}

fn skin_brdf_holo(
  n: vec3<f32>,
  l: vec3<f32>,
  v: vec3<f32>,
  m: SkinMaterial,
  holo: SkinHolo,
) -> vec3<f32> {
  var mh = m;
  mh.base_color = skin_holo_tint(m.base_color, holo);
  // Higher |K| → lower roughness (shinier / tighter hint)
  mh.roughness = clamp(m.roughness * (1.0 - 0.25 * clamp(abs(holo.K), 0.0, 1.0)), 0.05, 1.0);
  // w_sum may thicken SSS stand-in (declared binding)
  mh.sss_scale = m.sss_scale * (1.0 + 0.15 * clamp(holo.w_sum * 0.25, 0.0, 1.0));
  let base = skin_brdf(n, l, v, mh);
  let bulge_hint = holo.rho * 0.04; // CPU deform owns displacement; shader may bias N
  return base + vec3<f32>(bulge_hint * 0.02, bulge_hint * 0.01, 0.0);
}
