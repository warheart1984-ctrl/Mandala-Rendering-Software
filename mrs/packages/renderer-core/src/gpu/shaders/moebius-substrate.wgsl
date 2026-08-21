// Möbius Flower Substrate — WGSL shader parity/twist functions
//
// Encodes:
//   - f(x,y) = (x + y) mod 2  → η(t) parity (edge orientation noise)
//   - twist = normalize(gradientField(x,y))  → orientation / torus curvature
//   - Hex-loop consistency (CPU tests) is the vacuum check — not |gradientField|=0
//     (checkerboard forward-difference is never zero).
//
// Contract SoT: mandala/substrate/MAPPING.md (status: partial).
// This file is shader source. It is not dispatched by the RT4D CPU path.
//
// Usage: #include this file in any WGSL compute/render shader
// that needs Möbius substrate awareness.

struct MoebiusParams {
  grid_radius: u32,
  torus_radius: f32,
  parity_seed: f32,
  time_scale: f32,
};

// ── Parity Function ──────────────────────────────────────────────

/// Möbius twist parity: f(x,y) = (x + y) mod 2.
/// Returns 0.0 or 1.0 — the orientation parity of the hex cell.
/// This is the discrete form of η(t).
fn moebius_parity(ix: i32, iy: i32) -> f32 {
  return f32((ix + iy) & 1);
}

/// Parity with time dependence (η(t)).
/// When time_scale = 0.0, frozen (ground state).
/// When time_scale > 0.0, parity oscillates.
fn moebius_parity_time(ix: i32, iy: i32, time: f32, time_scale: f32) -> f32 {
  let base = moebius_parity(ix, iy);
  // Sinusoidal modulation of parity — balanced (no net drift)
  let modulation = sin(time * time_scale + f32(ix * 3 + iy * 7) * 0.1);
  return base + modulation * 0.1 * time_scale;
}

// ── Twist Gradient ───────────────────────────────────────────────

/// Discrete gradient of the parity field.
/// Returns a vec4f representing local torus curvature (∇V).
fn moebius_twist_gradient(ix: i32, iy: i32) -> vec4<f32> {
  let p00 = moebius_parity(ix, iy);
  let p10 = moebius_parity(ix + 1, iy);
  let p01 = moebius_parity(ix, iy + 1);

  // Forward difference gradient
  let gx = p10 - p00;
  let gy = p01 - p00;

  // Curl into 4D (twist on ZW plane from XY gradient)
  let gz = (gx + gy) * 0.5;
  let gw = (gx - gy) * 0.5;

  return vec4<f32>(gx, gy, gz, gw);
}

/// Twist gradient with time dependence (∇V(t)).
/// When time_scale = 0.0, gradient is static (equilibrium).
fn moebius_twist_gradient_time(
  ix: i32,
  iy: i32,
  time: f32,
  time_scale: f32
) -> vec4<f32> {
  let base = moebius_twist_gradient(ix, iy);
  // Rotate gradient over time (torus curvature evolution)
  let angle = time * time_scale * 0.5;
  let cos_a = cos(angle);
  let sin_a = sin(angle);

  // Rotate in XY plane
  let rx = base.x * cos_a - base.y * sin_a;
  let ry = base.x * sin_a + base.y * cos_a;

  // Rotate in ZW plane
  let rz = base.z * cos_a - base.w * sin_a;
  let rw = base.z * sin_a + base.w * cos_a;

  return vec4<f32>(rx, ry, rz, rw);
}

// ── Equilibrium Check ────────────────────────────────────────────

/// Check if a hex cell is in equilibrium (parity consistent, gradient zero).
/// Returns 1.0 if equilibrium, 0.0 otherwise.
fn moebius_is_equilibrium(ix: i32, iy: i32) -> f32 {
  let grad = moebius_twist_gradient(ix, iy);
  let len_sq = dot(grad, grad);
  // Threshold: near-zero gradient = equilibrium
  return select(0.0, 1.0, len_sq < 0.01);
}

// ── Hex Grid Position ────────────────────────────────────────────

/// Convert hex axial coordinates to torus surface position.
/// Returns vec4f (x, y, z, w) on the torus.
fn hex_to_torus4d(
  q: i32,
  r: i32,
  R: f32,
  radius_scale: f32
) -> vec4<f32> {
  let spacing = R * 0.6;
  let x_flat = spacing * (f32(q) + f32(r) * 0.5);
  let y_flat = spacing * (f32(r) * 0.866025); // sqrt(3)/2

  // Torus angles
  let theta = x_flat / R;
  let phi = y_flat / R;

  // Torus surface
  let rr = R + radius_scale * cos(phi);
  let x = rr * cos(theta);
  let y = rr * sin(theta);
  let z = radius_scale * sin(phi);

  // w from parity
  let parity = moebius_parity(q, r);
  let w = select(-0.15, 0.15, parity > 0.5);

  return vec4<f32>(x, y, z, w);
}

// ── Noise Coupling ───────────────────────────────────────────────

/// Curl-noise force field coupled to twist gradient.
/// This is the ∇V × η(t) interaction term.
fn moebius_curl_noise_force(
  pos: vec4<f32>,
  time: f32,
  time_scale: f32,
  curl_scale: f32
) -> vec4<f32> {
  // Discrete coordinates from position
  let ix = i32(floor(pos.x * 2.0));
  let iy = i32(floor(pos.y * 2.0));

  let grad = moebius_twist_gradient_time(ix, iy, time, time_scale);

  // Curl: cross product analog in 4D
  // ∂F/∂x × ∂F/∂y → rotation around gradient
  let noise_val = sin(pos.x * 3.0 + time * time_scale) *
                  cos(pos.y * 3.0 + time * time_scale * 0.7) *
                  sin(pos.z * 3.0 + time * time_scale * 1.3);

  return grad * curl_scale * noise_val;
}
