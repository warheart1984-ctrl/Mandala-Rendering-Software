# 01 — Architect ADR — persistence-memory production readiness

| Field | Value |
|-------|-------|
| `trailId` | `persistence-memory-prod-2026-07` |
| `feature` | Upgrade GitHub `persistence-memory` to Continuity Ledger + operator platform baseline |
| `requestedBy` | User (MRS crew → production ready) |
| `started` | 2026-07-30 |
| `mode` | sage |
| `softwareCreationMode` | Pipeline-Conductor |
| `lens` | Boundary-Guardian |
| `overallStatus` | **partial** (design complete; ship gated by ESFR) |

## Intent

Make [warheart1984-ctrl/persistence-memory](https://github.com/warheart1984-ctrl/persistence-memory) **operator-viable** as a Continuity Ledger HTTP service: schema v1, retrieve/conflicts, tests, CI, container deploy path, optional API auth, honest docs and Drive-G-2 scorecard.

**Why:** The public clone is a legacy memory-board skeleton (pre-ledger fields, no retrieve/conflicts, no README/CI/Docker). Local Mandala `jarvis-memoryboard/` already proves Continuity Ledger v1 — port **evidence-backed** code into the clone; do not claim Mandala CCS enforcement.

## Scope

### In
- `G:\persistence-memory` only for product code
- Port Continuity Ledger models/store/continuity + API + acceptance tests from Mandala `jarvis-memoryboard/`
- Platform: Dockerfile, compose, GitHub Actions CI, optional `JARVIS_API_KEY`, atomic store writes, prod uvicorn (no reload), LICENSE, SECURITY.md, README, scorecard, smoke script (API-only)
- Legacy store migration on load
- CECP trail under Mandala `docs/governance/cecp/trails/persistence-memory-prod-2026-07/`

### Out
- Mandala constitutional protected paths
- Claiming CCS / Evidence / Knowledge / Understanding engines as implemented
- Shipping Mandala Cursor hooks as required runtime (document optional integration only)
- Multi-tenant SaaS, billing, HA Postgres (commercial/platform stretch)
- Push/PR unless operator requests

## ADR decision

**Context:** Two trees exist: GitHub `persistence-memory` (skeleton) and Mandala-embedded `jarvis-memoryboard/` (ledger **partial→enforced** subset). They share ancestry (same package name in pyproject) but are **not** identical.

**Decision:** Treat `persistence-memory` as the **standalone publishable Continuity Ledger service**. Port ledger core + tests from Mandala package; add platform packaging the Mandala tree lacks (CI/Docker/auth). Keep service identity `jarvis-memoryboard` / schema `continuity-ledger-v1` for API compatibility with existing Mandala clients; document GitHub repo name as the distribution name.

**Consequences:**
- Breaking API change vs skeleton create payload (requires ledger fields) — correct for prod; migrate on-disk legacy rows
- Mandala local tree may diverge until a later sync — out of scope this cycle
- Operator-ready local/Docker; not commercial SaaS

**Alternatives rejected:**
1. Rewrite from scratch — rejects proven tests
2. Git submodule Mandala package — couples repos, breaks standalone clone
3. Rename all routes away from `/api/jarvis/memory` — breaks Mandala hooks/clients without benefit this cycle

## Contracts

### HTTP (continuity-ledger-v1)
- `GET /` — service metadata + maturity tags
- `GET /health` — `status`, `schema`, counts
- Board: `GET|POST|PATCH /api/jarvis/memory/board`
- Ledger: `GET/POST /api/jarvis/memory`, `GET/PATCH/DELETE /api/jarvis/memory/{id}`
- Replay: `GET /api/jarvis/memory/retrieve` → memories + selections + conflicts
- Conflicts: `GET /api/jarvis/memory/conflicts?subject=`

### Record fields (required on create)
`content`, `source_agent`, `session_id`, `type`, `confidence`, `evidence`, `status`; optional `supersedes`, `subject`, `tags`. Server sets `id`, timestamps, `content_sha256`.

### Env
| Var | Default | Notes |
|-----|---------|-------|
| `JARVIS_HOST` | `0.0.0.0` | Bind |
| `JARVIS_PORT` | `8001` | Port |
| `JARVIS_STORE_PATH` | `data/jarvis-store.json` | Persistence |
| `JARVIS_CORS_ORIGINS` | `*` | Comma-separated; prod should tighten |
| `JARVIS_API_KEY` | unset | If set, require `Authorization: Bearer` or `X-API-Key` on mutating routes + optionally all except `/health` |
| `JARVIS_ENV` | `development` | `production` disables reload |

### Bans
- No secrets in git
- No silent conflict merge
- No CCS “enforced” claims
- No Mandala constitutional edits

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `app/models.py` | replace → ledger schema | Implementor |
| `app/continuity.py` | create | Implementor |
| `app/store.py` | replace → ledger + atomic save | Implementor |
| `app/main.py` | replace → ledger API + optional auth | Implementor |
| `app/auth.py` | create (API key middleware) | Implementor |
| `app/__main__.py` | update prod reload gate | Implementor |
| `app/__init__.py` | create if missing | Builder |
| `tests/test_*.py` | replace/add acceptance | Implementor |
| `tests/fixtures/` | add drift fixture | Builder |
| `scripts/start-memoryboard.ps1` | create | Builder |
| `scripts/smoke-test.ps1` | create (API-only) | Builder |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | create | Builder/Implementor |
| `.github/workflows/ci.yml` | create | Builder |
| `README.md`, `LICENSE`, `SECURITY.md` | create | Implementor |
| `docs/scorecards/persistence-memory.md` | create | Implementor |
| `docs/RELATIONSHIP_TO_MANDALA.md` | create (honest overlap) | Implementor |
| `docs/CONTINUITY_LEDGER_SOC.md` | port slim | Implementor |
| `.gitignore`, `.env.example` | update | Implementor |
| `pyproject.toml` | bump 0.2.0, description | Implementor |
| Mandala trail `02`–`06` | create | Crew |

## Acceptance tests

- [ ] `pytest` acceptance: Continuity / Replay / Conflict / Drift hash
- [ ] API tests for ledger create validation + retrieve/conflicts
- [ ] Legacy migration loads old `category`/`truth_status` rows
- [ ] CI workflow green locally via `pytest`
- [ ] Docker build succeeds (when Docker available)
- [ ] Optional API key rejects unauthorized POST when set
- [ ] README + scorecard use Drive-G-2; no bare “production ready”

## Risks / unknowns

- Mandala `jarvis-memoryboard` may still be the live operator path on this host — dual trees until sync
- File JSON store is not HA; atomic write mitigates crash mid-write only
- CORS `*` + no auth is fine for loopback; must document for any network bind
- Docker may be unavailable on operator host — CI still proves tests

## Handoff order

1. Builder → scaffolds (Docker/CI/fixtures/scripts stubs)
2. Implementor → port ledger + auth + atomic save + docs
3. Reviewer → Drive-G-1 claim audit
4. Inspector → acceptance checklist
5. ESFR → PromotionEligibility

## Anti-overclaim

- Must NOT claim CCS, Continuity Blocks, signed CES, or multi-product authority as **enforced**
- Continuity/Replay/Conflict **enforced** only after acceptance tests pass in this repo
- Drift remains **partial** (hash check + protocol, not multi-day automation)
- “Production ready” only as dimension table — operator-partial, commercial not started

## Sage counsel

Prove Continuity + Conflict tests first; then CI; then optional auth; then Docker. Leave CCS docs **declared**. Prefer copy-adapt from Mandala over invention. Fix inline import in `get_memory` when porting (imports at top).

## Cross-reference ledger

| Ref | Relevance |
|-----|-----------|
| Mandala `jarvis-memoryboard/` | Source of proven ledger implementation |
| Drive-G-1 / Drive-G-2 | Docs & scorecard honesty |
| CECP Ω∞ trail template | This trail |
| CCS charter (Mandala) | Declared only — not ported as enforced |

## Risks to sovereignty / determinism

- UUID ids + wall-clock timestamps are identity/audit fields, not hash inputs for content fidelity — content_sha256 stays content-normalized
- Optional API key must come from env, never defaults in images
- Avoid cloud lock-in: JSON file + FastAPI remains portable (P5)

## Constitutional boundary analysis

- **In-scope:** persistence-memory product; Mandala CECP trail docs
- **Out-of-scope:** `constitution/`, `engine/constitution/`, `AGENTS.md`, policies
- **Relationship:** Overlap with Mandala Continuity Ledger is **lineage + API compatibility**, not identity of deployment or CCS completeness

## Maturity — CURRENT (clone) vs TARGET (this cycle)

| Dimension | Current | Target this cycle |
|-----------|---------|-------------------|
| Constitutional model | Early (legacy slots only) | Moderate (ledger schema + SoC docs) |
| Governance methodology | Early | Moderate (scorecard + CECP trail) |
| Reference implementation | Early | Moderate→High (tests enforce continuity loop) |
| Platform engineering | Early | Moderate (CI + Docker + optional auth; no HA) |
| Commercial operations | Not started | Not started |

## Handoff to Builder

Scaffold Docker/CI/fixtures/scripts and empty `app/auth.py` / `app/continuity.py` stubs labeled skeleton; Implementor fills logic from Mandala sources.

## Post-hoc: Architect Sage subagent return

[Architect Sage](fd01a3c3-647c-43f5-b342-e0716aae3b55) completed after Implementor/ESFR. Alignment is strong on ledger port, CI/Docker, migration, acceptance tests, anti-overclaim, and Drive-G-2 framing.

**Intentional divergences from that return (Boundary-Guardian):**

| Architect return asked | This cycle shipped | Why |
|------------------------|--------------------|-----|
| Rename pyproject to `continuity-ledger` | Kept `jarvis-memoryboard` + `distribution: persistence-memory` | Preserve Mandala client/service identity |
| Port `agent-hooks/` + Cursor install scripts | Deferred | Hooks bind Mandala `.cursor/`; documented in clone `docs/RELATIONSHIP_TO_MANDALA.md` |
| Port full CCS Boundary Clause / Adapter Consumers | Slim SoC + relationship + drift docs | Avoid CCS overclaim surface; CCS remains **declared** |
| API key **declared** unless tested | **enforced** via `tests/test_auth.py` | Exceeded Architect floor |
| Atomic save “consider” | Shipped `os.replace` temp write | Closed P4 note |

No further Implementor pass required unless operator requests hooks packaging or package rename.
