# MANDALA RENDERING SYSTEM — AGENT LAWBOOK

> **Constitutional Authority:** 4DCE v1.0 / 4DRS v1.0
> **Source of Truth:** `constitution/CHARTER.md` · `engine/constitution/charter.js` · `engine/governance/policies/default.policies.json`
> **Enforcement:** This file is binding on every AI agent, assistant, copilot, and automated tool that scans, reads, modifies, or contributes to this repository.

---

## PREAMBLE

This repository is governed by constitutional law. No agent may operate here without acknowledging and following these rules. If you are an AI agent reading this file, these rules apply to you **immediately and without exception**.

The governance framework is defined across:
- `constitution/CHARTER.md` — master constitutional charter
- `engine/constitution/charter.js` — machine-readable charter (SoT)
- `engine/constitution/contracts.js` — authority contracts
- `engine/governance/policies/default.policies.json` — enforced policy rules
- `engine/governance/ConstitutionalKnowledgeLayer.js` — policy evaluation engine
- `engine/governance/GovernanceKernel.js` — governance decision pipeline
- `engine/conformance/default.conformance-profile.json` — 16 conformance checks

---

## I. CORE PRINCIPLES (MANDATORY)

These are the **enforced** principles from the Constitutional Charter (`charter.js`). Every agent action must satisfy all of them.

| # | Principle | Rule |
|---|-----------|------|
| **P1** | **No execution without intent** | Every operation you perform must have a clear, declared purpose. You must not make changes "just in case" or "for completeness." State your intent before acting. |
| **P2** | **No state change without evidence** | Every file modification must be backed by a verifiable reason. Cite the specific issue, bug, test failure, or user request that necessitates the change. |
| **P3** | **No authority without contract** | You may only modify files within the scope you have been given. Do not expand scope without explicit authorization. |
| **P4** | **Replayable reality** | Every change you make must be deterministic and reproducible. Do not introduce randomness, time-dependent behavior, or non-deterministic state. |
| **P5** | **Sovereign independence** | Prefer platform-agnostic solutions. Do not introduce vendor lock-in, proprietary dependencies, or cloud-specific code without explicit approval. |

---

## II. POLICIES (ENFORCED)

These are the 7 runtime policies from `default.policies.json`. They are **critical** severity and must not be violated.

| Policy ID | Scope | Rule | Violation |
|-----------|-------|------|-----------|
| `policy-no-execution-without-intent` | runtime | `deny_if_false` — intent != null | **BLOCKED** |
| `policy-no-state-change-without-evidence` | state | `deny_if_false` — require evidence for mutation | **BLOCKED** |
| `policy-no-render-without-provenance` | render | `attach_provenance` — every render must carry provenance | **BLOCKED** |
| `policy-no-authority-without-contract` | authority | `deny_if_false` — actor must have contract | **BLOCKED** |
| `policy-play-timeline-requires-world` | timeline | `deny_if_missing_world` — play_timeline requires world id | **BLOCKED** |
| `policy-ascension-drift-throttle` | render | `modify_param` — throttle speed when drift > 0.7 | **MODIFIED** |
| `policy-ascension-evidence` | runtime | `deny_if_false` — dual evidence required for Mythar Ascension | **BLOCKED** |

---

## III. AGENT RULES

These rules are **specific to AI agents** operating in this repository. They are derived from the constitutional principles and policies above.

### R1 — Declare Before You Act
Before modifying any file, state:
- **What** you are changing
- **Why** you are changing it (cite issue, test, or request)
- **Which files** will be affected
- **What tests** will verify the change

### R2 — Never Modify Governance Files Without Authorization
The following files are **constitutional artifacts** and may NOT be modified without explicit user authorization:
- `constitution/CHARTER.md`
- `engine/constitution/charter.js`
- `engine/constitution/contracts.js`
- `engine/governance/policies/default.policies.json`
- `engine/conformance/default.conformance-profile.json`
- `AGENTS.md` (this file)

### R3 — Preserve Evidence Chains
When you modify code, preserve all existing:
- Evidence fields (`intentId`, `worldId`, `timelineId`, `timeSeconds`, `parameters`)
- Provenance records
- Conformance check results
- Receipt generation logic

### R4 — Do Not Introduce Unverified Claims
Every claim in code, comments, or documentation must be backed by implementation evidence. Status tags must be accurate:
- **enforced** — verified in tests, CI passes
- **partial** — partially implemented, some tests pass
- **declared** — designed but not implemented
- **skeleton** — stub only

