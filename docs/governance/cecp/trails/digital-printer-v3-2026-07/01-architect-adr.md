# 01 — Architect ADR: Digital Printer v3 (kickoff)

**Trail:** `digital-printer-v3-2026-07`  
**Stage:** Architect (CECP 01) — design-only kickoff  
**Parent:** `digital-printer-v2-2026-07` (PROMOTE_WITH_GAPS)  
**Status:** **declared** — BEGIN not ship  
**softwareCreationMode:** Visionary + Pipeline-Conductor (anti-overclaim required)

---

## Intent

Begin Digital Printer v3 surface families beyond the v2 beauty plate:

1. **Cinematic surfaces** — look-dev knobs beyond print profiles (DOFs declared, not film)  
2. **Volumetric surfaces** — fog/volume BSDF already skeleton in MaterialSystem; print contract TBD  
3. **Emissive surfaces** — light materials + emissive mesh plates on print path  
4. **Motion surfaces** — AnimationTimeline / frame sampling already partial; print-sequence plates  
5. **Multi-agent print orchestration** — CECP crew / MCP capability orchestration (**declared**)

## Scope

### In (this kickoff)

- ADR + Builder stub placeholders  
- Honest status tags  
- Handoff order for a future Implementor pass  

### Out (this kickoff)

- Full implementation / PROMOTE claims  
- GPU denoise / commercial RIP  
- Changing v2 enforcement  

## Contracts (declared)

| Surface family | Intake sketch | Tag |
|----------------|---------------|-----|
| cinematic | PrintRequest `surfaceFamilies: ["cinematic"]` + look JSON | declared |
| volumetric | SceneSpec material `brdf: volume` / fog params | declared / skeleton |
| emissive | material `emission` + light primitives | partial→declared for print plates |
| motion | `frame` / `time` + sequence out-dir | partial (CLI exists) |
| multi-agent | MCP capabilities + job queue envelope | skeleton |

## File manifest (future)

| Path | Action | Owner |
|------|--------|-------|
| `docs/governance/cecp/trails/digital-printer-v3-2026-07/*` | trail | crew |
| `printer/print_request.py` surfaceFamilies | extend | Implementor (later) |
| `render-scene.mjs` / volume path | extend | Implementor (later) |
| Genblaze `/printer` orchestration stubs | extend | Implementor (later) |

## Acceptance (for later ship — not this kickoff)

- [ ] Each family has named fixture + determinism test before **enforced**  
- [ ] No claim of film/VFX product parity  
- [ ] Multi-agent orchestration remains **declared** until job ledger exists  

## Anti-overclaim

v3 is **BEGIN**. Nothing in this trail is **enforced** yet. Do not cite v3 for promotion.

## Handoff

1. Builder → stub dirs / empty test placeholders (optional this pass)  
2. Implementor → one family at a time (recommend emissive → motion → volume → cinematic → orchestration)  
3. Reviewer → Boundary-Guardian  
4. Inspector → Testwright  
5. ESFR → only after evidence  

## Sage counsel (light)

Ship emissive print plates first (smallest delta from v2 GGX/lights). Volumetrics need Render-Physicist Implementor. Multi-agent last.
