# Cognitive switches — sample run (Profiles + Modes)

> Status: **declared** pattern log for this trail (COGNITIVE_ECOLOGY §8).
> Precedence observed: bans > Constitution > Evidence > Profile > Mode.
> Wave 4 Software-Creation Modes from `SOFTWARE_CREATION_MODES.md`.

| Stage | Role | Profile | Mode (wave) | Evidence cite for switch |
|-------|------|---------|-------------|--------------------------|
| 01 | Architect | Systems Architect | **Pipeline-Conductor** (SC) | ADR needs CLI/Docker path order — `01-architect-adr.md` |
| 01b | Architect | Guardian | **Boundary-Guardian** (SC) | Ownership freeze SF↔MRS — `BOUNDARY.md` |
| 02 | Builder | Integrator *(Profile)* | **Blueprint** (SC) | Scaffold manifest file map — `02-builder-scaffold-manifest.md` |
| 03 | Implementor | Scientist | **Constructor** (SC) | Assemble execute+CLI+smoke — `03-implementor-notes.md` |
| 03b | Implementor | Scientist | **Render-Physicist** (SC) | scene-spec → render-scene path — `execute.py` |
| 03c | Implementor | Accelerator | **Forge** (SC) | Dockerfile COPY + ENV — `Dockerfile` |
| 04 | Reviewer | Constitutional | **Boundary-Guardian** (SC) | No SF absorb; Genblaze ban — `04-reviewer-conformance.md` |
| 05 | Inspector | Scientist | **Testwright** (SC) | 20 pytest + smoke PNG — `05-inspector-acceptance.md` |
| 06 | ESFR | Guardian + Steward | **Conformance** (SC) | Honest PASS_WITH_GAPS — `06-engineer-standards.md` |

### Mode vs Profile collisions used honestly

- **Integrator Profile** on Builder (ideas→system) — not Integrator-mode
- **Optimizer** not used as Mode here; measured knobs left to Render-Physicist
- **Strategist** not invoked (Wave 3 Actor) — Pipeline-Conductor covers path order

### Invoke examples from this run

```text
Pipeline-Conductor Architect + Systems Architect
Boundary-Guardian Reviewer + Constitutional
Constructor Implementor + Scientist
Testwright Inspector + Scientist
Forge Implementor
ESFR + Guardian + Conformance
```
