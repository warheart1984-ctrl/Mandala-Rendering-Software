# 01 — Architect ADR: Sovereign X multi-vendor capability router

**Trail:** `sovereign-x-vendor-router-2026-07`  
**Role:** Architect (+ Boundary-Guardian / Anchor)  
**Date:** 2026-07-28  
**Status:** **declared** design (Drive-G-1)

## 1. Intent

Register installed NVIDIA + AMD vendor agent skills as **Sovereign X Router
capabilities** with honest lanes:

- **Upstream-only** for look-dev, SceneSpec assist, parity harness scaffolding,
  AI services
- **Forbidden for print** — never Digital Printer beauty / evidence SoT

Coordinate with (do not revert) sibling trail `vendor-skills-fixup-2026-07`.

## 2. ADR decision

### Context

User architecture (SoT for this task) lists NVIDIA and AMD capability IDs and
bans GPU print SoT until parity. Repo already has Sovereign X GPU constitution
helpers and Digital Printer sovereignty, but **no** machine-readable
vendor-skill capability registry or thin dispatch API.

### Decision

1. Create package `@mrs/sovereign-x-router` under `mrs/packages/sovereign-x-router/`.
2. Ship `data/vendor-capability-registry.json` mapping capability ID → skill
   names → `lane: upstream` → `printLane: forbidden_for_print` →
   `status: declared|partial`.
3. Ship thin `dispatchVendorCapability` that:
   - **ALLOW**s registered upstream IDs for non-print intents
   - **REJECT**s explicit print-SoT IDs (`gpu.print.*`, `gpu.rt4d.sot`, …)
   - **REJECT**s upstream IDs when `asPrintSoT` / `intentLane=print`
4. AMD rows set `hostCapabilityDriven: true` so the router may decide even
   without an in-repo AMD backend.
5. Docs link Digital Printer CONTRACT + vendor-skills install note.

### Consequences

- **Positive:** Governed registration surface; clear reject errors; tests.
- **Negative / honest gaps:** No vendor runtime invoke; groups A–D remain
  **declared** product capability (stubs only).
- **Non-consequence:** Digital Printer contract unchanged; no CUDA/HIP print path.

## 3. Interface specification

### Capability IDs (NVIDIA)

| ID | Skills (primary) | Status |
|----|------------------|--------|
| `gpu.inference.nvidia.tao` | tao-setup-nvidia-gpu-host, tao-run-inference-service | declared |
| `gpu.compute.nvidia.cuda` | tilegym-cutile-python | declared |
| `gpu.optimize.nvidia.dynamo` | dynamo-troubleshoot | partial |
| `gpu.sim.nvidia.tilegym` | tilegym-cutile-python | declared |
| `ai.gen.nvidia.flux` | nvidia-skill-finder / Genblaze in-repo | partial |
| `ai.gen.nvidia.cosmos` | nvidia-skill-finder | declared |
| `ai.vision.nvidia.llama` | rag-blueprint (assist only) | declared |

### Capability IDs (AMD)

| ID | Skills | Status | Note |
|----|--------|--------|------|
| `gpu.compute.amd.rocm` | rocm-setup, rocm-doctor | declared | host-capability driven |
| `gpu.compute.amd.hip` | hip-rocm, magpie-kernel-evaluator | declared | host-capability driven |
| `gpu.inference.amd.rocm` | rocm-setup, local-ai-use | declared | host-capability driven |

### Forbidden print-SoT IDs (always REJECT)

`gpu.print.beauty`, `gpu.print.deterministic_plates`, `gpu.rt4d.sot`,
`gpu.denoise.evidence`, `gpu.integrator.print`

### Dispatch contract

```text
dispatchVendorCapability(id, {
  intentId?, intentLane?: upstream|lookdev|scenespec|parity|ai|print,
  asPrintSoT?: boolean, hostCapable?: boolean
}) → { ok, code, capabilityId, message, ... }
```

Codes: `ALLOWED_UPSTREAM` | `FORBIDDEN_FOR_PRINT` | `PRINT_SOT_BANNED` |
`UNKNOWN_CAPABILITY` | `INVALID_REQUEST`

### Bans

- No GPU print / plates / RT4D SoT / denoise-evidence / integrator-print
- No stochastic/cloud/GPU PRNG drift into print SoT
- No modification of protected constitutional paths

## 4. Constitutional boundary analysis

| In scope | Out of scope |
|----------|--------------|
| Registry JSON + thin Node stubs + tests | Live CUDA/HIP/ROCm invoke |
| CECP trail 01–06 | Changing Digital Printer pipeline |
| Doc links to CONTRACT + skills note | Claiming print GPU enforced |
| Coordinate with vendor-skills-fixup | Reverting sibling trail files |

Protected paths: untouched.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/sovereign-x-router/**` | create | Builder → Implementor |
| `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/**` | create | Crew |
| `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md` | update (link) | Implementor |
| `mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md` | update (pointer) | Implementor |
| `package.json` | add `test:sovereign-x-router` | Implementor |

## 6. Acceptance criteria

- [ ] Registry contains all NVIDIA + AMD IDs from user architecture
- [ ] Each row: skillNames + upstream + forbidden_for_print + declared|partial
- [ ] Dispatch ALLOWs upstream IDs; REJECTs print-SoT IDs with clear errors
- [ ] Upstream + `asPrintSoT` REJECTs
- [ ] Unit tests pass via `npm test --prefix mrs/packages/sovereign-x-router`
- [ ] Trail 01–06 + README present
- [ ] No claim of GPU print enforced

## 7. Handoff to Builder

Scaffold `@mrs/sovereign-x-router` package layout, empty registry JSON shell,
dispatch/registry module stubs labeled **skeleton**, and test placeholder
files. Do not implement deep vendor I/O.
