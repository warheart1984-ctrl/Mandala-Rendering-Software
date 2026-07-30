# Maturity Scorecard — `aiki`

**Drive-G-2 scorecard**  
**Canonical standard:** [`G:\docs\governance\DriveG_MaturityDimensionsStandard.md`](file:///G:/docs/governance/DriveG_MaturityDimensionsStandard.md)  
**Template:** [`G:\docs\governance\MATURITY_SCORECARD_TEMPLATE.md`](file:///G:/docs/governance/MATURITY_SCORECARD_TEMPLATE.md)

---

## Snapshot

| Field | Value |
|-------|-------|
| Project ID | `aiki` |
| Repository path | `G:\Mandala Rendering Software\aiki` |
| Review date | 2026-07-30 |
| Reviewer | Agent session (Dar-z ↔ Jon architectural alignment capture) |
| Evidence anchor | Binding docs + `pipeline/` + `examples/CKO-0001/` (no v1.0 constitutional E2E yet) |

---

## Dimension ratings

| Dimension | Rating | One-line justification |
|-----------|--------|------------------------|
| Constitutional model | Early | Constitution v0.1 + Formation Record + ACIPS/ACIRA/AIRS binding are **declared**; no ACIPS freeze or runtime constitution gate |
| Governance methodology | Early | Drive-G-1 tags, Lineage preference documented; no promotion CI for AIKI standards |
| Reference implementation | Early | CKO pipeline CLI / replay / stub IPI exist (**skeleton** / **partial**); v1.0 nine-slot runtime **roadmap** |
| Platform engineering | Not started | No durable multi-tenant deploy, auth, or production ops surface claimed |
| Commercial operations | Not started | No signup / billing / self-serve |

---

## Evidence by dimension

### Constitutional model

- **Claims:** Layer model ACIPS / ACIRA / AIRS / Studio; Formation before canon; narrow v1.0 scope.
- **Evidence:** `docs/architecture/ACIPS_ACIRA_AIRS_BINDING.md`, `docs/formation/AIKI_FORMATION_RECORD.md`, `docs/charter/CONSTITUTION.md`
- **Gaps / deferred:** Frozen ACIPS/ACIRA/AIRS standard texts; runtime gates.

### Governance methodology

- **Claims:** Evidence-bound status tags; Lineage `ls-*` preferred over Mandala `mrs-crew` for AIKI work.
- **Evidence:** Binding doc §6; Drive-G laws; this scorecard.
- **Gaps / deferred:** Formal promotion packets / conformance suite (**roadmap**).

### Reference implementation

- **Claims:** Educational CKO scaffold with CLI replay/validators; IPI stubs.
- **Evidence:** `pipeline/cli.py`, `pipeline/validators/reproducibility/`, `examples/CKO-0001/`, `docs/vision/AIKI_V0.1.md`
- **Gaps / deferred:** v1.0 constitutional creative demonstrator (ontology → publish) not implemented.

### Platform engineering

- **Claims:** None beyond local/repo tooling stubs.
- **Evidence:** `infra/` README stubs.
- **Gaps / deferred:** CI durability, deploy, observability.

### Commercial operations

- **Claims:** None.
- **Evidence:** N/A
- **Gaps / deferred:** Entire commercial surface.

---

## Audience readiness

| Audience | Assessment | Notes |
|----------|------------|-------|
| Operators (deploy & run) | Not ready | Local scaffold only; reproducibility **not enforced** pre-publish-freeze |
| Users (signup & self-serve) | Not ready | Not claimed |

---

## Overall framing (required)

> **This project is** early **at the constitutional layer** (declared Formation + layer vocabulary; Constitution v0.1 for educational knowledge), and not started **at the platform/commercial layer.** A thin CKO pipeline skeleton exists; it is not the v1.0 constitutional creative runtime.

---

## Non-claims (explicit)

- [x] Not “ACIPS/ACIRA/AIRS enforced”
- [x] Not “production constitutional creative SaaS”
- [x] Not “CKO-0001 reproducibility enforced” (see RBC-0001)
- [x] Not merged with Sovereign X CCS or Mandala engine constitution
- [x] No hardware / photonic / quantum enforcement

---

## Verification commands

```bash
# From MRS repo root (when Python env available):
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
python aiki/pipeline/validators/reproducibility/test_CKO-0001.py
```

Expect: scaffold behavior; do **not** treat pass/fail as ACIPS conformance.

---

## Changelog

| Date | Change | Reviewer |
|------|--------|----------|
| 2026-07-30 | Initial scorecard after architectural alignment capture | Agent session |