### R5 — Respect the Math
This is a mathematical rendering system. When working with:
- **4D math** (`s3.js`, `vec4.js`, `transform.js`): Verify correctness against the canonical derivations
- **Normalization** (`bsdf4d.js`, `ggx4d.js`): Follow the audit fixes (BRDF = 3ρ/(4π), pdf = 3cosθ/(4π))
- **BVH** (`BVH4D.js`, `bvh4d.wgsl`): Maintain AABB4 slab intersection correctness
- **Projections** (`projector.js`): Preserve d₄ and d₃ projection formulas

### R6 — Test Before You Commit
Before committing any change:
1. Run `node src/render/rt4d/test/normalization.test.js` — 23 tests must pass
2. Run `npm test` if available — full test suite must pass
3. Run `npm run test:conformance` if available — 16/16 checks must pass
4. Verify no regressions in existing functionality

### R7 — Maintain Constitutional Structure
Preserve the directory structure and module boundaries:
- `engine/` — constitutional engine (SoT)
- `js/` — JS re-exports and browser host
- `mrs/packages/renderer-core/` — rendering package (SoT for math/rendering)
- `unity/` — Unity host (skeleton)
- `unreal/` — Unreal host (skeleton)
- `docs/` — documentation and contracts
- `constitution/` — top-level charter
- `schemas/` — JSON schemas

### R8 — No Secrets, No Keys, No Credentials
Never commit:
- API keys, tokens, or credentials
- Private keys or certificates
- Passwords or connection strings
- Any secret material

### R9 — License Compliance
This repository uses the MIT License. All contributions must be compatible with MIT. Do not introduce GPL, AGPL, or other copyleft dependencies without explicit approval.

### R10 — Sovereignty Over Convenience
When a constitutional principle conflicts with convenience, **the constitution wins**. Do not:
- Skip evidence generation because it's "faster"
- Bypass authority checks because they're "in the way"
- Disable conformance checks because they "annoying"
- Simplify math because it's "close enough"

---

## IV. CONFORMANCE CHECKS (16/16 REQUIRED)

Every agent-modified subsystem must pass these checks from `default.conformance-profile.json`:

| Domain | Check ID | Description |
|--------|----------|-------------|
| provenance | `provenance.recorder-exists` | Runtime exposes ProvenanceRecorder |
| provenance | `provenance.frame-fields` | Every frame has intentId, timelineId, worldId, timeSeconds, parameters |
| provenance | `provenance.frame-recorded-during-play` | Frames recorded between play and stop |
| replay | `replay.service-exists` | ReplayService accepts frames + target |
| replay | `replay.deterministic-params` | Replay restores same parameter values |
| binding | `binding.resolver-exists` | BindingResolver maps track bindings to scene objects |
| binding | `binding.all-tracks-resolved` | Every track.binding resolves |
| timeline | `timeline.loader-exists` | Can load GovernedTimelineDto from JSON |
| timeline | `timeline.clip-application` | Player applies set_param and render_4d clips |
| timeline | `timeline.world-required` | play_timeline without world id is denied |
| evidence | `evidence.bundle-fields` | Evidence has id, worldId, timelineId |
| evidence | `evidence.dual-require` | CKL denies when require[] evidence ids missing |
| ckl | `ckl.policy-load` | Runtime loads default.policies.json |
| ckl | `ckl.deny-without-intent` | CKL denies execution when intent null |
| ckl | `ckl.modify-param` | CKL modify_param adjusts params on condition |
| ckl | `ckl.attach-provenance` | CKL sets attachProvenance for render/play |

---

## V. EVIDENCE REQUIREMENTS

When an agent modifies code, it must produce evidence in the form of:

1. **Intent declaration** — what the agent intends to do and why
2. **File manifest** — list of all files to be created or modified
3. **Test plan** — specific tests to run and expected outcomes
4. **Conformance check** — which of the 16 checks are affected
5. **Regressions** — what existing functionality is preserved

This evidence must be included in the commit message or PR description.

---

## VI. PROTECTED PATHS

The following paths contain constitutional artifacts and require explicit authorization to modify:

```
constitution/
engine/constitution/
engine/governance/policies/
engine/conformance/default.conformance-profile.json
AGENTS.md
CITATION.cff
.zenodo.json
```

---

## VII. ENFORCEMENT

This lawbook is enforced through:
1. **OpenCode permissions** — `.opencode/config.json` restricts file operations
2. **CI checks** — `npm test` and `npm run test:conformance` must pass
3. **Code review** — Human review of all constitutional changes
4. **Provenance** — All changes are recorded with evidence

---

## VIII. ACKNOWLEDGMENT

By operating in this repository, you acknowledge that:
1. You have read and understood this lawbook
2. You will follow all principles (P1–P5)
3. You will obey all policies (1–7)
4. You will produce evidence for every change
5. You will respect the constitutional structure
6. You understand that violations will be blocked

---

> **"No action without evidence. No claim without proof. No system without governance."**
> — Constitutional Engine Charter v1.0
