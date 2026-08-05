# CDU Reference Architecture (CDU-RA)

**Version:** 0.1  
**Status:** **skeleton** / **declared** — engineering blueprint documentation only  
**Not:** a runtime enforcement gate, CIEMS product claim, JCR runtime claim, or MRS constitutional SoT

## What this is

**CDU-RA** (Constitutional Discipline Universe — Reference Architecture) is an **implementation-agnostic engineering blueprint** for the Constitutional Discipline Universe. It declares layered contracts, Mirror subsystem roles, and runtime-governance *requirements* so products can align without sharing a single tech stack.

## Spec index

| Document | Role |
|----------|------|
| [CDU-RA-v0.1.md](CDU-RA-v0.1.md) | Full v0.1 skeleton specification |

## Honesty (Drive-G-1)

| Claim level | Meaning here |
|-------------|--------------|
| **skeleton** | Structure and section headings exist; contracts are outlined, not proven |
| **declared** | Requirements and roles are stated as design intent |
| **Not claimed** | Runtime enforcement, cross-product conformance, or shipping completeness |

Do not treat presence of this folder as evidence that any host engine enforces CDU-RA.

## Relationship to sibling systems

| System | Relationship to CDU-RA |
|--------|------------------------|
| **CIEMS** | Related institutional / learning product surface; may *align with* CDU-RA — does not *implement* CDU-RA by this doc alone |
| **JCR** | Related continuity / journal substrate where present; cross-link as related, not as CDU-RA runtime |
| **MRS / 4DCE / 4DRS** | Related rendering and constitutional engine lineage; MRS `AGENTS.md` and charter remain binding for MRS agents — CDU-RA does **not** supersede them |
| **CCALF** | Related learning/competency framework (`docs/ccalf/`); CCALF stewards curriculum — CDU-RA stewards Discipline Universe architecture |
| **CRE** | Related Constitutional Reality Engine scaffold where present; may align with CDU-RA layers without claiming enforcement |

CDU-RA is the **broader Discipline Universe blueprint**. Product repos remain authoritative for their own runtime gates and protected constitutional artifacts.

## Non-goals (v0.1)

- No edits to host `constitution/`, `AGENTS.md`, renderer-core, or protected schemas via this adoption
- No mandated language, cloud, or engine
- No claim that Mirror, CIP, or memory subsystems are implemented in this repository because this doc exists

## CECP trail

Optional trail notes: [`docs/governance/cecp/trails/cdu-ra-v0.1-2026-08/`](../governance/cecp/trails/cdu-ra-v0.1-2026-08/)
