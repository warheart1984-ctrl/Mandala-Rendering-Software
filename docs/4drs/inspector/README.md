# MRS 4D Inspector — documentation index

**Status tags (Drive-G-1):** **declared** | **skeleton** | **roadmap / future**. Nothing here alone is a runtime gate.

## Contracts (canonical)

| Document | Role | Status |
| --- | --- | --- |
| [MRS-IC-v1.1](../contracts/MRS-IC-v1.1.md) | Diagrams A–C, Articles I–IV | **declared** |
| [MRS-IC-v1.2](../contracts/MRS-IC-v1.2.md) | Lineage, invariants 3.1–3.7, evolution | **declared** |

Substrate mirrors / redirects: [`../substrate/MRS-IC-v1.1.md`](../substrate/MRS-IC-v1.1.md).

## Substrate guides

| Document | Role | Status |
| --- | --- | --- |
| [INSPECTOR_MATH.md](../substrate/INSPECTOR_MATH.md) | Field definitions | **declared** |
| [INSPECTOR_PROTOCOL.md](../substrate/INSPECTOR_PROTOCOL.md) | JSON wire messages | **declared** |
| [INSPECTOR_EVIDENCE_BUNDLE.md](../substrate/INSPECTOR_EVIDENCE_BUNDLE.md) | Evidence bundle + replay rule | **declared** |
| [INSPECTOR_INTEGRATION.md](../substrate/INSPECTOR_INTEGRATION.md) | Developer integration (primary) | **skeleton** |
| [inspector-integration.md](../substrate/inspector-integration.md) | Redirect → integration primary | stub redirect |
| [evidence-bundle.md](../substrate/evidence-bundle.md) | Redirect → evidence primary | stub redirect |
| [shader-debugging.md](../substrate/shader-debugging.md) | Shader debug extension | **declared / future** (v1.4) |
| [inspector-gpu-budget.md](../substrate/performance/inspector-gpu-budget.md) | GPU / CPU cost model | **declared budget** (not measured SLA) |

## Unity UI (mockups / theme)

| Document | Role | Status |
| --- | --- | --- |
| [WIREFRAME_FULL.md](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/WIREFRAME_FULL.md) | Full window layout | mockup |
| [WIREFRAME_COMPACT.md](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/WIREFRAME_COMPACT.md) | Compact mode | mockup |
| [theme.md](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/UI/theme.md) | Semantic color rules | **declared** |
| [ShaderDebug/README.md](../../../unity/GovernedUnityProject/Assets/Engine/Inspector/ShaderDebug/README.md) | Shader debug UI stub | **declared / future** |

## Implementation evidence

| Artifact | Path | Status |
| --- | --- | --- |
| JS SoT API | `mrs/packages/renderer-core/src/inspector/` (`@mrs/renderer-core`) | **skeleton** |
| Inspector WS (local) | `npm run inspector:ws` → `scripts/inspector-ws-server.mjs` | **skeleton** (test mesh) |
| Smoke test | `scripts/test-inspector4d.mjs` (`npm run test:inspector4d`) | **skeleton** (+ WS round-trip) |
| Unity window / client | `unity/.../Assets/Engine/Inspector/` | **skeleton** (protocol wired; stub offline) |

## Charter

[`constitution/CHARTER.md`](../../../constitution/CHARTER.md) § VII.c lists MRS-IC v1.1 / Inspector API / Unity window with evidence-bound statuses.
