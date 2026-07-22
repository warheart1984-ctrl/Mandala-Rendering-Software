# Core mathematical substrate

Goal: treat physics, live links, shaders, assets, and replay as operations on structures in \(\mathbb{R}^{4}\times\mathbb{R}\).

| Document | Contents | Status |
| --- | --- | --- |
| [MATHEMATICAL_FOUNDATIONS.md](./MATHEMATICAL_FOUNDATIONS.md) | PDE / particle / XPBD, \(L_{ij}\), shader DAGs, \(\Pi\) export, \(T\) | **declared** (+ skeleton/partial rows) |
| [CONSTITUTIONAL_CONTRACTS.md](./CONSTITUTIONAL_CONTRACTS.md) | 4D-PCC, LEL-C, SG-C, AE-C, DR-C, MRS-IC index | **declared** (DR-C partial where replay/CSSV exists) |
| [MRS-CRC-v1.0.md](./MRS-CRC-v1.0.md) | Constitutional Rendering Contract Articles I–VII | **declared** |
| [BVH4D_GPU.md](./BVH4D_GPU.md) | 4D AABB slabs, AoS/SoA, CUDA/WGSL sketches | **skeleton** |
| [UNITY_LIVE_LINK.md](./UNITY_LIVE_LINK.md) | Unity client + \(\Pi_{3\mathrm{D}}\) | **skeleton** / Experimental |
| [MRS_BINARY_PROTOCOL.md](./MRS_BINARY_PROTOCOL.md) | Little-endian MRS1 framing | **declared** |
| [DETERMINISTIC_REPLAY.md](./DETERMINISTIC_REPLAY.md) | Replay hooks + validator outline | **declared** / **partial** evidence |
| [INSPECTOR_MATH.md](./INSPECTOR_MATH.md) | Pick fields: normal, curvature, Jacobian, … | **declared** |
| [MRS-IC-v1.1.md](./MRS-IC-v1.1.md) | Redirect → contracts MRS-IC v1.1 | **declared** |
| [../contracts/MRS-IC-v1.1.md](../contracts/MRS-IC-v1.1.md) | Inspector Contract v1.1 (canonical) | **declared** |
| [../contracts/MRS-IC-v1.2.md](../contracts/MRS-IC-v1.2.md) | Lineage + invariants 3.1–3.7 | **declared** |
| [../inspector/README.md](../inspector/README.md) | Inspector doc index | index |
| [INSPECTOR_PROTOCOL.md](./INSPECTOR_PROTOCOL.md) | JSON inspect_screen / inspect_result | **declared** |
| [INSPECTOR_EVIDENCE_BUNDLE.md](./INSPECTOR_EVIDENCE_BUNDLE.md) | Replay evidence bundle | **declared** |
| [INSPECTOR_INTEGRATION.md](./INSPECTOR_INTEGRATION.md) | Developer + Unity integration | **skeleton** |
| [shader-debugging.md](./shader-debugging.md) | Shader debug extension | **declared / future** (v1.4) |
| [performance/inspector-gpu-budget.md](./performance/inspector-gpu-budget.md) | GPU/CPU cost model | **declared budget** (not measured) |

Capability snapshot in the root README remains evidence-bound; these docs do **not** auto-promote statuses.
