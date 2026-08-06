# G1–G5 Implementation Maturity Model

> **Status:** Draft — not yet ratified. Does not amend `CHARTER.md`, policies, or conformance profile.
> **Authority:** Constitutional Engine Charter v1.0 (P1–P5); CECP Ω∞ pipeline; ESFR promotion rules.
> **Scope:** Applies to every feature, module, or subsystem across SME, Sovereign X Router, and MRS.

---

## Core Principles

### Implementation-Agnostic Maturity

**G1–G5 gates measure evidence and maturity — not authorship.**

Whether code is written by a human, a coding agent, an AI assistant, or generated from a specification, the promotion criteria are identical. The gates evaluate:

- **Constitutional contracts** (intent, authority, scope)
- **Deterministic behavior** (tests, replay, math correctness)
- **Policy compliance** (7 runtime policies, 16 conformance checks)
- **Evidence chains** (provenance, dual evidence, replay verification)
- **Engineering standards** (coherence, license hygiene, no drift)

No gate has a "human review" or "AI review" variant. The evidence bundle is the single source of truth.

### Versioned Maturity Manifest

At each gate, a **Maturity Manifest** is generated — a canonical JSON artifact capturing the implementation's constitutional maturity state. This manifest is:

- **Machine-readable** — consumable by CI, agents, dashboards
- **Versioned** — schema version + gate version for evolution
- **Immutable** — appended to lineage, never overwritten
- **Portable** — same schema across SME, Sovereign X, MRS, future projects

The manifest becomes the promotion credential. ESFR evaluates the manifest, not the code directly.

---

## Overview

The G1–G5 model defines **five canonical gates** that every implementation must pass before it is considered production-ready. Each gate has:

- **Purpose** — what the gate validates
- **Entry criteria** — what must be true before the gate is attempted
- **Exit criteria** — what must be true to pass the gate
- **Required evidence** — artifacts that must exist and be verifiable
- **Required conformance checks** — which of the 16 conformance checks apply
- **Promotion requirements** — how the gate feeds into ESFR promotion eligibility
- **Manifest output** — the Maturity Manifest generated at gate completion

Gates are **sequential**: G1 must pass before G2, G2 before G3, etc. A feature at G3 has implicitly passed G1 and G2.

---

## G1 — Constitutional Scaffold (Intent & Authority)

**Purpose:** Verify the feature has a declared constitutional contract, valid authority scope, and evidence-bound intent before any code is written.

| Aspect | Definition |
|--------|------------|
| **Entry criteria** | - Architect ADR exists (`docs/governance/cecp/trails/<id>/01-architect-adr.md`)<br>- Intent declared with `intentId`, `worldId`, `timelineId`, `timeSeconds`, `parameters`<br>- Authority contract registered (or CSE `resolveAuthority` path documented)<br>- No protected-path modifications (`constitution/`, `engine/constitution/`, `engine/governance/policies/`, `engine/conformance/`, `AGENTS.md`) |
| **Exit criteria** | - ADR approved by Reviewer (constitutional audit)<br>- Intent immutable in provenance chain<br>- Authority scope matches implementation plan<br>- Builder scaffold created with stubs, wiring, empty tests |
| **Required evidence** | - ADR document with invariants, contracts, acceptance criteria<br>- Intent declaration (JSON or ISL)<br>- Authority contract or CSE resolution record<br>- Builder manifest (`02-builder-scaffold-manifest.md`) listing all files to be created/modified |
| **Conformance checks** | `ckl.policy-load`, `ckl.deny-without-intent`, `ckl.attach-provenance`, `policy-no-authority-without-contract` |
| **Promotion requirement** | G1 pass → feature eligible for Builder stage (CECP stage 02). ESFR `HOLD` if G1 incomplete. |
| **Manifest output** | `manifest-g1.json` with `gate: 1`, `status: "passed"`, evidence bundle (ADR, intent, authority), conformance (4 checks), lineage (trail ID, CECP stage 1), promotion eligible `false` |

---

