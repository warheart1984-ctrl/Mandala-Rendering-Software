# 01 — Architect ADR

**Trail:** `vendor-gpu-integration-2026-07`  
**Author:** Jon Halstead  
**Status:** Draft → Review → Promote (with gaps)  
**Domain:** Sovereign X Router

## Intent

Land canonical `sovereign-x/` layout, GPU skills registry, assist modules, CECP specs A–E, promotion packet, CIEMS diagram, parity skeleton, capability CLI.

## Decision

`sovereign-x/` is SoT; `@mrs/sovereign-x-router` re-exports. Only `cpu.rt4d.print` is authoritative for print. GPU = assistOnly.

## Acceptance

Registry resolve, determinism→cpu.rt4d.print, GPU assistOnly, contract validate, ESFR PROMOTE_WITH_GAPS.
