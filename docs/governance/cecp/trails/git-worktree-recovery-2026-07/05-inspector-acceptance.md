# 05 — Inspector Acceptance

| Field | Value |
|-------|-------|
| Stage | Inspector |
| Modes | Librarian + Debugger |
| Verdict | **PASS_WITH_GAPS** |

## Probe matrix

| # | Probe | Result | Evidence |
|---|-------|--------|----------|
| 1 | `git worktree list` count | **PASS** | **4** registered |
| 2 | GE Content non-reparse | **PASS** | Path `unreal/GovernedUnrealProject/Plugins/GovernedEngine` — Attr=`Directory, Compressed`, Reparse=False; `Content/` True *(initial Inspector path typo corrected by foreman re-probe)* |
| 3 | CECP ancestors | **PASS** | `046d187`, `244b32f`, `7483b19` → `merge-base --is-ancestor` exit 0 |
| 4 | Stash retained | **PASS** | `stash@{0}` rescue/wip-before-clean-worktree |
| 5 | Rescue branches | **PASS** | `rescue/cecp-046d187-backup`, `rescue/main-docker-wt`, `rescue/wip-pre-junction-fix` |
| 6 | `G:/mrs-wt` Docker home | **PASS** | `rescue/main-docker-wt...origin/main`; Dockerfile present; Docker daemon 29.6.1 |
| 7 | Archive | **PASS** | `G:/_mrs-archive/git-worktree-recovery-2026-07` — **14** children |
| 8 | pr80 leftover | **GAP** | Empty dir exists; not registered; Remove-Item locked by another process |
| 9 | Root `New folder-*` orphans | **PASS** | count 0 |

## Gaps

1. `.worktrees/pr80-resolve` — close when Cursor/process lock clears.
2. Unpushed feat tip (ahead 21) — operator may `git push -u origin HEAD` (no force).

## Claim correction

Primary GE path is `unreal/GovernedUnrealProject/Plugins/GovernedEngine` (not repo-root `GovernedEngine`). Layout restored; Unreal runtime still **not** claimed enforced.