## G2 — Deterministic Implementation (Code & Tests)

**Purpose:** Verify the implementation is deterministic, reproducible, and passes all unit/integration tests with constitutional math correctness.

| Aspect | Definition |
|--------|------------|
| **Entry criteria** | - G1 exit criteria satisfied<br>- Builder scaffold complete (stubs, wiring, empty tests)<br>- Implementor assigned |
| **Exit criteria** | - All implementation code complete (no `TODO`/`FIXME` in production paths)<br>- Unit tests pass (`node --test` or `npm test`)<br>- Integration tests pass for governed paths (CKL, GK, ISL, ledger)<br>- Math correctness verified against canonical derivations (4D math, normalization, BVH, projections)<br>- No secrets, keys, credentials committed<br>- License compliance (MIT-compatible only) |
| **Required evidence** | - Implementor notes (`03-implementor-notes.md`) with file manifest<br>- Test results (JUnit XML or console output)<br>- Math audit trail (normalization.test.js 23/23 pass, etc.)<br>- Dependency license scan |
| **Conformance checks** | All 16 conformance checks (`npm run test:conformance` → 16/16 pass)<br>Additional: `provenance.frame-fields`, `replay.deterministic-params`, `timeline.clip-application` |
| **Promotion requirement** | G2 pass → feature eligible for Reviewer stage (CECP stage 04). ESFR `HOLD` if tests incomplete or math unverified. |
| **Manifest output** | `manifest-g2.json` with `gate: 2`, `status: "passed"`, evidence bundle (test results, math audit, license scan), conformance (16/16), replay verification (deterministic params), lineage (prev manifest-g1, CECP stages 1–3), promotion eligible `false` |

---

## G3 — Constitutional Audit (Reviewer Gate)

**Purpose:** Verify the implementation complies with constitutional law, policies, and contracts — no drift, no overclaims, honest status tags.

| Aspect | Definition |
|--------|------------|
| **Entry criteria** | - G2 exit criteria satisfied<br>- All tests passing<br>- Reviewer assigned |
| **Exit criteria** | - Reviewer artifact complete (`04-reviewer-conformance.md`)<br>- All 7 runtime policies evaluated — no critical/high violations<br>- Status tags accurate (`enforced`/`partial`/`declared`/`skeleton`/`held`/`blocked`)<br>- No unauthorized protected-path edits<br>- CECP Ω∞ governance trail complete through stage 04<br>- Architecture coherence with declared references (AAES-OS, RT4D, CIEMS, CHEA Ω∞, CCR, CDGF as `declared` unless artifacts exist) |
| **Required evidence** | - Reviewer conformance report with policy-by-policy verdict<br>- Constitutional audit checklist (P1–P5, 7 policies, 16 conformance checks)<br>- Drift analysis against stated contracts/references<br>- Explicit gap list with status tags for any `partial`/`declared`/`skeleton` items |
| **Conformance checks** | All 16 conformance checks (re-verified)<br>Policy evaluation: `policy-no-execution-without-intent`, `policy-no-state-change-without-evidence`, `policy-no-render-without-provenance`, `policy-no-authority-without-contract`, `policy-play-timeline-requires-world`, `policy-ascension-drift-throttle`, `policy-ascension-evidence` |
| **Promotion requirement** | G3 pass → feature eligible for Inspector stage (CECP stage 05). ESFR `HOLD` if constitutional violations or overclaims found. |
| **Manifest output** | `manifest-g3.json` with `gate: 3`, `status: "passed"`, evidence bundle (reviewer report, policy verdicts, drift analysis), conformance (16/16 + 7 policies), lineage (prev manifest-g2, CECP stages 1–4), promotion eligible `false`, driveG2Dimensions updated |

---

## G4 — Evidence & Determinism Validation (Inspector Gate)

**Purpose:** Verify all claims are backed by reproducible evidence, determinism holds under replay, and provenance chains are complete.

