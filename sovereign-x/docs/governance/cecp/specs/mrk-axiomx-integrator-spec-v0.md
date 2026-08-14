# MRK Axiom X Integrator — Specification v0

Status: **enforced** (promoted AXIOM-X-002, 2026-08-13; byte-exact GPU/C/JS)
Kernel id: `sx.kernel.axiom.x.integrator`
Ledger: AXIOM-X-002 (promoted)
SoT: this spec. Substrates: OpenCL kernel (GPU) · C reference (gate) · JS mirror (`cpu.rt4d.print/integrator`).

## 1. Scope

Single-bounce 4D diffuse path integrator with next-event estimation against one
hypersphere (S³) light, ported from the canonical `PathTracer4D` NEE math
(`mrs/.../rt4d/integrator/PathTracer4D.js`, `_sampleLight` + audited BSDF):

- BRDF (Lambertian4D): `f = 3ρ/(4π)` (normalization audit; PDF `3cosθ/(4π)`)
- S³ light surface area: `A = 2π²R³` (S3_AREA = 2π² in canonical math)
- Area → solid-angle Jacobian in 4D: `dA → dω` uses `r³` (not r²)
- NEE estimator: `L_e · f · cosθ / pdf_ω` with `pdf_ω = (1/A)·d³/cos_light`
- No recursion (depth 1), no BSDF-direction sampling, no MIS (single strategy)

## 2. Determinism contract

Byte-exact across all substrates. All arithmetic is **integer fixed-point
Q16.16** (`Q = 65536`) in 64-bit words: no floats, no transcendentals, no
reductions, no atomics. Randomness: canonical mulberry32 (identical to
`sx.kernel.axiom.x.sample`). Every operation is exactly specified; C / OpenCL
/ JS-BigInt produce identical bits.

### 2.1 Canonical constants

| Symbol | Value (decimal) | Rationale |
|---|---|---|
| `Q` | 65536 | 2¹⁶ |
| `PI_Q` | 205887 | floor(π·Q) |
| `PI2_Q` | 647911 | floor(π²·Q) |
| `PLANE_Z` | -262144 | surface plane z = -4.0, normal (0,0,1,0) |
| `LIGHT_R` | 98304 | light radius R = 1.5 |
| `ALBEDO_Q` | 45875 | surface albedo ρ = 0.7 |
| `EMISSION_Q` | 2097152 | light emission L_e = 32.0 (scene parameter; visible radiance ≈ 0.47 at albedo 0.7) |
| `MIX_X` | 0x9E3779B9 | per-pixel seed mix (canonical) |
| `MIX_Y` | 0x85EBCA77 | per-pixel seed mix (canonical) |
| `M32_ADD` | 0x6D2B79F5 | mulberry32 add (canonical) |

### 2.2 Mulberry32 (canonical, matches AXIOM-X-001 sampler)

```
s += 0x6D2B79F5u; t = s;
t = (t ^ (t>>15)) * (t|1u);
t ^= t + (t ^ (t>>7)) * (t|61u);
s = t ^ (t>>14);          // stream state REPLACED by the draw
return s;
```
Per-pixel stream: `s = seed ^ (gx·MIX_X) ^ (gy·MIX_Y)`; the stream state after
each draw is the draw value itself (identical semantics to the promoted
`sx.kernel.axiom.x.sample`).

### 2.3 Integer sqrt (canonical)

```
isqrt(n): if n == 0 return 0
  x = 1<<31; for i in 0..31: x = (x + n/x) >> 1
  while ((x+1)² ≤ n) x++
  while (x² > n) x--
  return x            // floor(sqrt(n)), exact
```
Unsigned 64-bit; identical truncation semantics in all substrates.

### 2.4 Uniform S³ point (Marsaglia rejection, Q16.16)

