# CH-GNMD-v1.0 — Genblaze / NIM Media Domain Charter

| Field | Value |
| --- | --- |
| Document ID | CH-GNMD-v1.0 |
| Status (Drive-G-1) | **declared** |
| Runtime enforcement | **None in this service** — FastAPI + Genblaze manifest only |
| Audience | Operators / constitutional record |

JCR/CEL/Sovereign IDE bindings are declared; this service does not host those runtimes.

## Purpose

Charter for the Genblaze Media domain: provenanced concept stills and video produced through NVIDIA NIM (via Genblaze) and stored on Backblaze B2 with SHA-256 manifests. This is an **operator media path**, not a claim that Genblaze or NIM renders 4D scenes.

## Evidence mapping (declared)

| Constitutional token | Maps to (when present) |
| --- | --- |
| CER (content evidence) | `run_id` + `asset_sha256` + `asset_key` on generate responses / index rows |
| CPR (process / lineage) | Genblaze `manifest` object key (`manifest_key`) + run lineage in the stored JSON |

These mappings are **documentary**. The FastAPI app records fields; it does not evaluate JCR/CEL rules or issue Arena certificates.

## Authority chain (declared only)

Authority chain, Arena certification, and Sovereign IDE bindings are **declared** in sibling docs (`ACP-NIM-Cosmos-v1.0.md`, module `CMM-NIM-Cosmos-v1.0.md`). They are **not** runtime-enforced by `mrs/apps/genblaze-media`.

## Protected paths

This domain charter must not be used as a pretext to edit repository constitutional artifacts under:

- `constitution/`
- `engine/constitution/`
- `AGENTS.md`

Changes to those paths require explicit human authorization outside this media app.
