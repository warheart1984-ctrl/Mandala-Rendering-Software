# MRS Constitutional Rendering Contract — MRS-CRC v1.0

**Status:** **declared** — normative intent for CIEMS / Sovereign X rendering sovereignty.  
Not a runtime gate until CKL policies + conformance probes exist.  
Related: [`CONSTITUTIONAL_CONTRACTS.md`](./CONSTITUTIONAL_CONTRACTS.md), [`MATHEMATICAL_FOUNDATIONS.md`](./MATHEMATICAL_FOUNDATIONS.md), [`BVH4D_GPU.md`](./BVH4D_GPU.md), [`UNITY_LIVE_LINK.md`](./UNITY_LIVE_LINK.md).

---

## Article I — Dimensional Domain

All rendering and coupling subjects **SHALL** be defined on \(\mathbb{R}^{4}\) (and time \(\mathbb{R}\) when dynamic), with topology \(K\) separated from embedding \(f\colon K\to\mathbb{R}^{4}\) where meshes apply.

## Article II — BVH

Acceleration structures for 4D ray/volume queries **SHALL** use explicit 4D AABBs and a documented traversal (CPU and/or GPU). Node layout **SHALL** expose min/max bounds and leaf primitive ranges. GPU paths **SHALL** document AoS/SoA choices.

*Evidence today:* CPU `BVH4D` **partial**; GPU packed/CUDA sketches **skeleton**.

## Article III — Memory

Live and GPU buffers **SHALL** document layout (AoS nodes, SoA rays recommended). No silent reinterpretation of dimensional components.

## Article IV — Live-Link

Subsystem coupling **SHALL** use declared morphisms \(L_{ij}\) (LEL-C) with explicit \(\Pi_{3\mathrm{D}}\) (or other \(\Pi\)) when projecting into 3D hosts. Divergence without intent/evidence **SHALL** be forbidden once LEL-C is enforced.

*Evidence today:* WebSocket live-link + Unity client **skeleton** / Experimental.

## Article V — Shader Graph

Graphs claiming constitutional shading **SHALL** be DAGs of pure nodes over 4D inputs (SG-C). Hidden globals in node eval are non-compliant.

*Evidence today:* `shader-graph/` **skeleton**.

## Article VI — Protocol

MRS↔host messages **SHALL** use a versioned schema (JSON and/or binary MRS1 framing). Exports and streams **SHALL** carry frame index and, when available, seed for replay correlation.

## Article VII — Deterministic Replay

Evolution **SHALL** target \(S_{n+1}=T(S_n,u_n)\) with fixed \(\Delta t\) and deterministic RNG under DR-C. Replay evidence **SHALL** include temporal lineage when claimed.

*Evidence today:* browser param/timeline + ProvenanceRecorder/CSSV **partial**; bit-identical multi-host **declared**.

---

## Enactment

Promote articles **declared → partial → enforced** only with schemas, CKL policies, and host probes. Until then, MRS-CRC is specification prose.
