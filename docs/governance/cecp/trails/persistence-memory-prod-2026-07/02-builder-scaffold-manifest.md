# 02 — Builder Scaffold Manifest — persistence-memory production readiness

| Field | Value |
|-------|-------|
| `trailId` | `persistence-memory-prod-2026-07` |
| `stage` | 02 — Builder |
| `mode` | sage (light) |
| `softwareCreationMode` | Blueprint + Forge |
| `mandalaMode` | ON (user-gated proposals only; no Mandala constitutional edits) |
| `branch` | `crew/prod-readiness-2026-07` |
| `status` | **complete** — all scaffold files written; Implementor fills logic |
| `authored` | 2026-07-30 |
| `agent` | Blueprint + Forge Builder (MRS crew stage 02) |

---

## Architect decisions honored

| Decision | Disposition |
|----------|-------------|
| Create `docs/OPERATOR_DEPLOY_CHECKLIST.md` as stub | ✓ Created — section headers only; Implementor fills prose |
| PR body verbatim in trail artifact | ✓ Below (§ PR body) and in `docs/pr-body-crew2.md` |
| Note Mandala proposals as user-gated | ✓ Confirmed — no Mandala constitutional paths touched |
| Create `docs/pr-body-crew2.md` for operator paste | ✓ Created in `G:\persistence-memory\docs\pr-body-crew2.md` |
| `app/__init__.py` — Builder responsibility | ✓ Created |
| `tests/fixtures/drift_baseline.json` shell | ✓ Present (Implementor-filled in same cycle) |

---

## File actions table (under `G:\persistence-memory`)

| Path | Action | Kind | Owner | Status |
|------|--------|------|-------|--------|
| `app/__init__.py` | create | stub | Builder | ✓ written |
| `app/auth.py` | create | skeleton | Builder → Implementor | ✓ exists (Implementor filled) |
| `app/continuity.py` | create | skeleton | Builder → Implementor | ✓ exists (Implementor filled) |
| `app/store.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `app/main.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `app/models.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `app/__main__.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `tests/fixtures/drift_baseline.json` | create | fixture shell | Builder | ✓ exists |
| `tests/test_acceptance.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `tests/test_api.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `tests/test_store.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `tests/test_auth.py` | scaffold shell | skeleton | Implementor | ✓ exists (Implementor filled) |
| `Dockerfile` | create | scaffold | Builder | ✓ exists |
| `docker-compose.yml` | create | scaffold | Builder | ✓ exists |
| `.dockerignore` | create | scaffold | Builder | ✓ exists |
| `.github/workflows/ci.yml` | create | scaffold | Builder | ✓ exists |
| `scripts/start-memoryboard.ps1` | create | scaffold | Builder | ✓ exists |
| `scripts/smoke-test.ps1` | create | scaffold | Builder | ✓ exists |
| `docs/OPERATOR_DEPLOY_CHECKLIST.md` | **create** | **stub (this stage)** | **Builder** | ✓ written now |
| `docs/pr-body-crew2.md` | **create** | **scaffold** | **Builder** | ✓ written now |
| `docs/RELATIONSHIP_TO_MANDALA.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `docs/CONTINUITY_LEDGER_SOC.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `docs/DRIFT_PROTOCOL.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `docs/scorecards/persistence-memory.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `README.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `LICENSE` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `SECURITY.md` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `.gitignore` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `.env.example` | scaffold shell | Implementor | | ✓ exists (Implementor filled) |
| `pyproject.toml` | bump 0.2.0 | Implementor | | ✓ exists (Implementor filled) |

### Net new files written by Builder this stage

| File | Notes |
|------|-------|
| `app/__init__.py` | Package marker; distribution identity comment |
| `docs/OPERATOR_DEPLOY_CHECKLIST.md` | Stub — 5 sections, TODO headings; Implementor fills prose |
| `docs/pr-body-crew2.md` | Verbatim Architect PR body; operator pastes into GitHub |