| Aspect | Definition |
|--------|------------|
| **Entry criteria** | - G3 exit criteria satisfied<br>- Reviewer `PASS` or `PASS_WITH_GAPS`<br>- Inspector assigned |
| **Exit criteria** | - Inspector artifact complete (`05-inspector-acceptance.md`)<br>- Evidence probes 01–08 executed and cited (or explicit N/A with reason)<br>- Determinism verified: replay restores identical parameter values<br>- Provenance chain complete: every frame has `intentId`, `timelineId`, `worldId`, `timeSeconds`, `parameters`<br>- Dual evidence requirement satisfied for Mythar Ascension paths<br>- No silent assumptions; all gaps explicitly declared with required evidence for closure |
| **Required evidence** | - Inspector acceptance report with probe-by-probe results<br>- Replay validation logs (deterministic params check)<br>- Provenance frame dumps (sample frames with all required fields)<br>- Evidence bundle samples (CKL input with `id`, `worldId`, `timelineId`)<br>- Gap declaration matrix (if `PASS_WITH_GAPS`) |
| **Conformance checks** | All 16 conformance checks (re-verified)<br>Probe-specific: `evidence.bundle-fields`, `evidence.dual-require`, `provenance.frame-recorded-during-play`, `replay.service-exists`, `binding.all-tracks-resolved`, `timeline.world-required` |
| **Promotion requirement** | G4 pass → feature eligible for ESFR stage (CECP stage 06). ESFR `HOLD` if evidence incomplete or determinism fails. |
| **Manifest output** | `manifest-g4.json` with `gate: 4`, `status: "passed"`, evidence bundle (inspector report, probe results, replay logs, provenance dumps), conformance (16/16 + probes), replay verification (frames replayed, params restored, deterministic=true), lineage (prev manifest-g3, CECP stages 1–5), promotion eligible `false`, driveG2Dimensions updated |

---

## G5 — Engineering Standards & Promotion Readiness (ESFR Gate)

**Purpose:** Final ship gate — verify engineering standards, ecosystem coherence, constitutional legitimacy, and promotion eligibility.

| Aspect | Definition |
|--------|------------|
| **Entry criteria** | - G4 exit criteria satisfied<br>- Inspector `PASS` or `PASS_WITH_GAPS`<br>- ESFR assigned |
| **Exit criteria** | - ESFR verdict: `PASS` or `PASS_WITH_GAPS`<br>- PromotionEligibility: `PROMOTE` or `PROMOTE_WITH_GAPS`<br>- ESFR test-matrix categories complete + probes 01–08 citations<br>- Lineage record updated (`lineage.json`, `lineage.esfr.json`)<br>- No architectural drift against CECP references<br>- Constitutional compliance at ship-gate layer (Drive-G-1 / Drive-G-2 / scope discipline)<br>- MIT license hygiene; no copyleft dependencies introduced |
| **Required evidence** | - ESFR artifact complete (`06-engineer-standards.md`) with verdict and promotion eligibility<br>- Test-matrix scorecard with all categories cited<br>- Probe citations 01–08 (or justified N/A)<br>- Gap list with status tags and required evidence for closure (if `PROMOTE_WITH_GAPS`)<br>- Updated maturity scorecard (`docs/scorecards/<module>.md`) |
| **Conformance checks** | All 16 conformance checks (final re-verification)<br>ESFR-specific: architectural coherence, constitutional compliance, no drift, license hygiene |
| **Promotion requirement** | G5 `PASS` → `PROMOTE` (reference implementation eligible for registry inclusion)<br>G5 `PASS_WITH_GAPS` → `PROMOTE_WITH_GAPS` (gaps tracked, no silent promotion)<br>G5 `HOLD`/`REJECT` → feature blocked until gaps resolved |
| **Manifest output** | `manifest-g5.json` with `gate: 5`, `status: "passed"`, evidence bundle (esfr verdict, test-matrix, probes, scorecard), conformance (16/16 final), replay verification (final), lineage (prev manifest-g4, CECP stages 1–6, git commit), promotion eligible `true`, decision `PROMOTE`/`PROMOTE_WITH_GAPS`, esfrVerdict, driveG2Dimensions final |

