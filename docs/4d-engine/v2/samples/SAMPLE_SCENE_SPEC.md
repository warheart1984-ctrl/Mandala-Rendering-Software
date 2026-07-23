# FourDRenderer v2.0 — Sample Scene Specification  
## Canonical 4D Worlds for Bring-up, Demo, Validation

| Field | Value |
| --- | --- |
| Status | **Declared** (scene contracts). Assets / golden renders **not claimed** |

## 1. Purpose

Define a small set of versioned, reproducible scenes for engine bring-up, demos, regression, and performance characterization.

## 2. Scene S1 — 4D Hyper-Room

| Field | Value |
| --- | --- |
| Id | `S1_HYPER_ROOM_V1` |
| Description | 4D “room” with walls/floor/ceiling extended along \(W\) |

**Contents:** 4D box volume with embedded 3D surfaces; one emissive, one glossy, one diffuse wall; a 4D light moving along \(W\).

**Goals:** Basic BVH traversal; simple SO(4) shading; W-dependent lighting via Observation Modes.

## 3. Scene S2 — 4D Object Gallery

| Field | Value |
| --- | --- |
| Id | `S2_OBJECT_GALLERY_V1` |

**Contents:** Multiple `Primitive4D` / embedded surfaces; Lambert4D, GGX4D, hybrid materials; static and animated \(W\) transforms.

**Goals:** Material / BSDF variety; compare 4D vs 3D under modes; visual demo of declared SO(4) invariance.

## 4. Scene S3 — 4D Corridor with Branching

| Field | Value |
| --- | --- |
| Id | `S3_BRANCHING_CORRIDOR_V1` |

**Contents:** Main corridor in \((x,y,z)\), branches in \(W\); different GI setups per branch; moving camera with changing Observation Modes.

**Goals:** Path routing (`FULL_4D` vs `HYBRID`); visibility / W-slice; 4D↔host lighting blend demos.

## 5. Scene S4 — Performance Stress

| Field | Value |
| --- | --- |
| Id | `S4_STRESS_V1` |

**Contents:** High-density primitives/instances; multiple W-dependent lights.

**Goals:** Benchmark BVH + path tracing; exercise performance model (design targets).

## 6. Relation to existing validation

Hyper-Caustic Lens remains the RT4D / 4DRS **official** validation scene (**enforced** factory). S1–S4 are **additional declared** FourDRenderer v2 scenes — not replacements for HCL.

## 7. Evidence

| Claim | Status |
| --- | --- |
| S1–S4 specs | **declared** |
| S1–S4 asset packs / golden CI | **not claimed** |
| HCL baseline | **partial / enforced factory** (4DRS) |
