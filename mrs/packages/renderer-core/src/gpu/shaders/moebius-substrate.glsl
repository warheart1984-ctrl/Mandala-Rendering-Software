// Möbius Flower Substrate — GLSL shader parity/twist functions
//
// Encodes:
//   - f(x,y) = (x + y) mod 2  → η(t) parity (edge orientation noise)
//   - ∇V = gradientField(x,y)  → twist gradient (torus curvature)
//   - Equilibrium: ⟨η(t)η(t)⟩ = ∇V = 0
//
// Usage: #include this file in any GLSL compute/render shader
// that needs Möbius substrate awareness.

// ── Parity Function ──────────────────────────────────────────────

// Möbius twist parity: f(x,y) = (x + y) mod 2.
// Returns 0.0 or 1.0 — the orientation parity of the hex cell.
// This is the discrete form of η(t).
float moebiusParity(int ix, int iy) {
    return float((ix + iy) & 1);
}

// Parity with time dependence (η(t)).
// When timeScale = 0.0, frozen (ground state).
// When timeScale > 0.0, parity oscillates.
float moebiusParityTime(int ix, int iy, float time, float timeScale) {
    float base = moebiusParity(ix, iy);
    // Sinusoidal modulation — balanced (no net drift)
    float modulation = sin(time * timeScale + float(ix * 3 + iy * 7) * 0.1);
    return base + modulation * 0.1 * timeScale;
}

// ── Twist Gradient ───────────────────────────────────────────────

// Discrete gradient of the parity field.
// Returns vec4 representing local torus curvature (∇V).
vec4 moebiusTwistGradient(int ix, int iy) {
    float p00 = moebiusParity(ix, iy);
    float p10 = moebiusParity(ix + 1, iy);
    float p01 = moebiusParity(ix, iy + 1);

    // Forward difference gradient
    float gx = p10 - p00;
    float gy = p01 - p00;

    // Curl into 4D (twist on ZW plane from XY gradient)
    float gz = (gx + gy) * 0.5;
    float gw = (gx - gy) * 0.5;

    return vec4(gx, gy, gz, gw);
}

// Twist gradient with time dependence (∇V(t)).
// When timeScale = 0.0, gradient is static (equilibrium).
vec4 moebiusTwistGradientTime(int ix, int iy, float time, float timeScale) {
    vec4 base = moebiusTwistGradient(ix, iy);
    // Rotate gradient over time (torus curvature evolution)
    float angle = time * timeScale * 0.5;
    float cosA = cos(angle);
    float sinA = sin(angle);

    // Rotate in XY plane
    float rx = base.x * cosA - base.y * sinA;
    float ry = base.x * sinA + base.y * cosA;

    // Rotate in ZW plane
    float rz = base.z * cosA - base.w * sinA;
    float rw = base.z * sinA + base.w * cosA;

    return vec4(rx, ry, rz, rw);
}

// ── Equilibrium Check ────────────────────────────────────────────

// Check if a hex cell is in equilibrium (parity consistent, gradient zero).
// Returns 1.0 if equilibrium, 0.0 otherwise.
float moebiusIsEquilibrium(int ix, int iy) {
    vec4 grad = moebiusTwistGradient(ix, iy);
    float lenSq = dot(grad, grad);
    return lenSq < 0.01 ? 1.0 : 0.0;
}

// ── Hex Grid Position ────────────────────────────────────────────

// Convert hex axial coordinates to torus surface position.
// Returns vec4 (x, y, z, w) on the torus.
vec4 hexToTorus4d(int q, int r, float R, float radiusScale) {
    float spacing = R * 0.6;
    float xFlat = spacing * (float(q) + float(r) * 0.5);
    float yFlat = spacing * (float(r) * 0.866025); // sqrt(3)/2

    // Torus angles
    float theta = xFlat / R;
    float phi = yFlat / R;

    // Torus surface
    float rr = R + radiusScale * cos(phi);
    float x = rr * cos(theta);
    float y = rr * sin(theta);
    float z = radiusScale * sin(phi);

    // w from parity
    float parity = moebiusParity(q, r);
    float w = parity > 0.5 ? 0.15 : -0.15;

    return vec4(x, y, z, w);
}

// ── Noise Coupling ───────────────────────────────────────────────

// Curl-noise force field coupled to twist gradient.
// This is the ∇V × η(t) interaction term.
vec4 moebiusCurlNoiseForce(vec4 pos, float time, float timeScale, float curlScale) {
    // Discrete coordinates from position
    int ix = int(floor(pos.x * 2.0));
    int iy = int(floor(pos.y * 2.0));

    vec4 grad = moebiusTwistGradientTime(ix, iy, time, timeScale);

    // Curl: cross product analog in 4D
    float noiseVal = sin(pos.x * 3.0 + time * timeScale) *
                     cos(pos.y * 3.0 + time * timeScale * 0.7) *
                     sin(pos.z * 3.0 + time * timeScale * 1.3);

    return grad * curlScale * noiseVal;
}

// ── Uniform Interface ────────────────────────────────────────────

// Uniform block for Möbius substrate parameters.
// Use in compute shaders as:
//   layout(std140, binding = N) uniform MoebiusUBO {
//       uint gridRadius;
//       float torusRadius;
//       float paritySeed;
//       float timeScale;
//   };
//
// Use in fragment shaders as:
//   layout(std140, binding = N) uniform MoebiusUBO {
//       uint gridRadius;
//       float torusRadius;
//       float paritySeed;
//       float timeScale;
//   };
