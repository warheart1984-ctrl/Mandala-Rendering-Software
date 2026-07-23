# Unreal Material Functions — W visualization (**declared**)

> **Drive-G-1:** No `.uasset` material functions ship in-repo. Graph pin contracts are **declared**.  
> Compute W-encoding is a separate **declared/roadmap** doc — not present capability.

**Status:** **declared** · Content placeholders: `unreal/FourDAdapter/Content/Materials/README.md`

---

## 1. Purpose

Shared material functions encode W-band visualization on **projected** meshes. Parameters are set by `UFourDMaterialMapper` / `UFourDVisualizationComponent` after PLP import or live refresh. They do **not** sample 4D volumes or replace PLP.

---

## 2. Function graph specs (**declared**)

### 2.1 `MF_WDepthGradient`

| Pin | Dir | Type | Notes |
| --- | --- | --- | --- |
| `WDepth` | in | Scalar | Author convention: absolute or normalized W |
| `WGradientTex` | in | Texture2D | 1D LUT along U |
| `Color` | out | Vector3 | Sampled gradient |

**Graph:** `saturate(WDepth)` → `float2(U, 0.5)` → `TextureSample(WGradientTex)` → `Color`.

### 2.2 `MF_WGhostOpacity`

| Pin | Dir | Type | Notes |
| --- | --- | --- | --- |
| `GhostOpacity` | in | Scalar | Base from viz state |
| `BandDistance` | in | Scalar | Distance from active W slice |
| `Falloff` | in | Scalar | Soft knee / exponent |
| `Opacity` | out | Scalar | Final opacity multiplier |

**Graph:** `Opacity = GhostOpacity * pow(saturate(1 - BandDistance), Falloff)` (declared formula).

### 2.3 `MF_WHeatmap`

| Pin | Dir | Type | Notes |
| --- | --- | --- | --- |
| `WDepth` | in | Scalar | |
| `MinW` / `MaxW` | in | Scalar | Remap range |
| `HeatColor` | out | Vector3 | Cool→hot |

**Graph:** remap W into `[0,1]` → lerp cool/mid/hot stops. Used when `WDepthMode == 1`.

### 2.4 `MF_WContourBands`

| Pin | Dir | Type | Notes |
| --- | --- | --- | --- |
| `WDepth` | in | Scalar | |
| `BandWidth` | in | Scalar | Contour spacing |
| `LineColor` | in | Vector3 | |
| `BaseColor` | in | Vector3 | |
| `OutColor` | out | Vector3 | |

**Graph:** `frac(WDepth / BandWidth)` near 0/1 → blend `LineColor` into `BaseColor`. Used when `WDepthMode == 2`.

---

## 3. Parent materials (**declared**)

| Material | Uses |
| --- | --- |
| `M_FourDBase` | MF_WDepthGradient + GhostOpacity |
| `M_FourDGhost` | MF_WGhostOpacity emphasis |
| `M_FourDDepth` | MF_WHeatmap / MF_WContourBands by mode |

---

## 4. Roadmap shading (**roadmap**)

| Idea | Status |
| --- | --- |
| W-fog | **roadmap** |
| W-rimlight | **roadmap** |
| W-parallax | **roadmap** |
| W-pulse | **roadmap** |
| Material Layers stacking of MF_* | **roadmap** |
| GPU / compute W-encoding (`CS_WEncoding`) | **declared** / **roadmap** — [UNREAL_W_ENCODING_COMPUTE.md](./UNREAL_W_ENCODING_COMPUTE.md) |
| Nanite material path | **roadmap** — no evidence |

## Cross-links

- [UNREAL_ADAPTER_V1.md](./UNREAL_ADAPTER_V1.md)
- Content list: [`unreal/FourDAdapter/Content/Materials/README.md`](../../../unreal/FourDAdapter/Content/Materials/README.md)