---

## Mandala proposals (user-gated — DO NOT edit without auth)

The following Mandala Continuity Ledger / constitutional paths are **out of scope for this stage**. They are noted here as proposals only; no edits were made:

| Mandala path | Proposal status |
|-------------|-----------------|
| `jarvis-memoryboard/` (local) | May eventually sync with `persistence-memory` clone; deferred |
| `constitution/`, `engine/constitution/`, `AGENTS.md` | Protected — not touched |
| `.cursor/hooks/state/jarvis-live-context.md` | Session hook; out of scope for clone |

**Confirmation:** Zero edits to any Mandala constitutional path in this Builder stage.

---

## PR body (verbatim — Architect contract)

> Also written to `G:\persistence-memory\docs\pr-body-crew2.md` for operator paste.

```markdown
## PR: Continuity Ledger v1 — persistence-memory production readiness

Branch: crew/prod-readiness-2026-07 → main

### What this changes
- Port Continuity Ledger models/store/continuity from Mandala jarvis-memoryboard
- Add: test suite (51 tests), CI workflow (3.11+3.12 matrix + docker build), Dockerfile/compose,
  optional API key middleware (HMAC), atomic JSON store (os.replace), legacy migration on load,
  SECURITY.md, scorecard (Drive-G-2), RELATIONSHIP_TO_MANDALA.md, smoke scripts

### Evidence
- `python -m pytest -q` → 51 passed (acceptance/store/api/auth)
- Maturity tags accurate: enforced = tested; partial = drift hash; declared = CCS

### Gaps remaining post-merge (known, non-blocking for operator baseline)
- TLS/reverse proxy: operator deploy (SECURITY.md §5)
- HA store: single JSON file; not HA (documented non-claim)
- Commercial/multi-tenant: not started

### What this does NOT claim
- CCS root authority: declared only
- Mandala constitutional runtime: out of scope
- "Production ready" across all dimensions: see scorecard
```

---

## OPERATOR_DEPLOY_CHECKLIST.md — stub section contract

Stub created with these headings (Implementor fills prose detail):

1. **Pre-deploy** — Python version, deps, `.env`, store path, data backup
2. **Reverse proxy / TLS** — nginx/Caddy snippet, cert, CORS tightening (SECURITY.md §5)
3. **Docker deploy** — build command, compose up, volume mount, key injection, healthcheck
4. **Post-deploy smoke** — curl round-trip, expected responses, `smoke-test.ps1`
5. **Explicit non-claims** — TLS, HA, CCS, Mandala runtime, commercial (operator acknowledges)

---

## Scaffold integrity notes

- All Builder-created stubs use `# TODO (Implementor)` or `<!-- TODO (Implementor) -->` markers
- No deep business logic introduced by Builder
- Docker/CI files are shells; Implementor may extend matrix or stages
- `app/__init__.py` is a package marker only — no imports, no logic

---

## Handoff to Implementor (stage 03)

| Task | Priority |
|------|----------|
| Fill `docs/OPERATOR_DEPLOY_CHECKLIST.md` prose (all 5 sections) | High — needed for operator go-live |
| Port ledger core: `models.py`, `continuity.py`, `store.py` (atomic save), `main.py`, `auth.py` | High |
| Write 51-test suite: `test_acceptance.py`, `test_api.py`, `test_store.py`, `test_auth.py` | High |
| Bump `pyproject.toml` → 0.2.0, description | Medium |
| Verify `README.md`, `SECURITY.md`, `docs/scorecards/` use Drive-G-1/G-2 language | Medium |
| Legacy migration on load (old `category`/`truth_status` rows) | Medium |
| Do NOT claim CCS, HA, or multi-tenant as enforced | Mandatory |

> **Sage counsel (from Architect):** Prove Continuity + Conflict tests first; then CI; then optional auth; then Docker. Leave CCS docs **declared**. Fix inline import in `get_memory` when porting.