---

## Promotion Eligibility Matrix

| G1 | G2 | G3 | G4 | G5 | ESFR Verdict | PromotionEligibility |
|----|----|----|----|----|--------------|----------------------|
| ✅ | ✅ | ✅ | ✅ | PASS | PASS | **PROMOTE** |
| ✅ | ✅ | ✅ | ✅ | PASS_WITH_GAPS | PASS_WITH_GAPS | **PROMOTE_WITH_GAPS** |
| ❌ | — | — | — | — | HOLD/REJECT | **HOLD** / **REJECT** |
| ✅ | ❌ | — | — | — | HOLD/REJECT | **HOLD** / **REJECT** |
| ✅ | ✅ | ❌ | — | — | HOLD/REJECT | **HOLD** / **REJECT** |
| ✅ | ✅ | ✅ | ❌ | — | HOLD/REJECT | **HOLD** / **REJECT** |

---

## Drive-G-1 / Drive-G-2 Alignment

- **Drive-G-1 (evidence-bound claims):** Every gate requires verifiable evidence artifacts. No claim without proof.
- **Drive-G-2 (maturity dimensions):** G1–G5 map to maturity dimensions:
  - G1 → **Constitutional Model** (contract, authority, intent)
  - G2 → **Reference Implementation** (code, tests, math correctness)
  - G3 → **Governance Methodology** (policy compliance, honest tags)
  - G4 → **Platform Engineering** (determinism, provenance, replay)
  - G5 → **Commercial Operations** (standards, coherence, license hygiene)

---

## Conformance Check Coverage by Gate

| Conformance Check | G1 | G2 | G3 | G4 | G5 |
|-------------------|----|----|----|----|----|
| provenance.recorder-exists | ✅ | ✅ | ✅ | ✅ | ✅ |
| provenance.frame-fields | | ✅ | ✅ | ✅ | ✅ |
| provenance.frame-recorded-during-play | | | | ✅ | ✅ |
| replay.service-exists | | ✅ | ✅ | ✅ | ✅ |
| replay.deterministic-params | | ✅ | ✅ | ✅ | ✅ |
| binding.resolver-exists | | ✅ | ✅ | ✅ | ✅ |
| binding.all-tracks-resolved | | | | ✅ | ✅ |
| timeline.loader-exists | | ✅ | ✅ | ✅ | ✅ |
| timeline.clip-application | | ✅ | ✅ | ✅ | ✅ |
| timeline.world-required | ✅ | ✅ | ✅ | ✅ | ✅ |
| evidence.bundle-fields | | ✅ | ✅ | ✅ | ✅ |
| evidence.dual-require | | | ✅ | ✅ | ✅ |
| ckl.policy-load | ✅ | ✅ | ✅ | ✅ | ✅ |
| ckl.deny-without-intent | ✅ | ✅ | ✅ | ✅ | ✅ |
| ckl.modify-param | | ✅ | ✅ | ✅ | ✅ |
| ckl.attach-provenance | ✅ | ✅ | ✅ | ✅ | ✅ |
| csr.governance-trace | | ✅ | ✅ | ✅ | ✅ |

---

## Maturity Manifest Specification