```
attempt loop (max 64):
  for k in 0..3: v_k = 2·(m32 & 0xFFFF) - Q      // ∈ [-Q, Q-1]
  r2 = Σ v_k²  >> 16                              // Q16.16, |v|²
  accept iff r2 > 0 and r2 ≤ Q                    // inside unit 4-ball
  n_k = (v_k << 16) / isqrt(r2 << 16)             // Q16.16 unit vector
fallback (after 64 attempts, deterministic): n = (1,0,0,0)
```
Uniform on S³ (radial density cancels under projection); rejection rate
≈ V(B⁴)/V(C⁴) ≈ 0.31.

### 2.5 Ray setup

```
cx = gx - (W-1)/2 ; cy = gy - (H-1)/2
d = (2·cx·Q/W, 2·cy·Q/H, -Q)
len2 = Σ d_k² >> 16 ; len = isqrt(len2 << 16)
nd_k = (d_k << 16) / len                        // unit Q16.16
```

### 2.6 Surface hit (plane z = PLANE_Z)

```
t   = (PLANE_Z << 16) / nd_z
p_k = (t · nd_k) >> 16
cosTheta = nd_z... no — surface normal +z: cosTheta = wo_z at hit
```

### 2.7 NEE sample

```
n = s3_uniform(...)                             // Q16.16 on S³
lp_k = (LIGHT_R · n_k) >> 16                    // light center (0,0,0,0)
toL_k = lp_k - p_k
dist2 = Σ toL_k² >> 16 ; dist = isqrt(dist2 << 16)
wo_k  = (toL_k << 16) / dist
cosLight = max(0, -(Σ(wo_k·n_k) >> 16))   // = -dotN when dotN < 0, else 0
skip sample iff dist == 0 or cosLight ≤ 0       // canonical _sampleLight null path
cosTheta = wo_z ; skip iff cosTheta ≤ 0
```

### 2.8 Estimator (per sample, per channel)

```
R3     = (LIGHT_R³) >> 32                       // Q16.16
A      = (2 · PI2_Q · R3) >> 16                 // Q16.16 (2π²R³)
pdfArea= 2³² / A                                // Q16.16
d3     = (dist³) >> 32                          // Q16.16
pdf    = ((pdfArea · d3) >> 16) << 16 / cosLight  // Q16.16
f      = (3 · ALBEDO_Q · Q) / (4 · PI_Q)        // Q16.16
c      = ((EMISSION_Q · f) >> 16) · cosTheta >> 16 << 16 / pdf
accum += c
```

### 2.9 Output (RGBA8, linear tonemap)

```
radiance = accum / (spp · Q)
byte     = clamp(floor(radiance · 255), 0, 255); alpha = 255
```
Fixed-point form: `b = (acc · 255) / (spp · 65536)`. Linear tonemap (no gamma):
a radiance of 1.0 maps to 255. Documented divergence from float print (which
clamps float radiance directly).

## 3. Provenance + authority

Same contract as AXIOM-X-001: `uals_kernel_meta` requires non-zero
intentId/worldId/timelineId (else `UALS_ERR_PROVENANCE`); registry entry is
`deterministic: true`, authority **assist-only** until promoted.

## 4. Parity criteria (promotion gate)

1. OpenCL output bit-exact vs C reference (gate G8) — configs: 64×64 spp=4,
   128×128 spp=8, 37×53 spp=16 (odd dims)
2. JS mirror bit-exact vs GPU dump (check_integrator) — same configs, sha256
3. Determinism: repeated runs byte-identical; seed divergence observed
4. Temporal replay stability: 5 loops, timeSeconds 1..5 byte-identical
5. RLE (ledger) published with hashes

## 5. Documented divergences from canonical float math

- S³ sampling: Marsaglia rejection (canonical Gaussian trick uses log/cos/sin —
  not correctly rounded across platforms). Same distribution, deterministic.
- Fixed-point constants replace float π/π²/ρ.
- Light center fixed at origin; single plane surface; albedo fixed 0.7.
- The canonical `PathTracer4D` remains the print SoT for arbitrary scenes; this
  kernel is the deterministic fixed-scene MRK substrate (assist-only).