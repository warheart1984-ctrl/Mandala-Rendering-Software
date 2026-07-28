# 01 — Architect ADR

**Trail:** `vendor-skills-fixup-2026-07`  
**Role:** Architect (+ Pipeline-Conductor + Anchor)  
**Status:** **declared** design for this trail; implementation follows Builder/Implementor  

## 1. Intent

Apply installed NVIDIA/AMD vendor skills to **fix what they can legitimately fix** in Mandala Rendering Software on PR #83: Genblaze NIM reliability signals, GPU host check-only tooling, honest ROCm/HIP absence scaffolding, and WebGPU/vendor honesty maps — without claiming CUDA/HIP print SoT or using NIM as Digital Printer beauty.

## 2. ADR decision

**Context:** Skills are installed under `~/.agents/skills/` and amd-skills plugin; prior trail `printer-gpu-quality-speed-2026-07` already noted them. Genblaze already has empty-504 / warmup / NVCF poll; gaps remain in operator surfacing (help when key present but warmup=504), host check scripts, and ROCm detect scaffolding.

**Decision:**  
1. Extend Genblaze `/health` with ordered `nim_ops_checklist` + `resolve_nvidia_help` (dynamo layering + tao readiness honesty).  
2. Add check-only `scripts/check-nvidia-gpu-host.mjs` (tao-setup adapt).  
3. Add `scripts/detect-gpu-backend.py` (rocm-setup adapt) with HIP/CUDA print **absent** tags.  
4. Extend `probeVendorGpuHonesty()` for Drive-G-1 maps; document cuTile **N/A**.  
5. Document env knobs in `.env.example`.  
6. Skip RAG Blueprint deploy, Dynamo cluster, TAO microservice start, cuTile kernels, HIPIFY ports.

**Consequences:** Operators get actionable health + host probes; product claims stay partial/absent where evidence requires.

## 3. Interface specification

| Surface | Inputs | Outputs |
|---------|--------|---------|
| `GET /health` | existing | + `nim_ops_checklist`, smarter `nvidia_help`, `nvidia_nim_status.next_step` |
| `node scripts/check-nvidia-gpu-host.mjs [--json]` | host PATH | report; exit 0/1 |
| `python scripts/detect-gpu-backend.py [--json]` | host PATH | report; exit 0/1/2 |
| `probeVendorGpuHonesty()` | runtime | statusTag map |

**Bans:** no secrets; no protected constitutional path edits; no NIM→beauty SoT; no fake `enforced` CUDA/HIP.

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| Genblaze NIM ops honesty | RAG Blueprint deploy |
| Check-only GPU host scripts | Driver/CUDA/ROCm install without auth |
| Print parity honesty map | Live WebGPU Node execute |
| Trail under `docs/governance/cecp/trails/` | `constitution/`, `AGENTS.md`, `default.policies.json` |

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/apps/genblaze-media/app/nvidia_errors.py` | modify | Implementor |
| `mrs/apps/genblaze-media/app/main.py` | modify | Implementor |
| `mrs/apps/genblaze-media/tests/test_api.py` | modify | Implementor |
| `mrs/packages/renderer-core/src/render/rt4d/compare/printParity.js` | modify | Implementor |
| `mrs/packages/renderer-core/scripts/test/cpu-gpu-comparison.test.js` | modify | Implementor |
| `scripts/check-nvidia-gpu-host.mjs` | create | Builder→Implementor |
| `scripts/detect-gpu-backend.py` | create | Builder→Implementor |
| `.env.example` | modify | Implementor |
| `package.json` | modify | Implementor |
| `docs/governance/cecp/trails/vendor-skills-fixup-2026-07/*` | create | Crew |
| `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md` | update | Implementor |

## 6. Acceptance criteria

- [ ] `/health` exposes `nim_ops_checklist` with ordered layers
- [ ] When warmup liveness=unavailable and key present, `nvidia_help` is non-null
- [ ] Unit tests cover help + checklist
- [ ] GPU host / detect scripts run check-only and refuse to claim print SoT
- [ ] `probeVendorGpuHonesty` marks cuda/hip absent, cutile na
- [ ] Trail 01–06 present; ESFR cites fresh tests
- [ ] No protected path edits

## 7. Handoff to Builder

Scaffold scripts + trail stubs; leave logic to Implementor.
