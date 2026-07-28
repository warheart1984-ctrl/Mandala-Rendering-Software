# 01 — Architect ADR: GPU Determinism Promotion Plan

**Trail:** `gpu-determinism-2026-09`  
**Role:** Architect  
**Date:** 2026-07-28  
**Status:** **Draft** / **declared**  
**mode:** Sentinel  
**actorMode:** Anchor  
**softwareCreationMode:** Protocol

## Intent

Define a five-step promotion plan from **declared** seed contract (mulberry32 +
stratified) toward future GPU assist determinism receipts — without claiming
print SoT or live parity today.

## ADR decision

1. Seed contract lives in `seed-contract.md` as **declared**.
2. Steps 1–5 documented in `promotion-plan-steps-1-5.md` as **Draft**.
3. Prototype assist integrator may implement the seed API early
   (`deterministicGpuIntegrator.js`) but remains non-authoritative.
4. Full CECP stages 02–06 run when Step 1 kickoff is authorized — not fabricated
   as complete now (Drive-G-1).

## Anti-overclaim

- No enforced GPU determinism receipts yet.
- No CPU↔GPU print parity.
- No GPU Digital Printer path.

## Handoff

Implementors of Phase 2 vNext may ship seed prototype under assist-only tags.
Promotion beyond Draft requires new Inspector/ESFR evidence per Steps 1–5.
