# 06 — Engineer Standards (ESFR)

| Field | Value |
|-------|-------|
| Stage | ESFR / Engineer Standards |
| Trail | `git-worktree-recovery-2026-07` |
| InspectorVerdict | **PASS_WITH_GAPS** |
| ESFRVerdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |

## Scope

Ops / worktree recovery trail only — not a product feature ship. Matrix rows for BRDF/API/product CI are **N/A**.

## Standards report (A–E abbreviated)

| Area | Outcome | Note |
|------|---------|------|
| A Claim honesty (Drive-G-1) | **PASS_WITH_GAPS** | GE = layout fix **partial**; no Unreal runtime-enforced claim |
| B Maturity wording (Drive-G-2) | **PASS** | Operator readiness improved; not commercial “production ready” |
| C Ops / Docker path | **PASS** | `G:/mrs-wt` clean short path; daemon reachable |
| D Git safety | **PASS** | No force-push; no identity config; CECP ancestors intact |
| E Trail completeness | **PASS** | Stages 00–06 + README present |
| CHEA/CCR/CDGF | **declared** | Not exercised |
| Sparse Unreal exclude | **N/A** | Content present; sparse-exclude not required |

## Test-matrix (ops subset)

| Category | Result |
|----------|--------|
| Worktree count hygiene | PASS (4 registered) |
| Orphan archive | PASS (14 archived) |
| CECP tip reachability | PASS |
| GE non-reparse | PASS (correct plugin path) |
| pr80 leftover | GAP |
| Push sync | GAP (ahead 21; no push per user) |

## Probes 01–08 (ops mapping)

| Probe | Mapping | Result |
|-------|---------|--------|
| 01 inventory | worktree list before/after | PASS |
| 02 tip capture | 00 inventory | PASS |
| 03 lineage | CECP ancestors + rescue refs | PASS (**declared** CHEA N/A) |
| 04 determinism | recorded SHAs / commands | PASS |
| 05 sovereignty | mrs-wt main home; no force-push | PASS |
| 06 docker path | mrs-wt + daemon | PASS |
| 07 leftover lock | pr80 | GAP |
| 08 claim tags | anti-overclaim in 04/05 | PASS |

## Gaps accepted

1. Empty locked `.worktrees/pr80-resolve` (unregister already done).
2. Feat branch **21** commits ahead of origin — push only when user asks (lease OK; never force).

## Promotion

**PROMOTE_WITH_GAPS** — operator may continue CECP from primary tip and Docker Gordon from `G:/mrs-wt`. Do not claim full orphan eradication until pr80 dir removed.
