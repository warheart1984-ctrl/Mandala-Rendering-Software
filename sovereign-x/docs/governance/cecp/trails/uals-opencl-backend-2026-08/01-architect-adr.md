# 01 — Architect ADR

**Trail:** `uals-opencl-backend-2026-08`
**Author:** Sovereign X crew (agent-assisted)
**Status:** Draft → Review → Promote (with gaps)
**Domain:** Sovereign X Router — UALS

## Intent

Land the first real Sovereign X module: UALS ABI v0 (`uals.h`) + one OpenCL
backend, per `sovereign-x/docs/governance/cecp/specs/uals-abi-v0.md`.

## Decision

- `uals/` is the compute abstraction SoT; ABI v0 is C99, dependency-free.
- OpenCL is the first backend because the demo box (AMD RX 580 / Polaris) exposes
  an OpenCL ICD with no CUDA/HIP path — sovereignty over convenience (R10).
- GPU modules remain **assist-only**; `cpu.rt4d.print` stays print-authoritative
  until parity gate G6 passes (bit-exact on the deterministic path).
- Determinism is a **gate, not a promise**: backend returns `UALS_ERR_DETERMINISM`
  at create-time if it cannot honor the seeded contract.
- Provenance is mandatory: `uals_kernel_meta` carries
  `(intent_id, world_id, timeline_id, time_seconds, rng_seed)`; missing fields
  ⇒ `UALS_ERR_PROVENANCE`.

## Rationale vs Rosetta analogy

Rosetta 2 translates instructions at runtime; UALS dispatches one kernel
contract across vendor backends. Same anti-lock-in philosophy (P5), different
layer. No translation is claimed — that keeps status tags honest.

## Acceptance

G1–G5 pass on the demo box ⇒ promote to `partial`; G6 parity ⇒ GPU may become
print-authoritative for the deterministic kernel; `uals.dll` builds via
`axiom-native/build_vs.bat`; gates run via `uals/tests/run_gates.exe`.