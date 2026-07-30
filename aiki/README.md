# AIKI — Adaptive Intuitive Knowledge Infrastructure

## AIKI Mission

> Transform evidence into understanding, understanding into capability, capability into sound judgment, and sound judgment into positive real-world impact through an open, continuously improving educational infrastructure.

Everything else—CKOs, replay, reproducibility, pipelines, YouTube, courses, tutors—exists to support that mission.

**Feature evaluation gate** — every feature must answer:

1. Does it improve understanding?
2. Does it preserve evidence and reproducibility?
3. Will it still make sense ten years from now?

If any answer is **no**, rethink the implementation.

Full lock: [docs/charter/MISSION_LOCK.md](docs/charter/MISSION_LOCK.md)

---

**Status:** **skeleton** (Drive-G-1)  
**Version:** v0.1 (educational CKO scaffold) · v1.0 constitutional creative runtime = **roadmap**  
**Constitution:** [AIKI Constitution v0.1](docs/charter/CONSTITUTION.md) (**declared**)  
**Binding near-term guidance:** [ACIPS / ACIRA / AIRS / Studio](docs/architecture/ACIPS_ACIRA_AIRS_BINDING.md) (**declared**) · [Formation Record](docs/formation/AIKI_FORMATION_RECORD.md) (**declared**) · [v1.0 milestone](docs/vision/AIKI_V1.0_MILESTONE.md) (**roadmap**)  
**Scorecard:** [docs/scorecards/aiki.md](docs/scorecards/aiki.md)  
**Reproducibility anchor:** [RBC-0001 Reproducibility Charter](docs/charter/REPRODUCIBILITY_CHARTER.md) (Constitution Article III)  
**GitHub SoT:** [Issues / Discussions / PRs](docs/GITHUB_SOURCE_OF_TRUTH.md) · Milestone `v0.1 – CKO-0001 MVP`  
**Canonical E2E example:** [examples/CKO-0001/](examples/CKO-0001/) (CKO scaffold — **not** the v1.0 nine-slot demonstrator)

AIKI is a YouTube-first knowledge infrastructure: Canonical Knowledge Objects (CKOs) are the source of truth; pipelines turn them into scripts, narration plans, visuals, and publishable metadata. The Intuitive Mathematics Engine (IME) lives at [`math/`](math/) and supplies math-specific reasoning patterns for the Math Intuition series.

**Vendor neutrality:** assistive model calls go through the [Inference Provider Interface (IPI)](docs/architecture/INFERENCE_PROVIDER_INTERFACE.md) (`config/inference.yaml` + `pipeline/inference/`). **AAIS is an optional provider, not a core dependency** — swapping OpenAI/Anthropic/Ollama/vLLM/etc. must not change AIKI engines. IPI is **declared/skeleton** (no live API calls).

**Runtime positioning (declared, frozen deeper merge):** [Governed State Spaces / Reference Model A (E₈)](docs/reference-models/e8/README.md) — E₈ is optional math under constitutional neutrality, not an AIKI pipeline dependency.

## Layer model (binding vocabulary)

| Layer | Role | Tag |
|-------|------|-----|
| **ACIPS** | Constitutional IP Standard (normative) | **declared** |
| **ACIRA** | Reference Architecture | **declared** |
| **AIRS** | Runtime Specification | **declared** / **roadmap** |
| **AIKI Studio** | Reference implementation (this tree) | **skeleton** |

Details: [docs/architecture/ACIPS_ACIRA_AIRS_BINDING.md](docs/architecture/ACIPS_ACIRA_AIRS_BINDING.md). Sibling constitutional patterns (not a merge): Sovereign X CCS at `G:\Sovereign-X-Constitutional-Compute`. Prefer LineageStudio `ls-*` over Mandala `mrs-crew` for AIKI agent work.

## Folder map

| Path | Role |
|------|------|
| `docs/` | Mission lock, Constitution, Formation, ACIPS/ACIRA/AIRS binding, pedagogy, series, RBC, scorecard |
| `config/` | Branding, voice, YouTube, pipeline version, **inference (IPI)** |
| `knowledge/` | CKO SoT, taxonomies, topic stubs |
| `content/` | Derived scripts and assets |
| `examples/` | Canonical E2E regression references (CKO-0001) |
| `pipeline/` | CLI + replay + reproducibility validators |
| `infra/` | Tooling / CI / env stubs |
| `archive/` | Immutable publish provenance (post-freeze) |
| `math/` | IME layered architecture + pattern templates |

## Invariant (RBC-0001)

Every improvement must be validated by:

> Can CKO-0001 still be reproduced from the repository?

Until the first YouTube publish freezes provenance, the reproducibility test reports **not frozen** and does **not** claim enforcement.

## Quick commands

```bash
python aiki/pipeline/cli.py new-cko --series "Research Decoded" --title "Example Topic"
python aiki/pipeline/cli.py replay CKO-0001
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
python aiki/pipeline/validators/reproducibility/test_CKO-0001.py
```

## Series (Phase 1)

- AI This Week
- Research Decoded (hosts **CKO-0001**)
- Math Intuition (links into [`math/`](math/) IME)
- Code With AI
- Tool Lab

## Evidence tags

Claims in this tree are **declared** or **skeleton** until tests pass on frozen artifacts. Do not promote wording to **enforced** without matching validators and published hashes.
