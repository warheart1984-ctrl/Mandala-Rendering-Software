# Genblaze Operator Training Manual

**Artifact:** \docs/genblaze/operators/operator-training-manual.md\  
**Status:** Operational · Constitutional · Required for operators  
**Implementation:** \mrs/apps/genblaze-media/app/byok.py\ (**enforced** in unit tests)  
**Charter:** \docs/genblaze/security/byok-security-charter.md\  
**Trail:** \docs/governance/cecp/trails/genblaze-byok-session-2026-07/
## Section I — Mission of Genblaze

Genblaze is the constitutional creative media host for Sovereign X / MRS concept stills.

Operators use it to:

- Ingest / generate concept images (NIM FLUX or RT4D backend)
- Run assist-only lookdev / face / SceneSpec paths when enabled
- Keep BYOK secrets session-local
- Route deterministic print jobs to CPU RT4D / Digital Printer — **never** via GPU/NIM as SoT

Operators must preserve:

- Compute sovereignty
- Determinism boundaries
- BYOK security
- Assist-only GPU domain

## Section II — Operator Responsibilities

- Protect user secrets (no key logging, no git, no B2 vault as BYOK store)
- Maintain local-first posture
- Enable hosted BYOK only with explicit \GENBLAZE_ALLOW_BYOK=1- Warn users about XSS on hosted deployments
- Keep evidence chains free of API keys

## Section III — Daily Workflow

1. Launch local Genblaze (preferred).
2. Confirm \GET /health\ — note \yok\, t4d.available\, image backend.
3. User enters session key + optional model override.
4. Generate stills/assist within BYOK scope.
5. Human curation → RT4D / printer for print SoT (no secrets).

## Section IV — Forbidden Actions

- Store BYOK keys server-side as durable state
- Proxy multi-tenant keys on hosted without the flag
- Route NIM/GPU beauty into Digital Printer evidence as SoT
- Claim React SPA features that are not in \static/index.html- Edit constitutional protected paths without authorization

## Section V — Constitutional Violations

Treat as incidents:

- Key material in logs or evidence bundles
- \printSoT: true\ on BYOK/NIM paths
- Hosted BYOK enabled silently without operator intent
- Docs claiming **enforced** capability without tests

## Section VI — Verification

- \python -m pytest mrs/apps/genblaze-media/tests/test_byok.py- \python -m pytest mrs/apps/genblaze-media/tests/test_constitutional_compliance.py- ode scripts/genblaze/security-audit.mjs- ode scripts/mandala-lint/run.mjs\ (partial heuristics)

## Related UI surfaces (static SPA)

- BYOK Quickstart
- Model Marketplace (catalog disclosure)
- Compliance Badge
- Capability Registry Browser