### Manifest Schema (v1.0)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MaturityManifest",
  "type": "object",
  "required": [
    "schemaVersion",
    "manifestId",
    "featureId",
    "gate",
    "gateVersion",
    "timestamp",
    "status",
    "conformance",
    "evidenceBundle",
    "replayVerification",
    "lineage",
    "promotion"
  ],
  "properties": {
    "schemaVersion": { "type": "string", "const": "1.0" },
    "manifestId": { "type": "string", "format": "uuid" },
    "featureId": { "type": "string" },
    "featureName": { "type": "string" },
    "gate": { "type": "integer", "minimum": 1, "maximum": 5 },
    "gateVersion": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "author": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["human", "agent", "ai", "spec-generated"] },
        "id": { "type": "string" },
        "sessionId": { "type": "string" }
      },
      "description": "Informational only — gates do not vary by author type"
    },
    "status": { "type": "string", "enum": ["passed", "failed", "partial"] },
    "conformance": {
      "type": "object",
      "required": ["checksRun", "checksPassed", "checksFailed", "details"],
      "properties": {
        "checksRun": { "type": "integer" },
        "checksPassed": { "type": "integer" },
        "checksFailed": { "type": "integer" },
        "details": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "checkId": { "type": "string" },
              "result": { "type": "string", "enum": ["pass", "fail", "skip"] },
              "evidenceRef": { "type": "string" }
            },
            "required": ["checkId", "result"]
          }
        }
      }
    },
    "evidenceBundle": {
      "type": "object",
      "required": ["intentId", "worldId", "timelineId", "artifacts"],
      "properties": {
        "intentId": { "type": "string" },
        "worldId": { "type": "string" },
        "timelineId": { "type": "string" },
        "timeSeconds": { "type": "number" },
        "parameters": { "type": "object" },
        "artifacts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": { "type": "string", "enum": ["adr", "intent", "authority", "test-results", "math-audit", "reviewer-report", "inspector-report", "esfr-verdict", "probe-results", "replay-log", "provenance-dump", "license-scan"] },
              "path": { "type": "string" },
              "hash": { "type": "string" },
              "verified": { "type": "boolean" }
            },
            "required": ["type", "path", "hash", "verified"]
          }
        }
      }
    },
    "replayVerification": {
      "type": "object",
      "required": ["verified", "framesReplayed", "paramsRestored", "deterministic"],
      "properties": {
        "verified": { "type": "boolean" },
        "framesReplayed": { "type": "integer" },
        "paramsRestored": { "type": "boolean" },
        "deterministic": { "type": "boolean" },
        "seed": { "type": "integer" },
        "logRef": { "type": "string" }
      }
    },
    "lineage": {
      "type": "object",
      "required": ["trailId", "previousManifestId", "cecpStagesCompleted"],
      "properties": {
        "trailId": { "type": "string" },
        "previousManifestId": { "type": "string" },
        "cecpStagesCompleted": {
          "type": "array",
          "items": { "type": "integer", "minimum": 1, "maximum": 6 }
        },
        "gitCommit": { "type": "string" },
        "gitBranch": { "type": "string" }
      }
    },
    "promotion": {
      "type": "object",
      "required": ["eligible", "decision"],
      "properties": {
        "eligible": { "type": "boolean" },
        "decision": { "type": "string", "enum": ["PROMOTE", "PROMOTE_WITH_GAPS", "HOLD", "REJECT", "N/A"] },
        "gaps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "description": { "type": "string" },
              "status": { "type": "string", "enum": ["partial", "declared", "skeleton", "held", "blocked"] },
              "requiredEvidence": { "type": "string" },
              "targetGate": { "type": "integer", "minimum": 1, "maximum": 5 }
            },
            "required": ["description", "status", "requiredEvidence", "targetGate"]
          }
        },
        "esfrVerdict": { "type": "string", "enum": ["PASS", "PASS_WITH_GAPS", "HOLD", "REJECT", "N/A"] },
        "reviewedBy": { "type": "string" },
        "reviewTimestamp": { "type": "string", "format": "date-time" }
      }
    },
    "driveG1EvidenceBound": { "type": "boolean" },
    "driveG2Dimensions": {
      "type": "object",
      "properties": {
        "constitutionalModel": { "type": "string", "enum": ["enforced", "partial", "declared", "skeleton"] },
        "referenceImplementation": { "type": "string", "enum": ["enforced", "partial", "declared", "skeleton"] },
        "governanceMethodology": { "type": "string", "enum": ["enforced", "partial", "declared", "skeleton"] },
        "platformEngineering": { "type": "string", "enum": ["enforced", "partial", "declared", "skeleton"] },
        "commercialOperations": { "type": "string", "enum": ["enforced", "partial", "declared", "skeleton"] }
      }
    }
  }
}
```

### Manifest Generation Rules

| Gate | Generator | Trigger | Output Path |
|------|-----------|---------|-------------|
| **G1** | Architect (or agent) | ADR approved + intent declared + authority registered | `docs/governance/cecp/trails/<id>/manifest-g1.json` |
| **G2** | Implementor (or agent) | All tests pass + 16/16 conformance + math audit | `docs/governance/cecp/trails/<id>/manifest-g2.json` |
| **G3** | Reviewer | Reviewer artifact complete + policy evaluation clean | `docs/governance/cecp/trails/<id>/manifest-g3.json` |
| **G4** | Inspector | Inspector artifact complete + probes 01–08 + replay verified | `docs/governance/cecp/trails/<id>/manifest-g4.json` |
| **G5** | ESFR | ESFR verdict + promotion eligibility determined | `docs/governance/cecp/trails/<id>/manifest-g5.json` |

Each manifest **includes the previous gate's manifest ID** in `lineage.previousManifestId`, creating an immutable chain.

### Manifest Consumption

- **CI gates**: Read `manifest-g5.json` → require `promotion.decision` ∈ {`PROMOTE`, `PROMOTE_WITH_GAPS`}
- **Agents**: Query manifest to determine what gates are complete before acting
- **Dashboards**: Aggregate manifests for maturity heatmaps across modules
- **Registry**: Only implementations with `manifest-g5.json` + `PROMOTE`/`PROMOTE_WITH_GAPS` eligible for reference registry

---

## Updated Gate Definitions with Manifest Outputs

1. **Every feature** starts at G1 (Architect ADR + Intent + Authority).
2. **Gate progression** is recorded in the CECP trail (`docs/governance/cecp/trails/<id>/`).
3. **ESFR** makes the final promotion decision at G5 using `promotion.esfr.md` rules.
4. **Maturity scorecards** (`docs/scorecards/`) are updated at G5 with dimension ratings.
5. **No feature** is promoted to reference implementation without G5 `PROMOTE` or `PROMOTE_WITH_GAPS`.

---

## Relationship to Existing Gates

| Existing Gate | Maps To | Notes |
|---------------|---------|-------|
| CECP stages 01–06 | G1–G5 | CECP is the *process*; G1–G5 are the *maturity criteria* at each stage |
| ESFR PromotionEligibility | G5 exit | G5 formalizes what ESFR already evaluates |
| Engine-governance-audit G1–G4 | Subset of G1–G3 | Those were one-time gap closures; this model generalizes them |
| Digital Printer v2 promotion checklist | G5 for that module | Module-specific G5 instantiation |

---

## Ratification

This model becomes binding when:

1. Added to `constitution/MATURITY_MODEL.md` (this file)
2. Referenced in `AGENTS.md` under Agent Rules
3. Integrated into CECP trail templates (`EVIDENCE_TRAIL_TEMPLATE.md`)
4. ESFR protocol updated to require G1–G5 gate evidence at each stage
5. **Maturity Manifest schema v1.0** added to `schemas/maturity-manifest.v1.json`
6. **Manifest generator** implemented (CI job or agent tooling) that produces manifests at each gate
7. **Registry policy** updated: only implementations with valid `manifest-g5.json` eligible for reference registry

Until ratified, this document is **declared** — not enforced.

---

## Ecosystem Adoption

Once ratified, G1–G5 + Maturity Manifest becomes the **required constitutional engineering maturity model** across:

| Project | Adoption Path |
|---------|---------------|
| **SME** | Integrate manifests into model promotion pipeline |
| **Sovereign X Router** | Gate GPU capability/dispatch modules through G1–G5 |
| **MRS** | All renderer-core, RT4D, Proton, Genblaze modules |
| **Future constitutional projects** | Mandatory from project initialization |

The manifest provides a **single canonical artifact** that humans, CI, and AI agents can query to determine: "What is the constitutional maturity of this implementation?" — without inspecting code, reading trails, or trusting claims.