# 01 — Architect ADR

| Field | Value |
|-------|-------|
| Stage | Architect |
| Modes | Navigator (Actor) + Debugger (Software-Creation) |
| Status | **declared** plan → executed under Implementor |

## Intent

Stabilize git worktree topology after Gordon reported ~20 trees; recover so CECP commits and Docker/main ops work without force-push or identity config changes.

## ADR decision

**Two operator homes:** (1) primary repo for CECP feat tip; (2) `G:/mrs-wt` for Docker/`origin/main`.

**Root cause (Debugger):** `GovernedEngine` was a broken **junction** to missing `G:\New folder\unreal\GovernedEnginePlugin` (fixed earlier this session). Orphan dirs were checkouts whose `.git` pointed at dead parent `G:/New folder/.git/worktrees/*`. Broken registration `G:/New folder-b2-ops` poisoned `git worktree list`.

**Decision:** KEEP primary + `mrs-wt`; PRUNE_REGISTERED broken b2-ops; INVESTIGATE then prune redundant registered trees whose tips are on remotes/feat lineage; ARCHIVE_ORPHAN the 13 dead-parent leftovers to `G:/_mrs-archive/...`.

**Rejected:** nuke/reclone; force-push; re-register all orphans; claim Unreal plugin runtime-enforced.

## Constitutional boundary

| In | Out |
|----|-----|
| Worktree registration, orphan archive, tip preservation, trail docs | Product features, charter/policies/`AGENTS.md`, force-push, Unreal runtime claims |

## Path classification (executed)

See `00-evidence-inventory.md`.

## Acceptance criteria

See Inspector `05-inspector-acceptance.md`.

## Handoff

Builder → Implementor → Reviewer → Inspector → ESFR.
