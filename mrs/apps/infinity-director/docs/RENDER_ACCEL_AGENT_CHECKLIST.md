# Agent checklist — RenderAccelContract (Director)

**When:** Infinity Director changes touch `/api/direct`, ATCM, or CPU preview profiles.

| Role | Check |
|------|--------|
| **Architect** | Pipeline SoT: `docs/ACCELERATED_RENDERER.md`; contract: `RENDER_ACCEL_CONTRACT.md` + `schemas/`; math index: `MATH_DRIVEN_RENDER_ACCEL.md` |
| **Builder** | Facade `app/accelerated_renderer.py` — `request` / `execute`; explicit activation only |
| **Implementor** | `estimate_not_measured` on work model; `full_frame_dispatch`; no invented Genblaze flags |
| **Inspector** | Run `tests/test_render_accel_contract.py` + `tests/test_accelerated_renderer.py`; fast/beauty/auto must not emit accel artifacts |

**Vendor GPU assist:** reference-only; RenderAccelContract remains CPU-first Director planning.

See also: [ACCELERATED_RENDERER.md](./ACCELERATED_RENDERER.md) · [RENDER_ACCEL_CONTRACT.md](./RENDER_ACCEL_CONTRACT.md) · [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md) · CECP trail `docs/governance/cecp/trails/director-atcm-2026-07/` · crew foreman `.cursor/skills/mrs-crew/SKILL.md`
