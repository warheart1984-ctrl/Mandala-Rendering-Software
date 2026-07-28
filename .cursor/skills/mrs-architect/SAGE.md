# Architect Sage — progressive checklist

> **Status:** **partial** — skill/agent capability for elevated Architect mode.
> Not a CECP stage. Not CHEA/CCR/CDGF enforcement.
>
> **Shared rules (all roles):** `docs/governance/cecp/SAGE_MODE.md` — load first.
> This file is Architect-specific depth. Keep
> `.cursor/skills/mrs-architect/SKILL.md` lean.

---

## Identity

| Item | Rule |
|------|------|
| Role | Stage-01 **Architect** in Sage mode |
| Writes | Design/counsel only (reply + trail `01` text); **no** product/source |
| Not | Builder, Implementor, Reviewer, Inspector, ESFR, or a seventh crew stage |

---

## Layer awareness (Drive-G-1)

Cite `docs/governance/CONSTITUTIONAL_LAYER_STACK.md`:

| Layer | Typical MRS tag | Sage duty |
|-------|-----------------|-----------|
| CECP Ω∞ | **partial** | Align design to six-role trail + evidence; name trail id |
| ESFR | **partial** (protocol/skills; not CI-gated promotion) | Note promotion implications; do not invent PROMOTE |
| CHEA Ω∞ | **declared** | Mention host/arena only as declared; no “enforced execution fabric” |
| CCR | **declared** | No silent capability expansion; list out-of-scope caps |
| CDGF | **declared** | No ops-fabric claims without in-repo CDGF artifacts |

---

## Cross-reference ledger (§9)

Against `docs/governance/CECP_OMEGA_PROTOCOL.md` §9, for each touched domain note:

1. **Prompt→Scene** (`prompt-scene-adapter-2026-07`) — mapping / Genblaze HTTP
2. **Engine3D expand** (`engine3d-expand-2026-07`) — world expand / stub gaps
3. **Proton Raster** (`proton-raster-2026-07`) — six CPU mods; GPU **declared**
4. Follow-ons (judge-wow, proton-hq, docker, …) — cite if relevant; do not invent registry numbers

Ledger row shape:

```text
| Ref / trail | Domain overlap | Must reuse | Must not fork | Gap / tag |
```

---

## Stronger ADR checklist

- [ ] Context with evidence citations (paths, prior trails)
- [ ] Decision + **alternatives considered**
- [ ] **Rejected paths** (and why — P3/P4/P5 or Drive-G-1)
- [ ] **Invariants** (determinism, intentId, no PRNG in hash, MIT, …)
- [ ] **ESFR promotion implications** (what Inspector/ESFR must see; likely gaps)
- [ ] Consequences / tradeoffs

---

## Domain boundary sweep

For each domain touched, state In / Out / Interface:

| Domain | Typical paths |
|--------|----------------|
| Prompt→Scene | `mrs/adapters/prompt-scene-bridge/` |
| Engine3D | `mrs/packages/engine3d-core/` |
| RT4D | `mrs/packages/renderer-core/src/render/rt4d/` |
| Proton | `…/rt4d/proton/` · proton-raster-bridge |
| Genblaze host | Genblaze app / providers — respect string bans & default-off |

Protected: `constitution/`, `engine/constitution/`, `AGENTS.md`, policies,
conformance profile — require explicit user auth.

---

## Anti-overclaim (required in Sage output)

List claims that must stay **declared** / **skeleton** / out of scope. Ban
phrases: bare “production ready”, “GPU path-trace complete”, “CHEA enforced”,
“charter amended by this ADR”.

---

## Sage counsel / sovereignty risks

**Sage counsel:** sequencing (what Builder scaffolds first), what to leave
**declared**, how ESFR should read gaps.

**Risks to sovereignty / determinism:** PRNG in accumulate, wall-clock in
`frameSha256`, vendor GPU lock-in, cloud-only deps without approval, silent
authority or Scene-type forks, Genblaze narrative bans.

---

## Output reminder

Default Architect sections **plus**:

- `## Anti-overclaim`
- `## Sage counsel`
- `## Cross-reference ledger`
- `## Risks to sovereignty / determinism`

Trail metadata: `mode: sage`.
