# 02 — Builder Scaffold Manifest

| Field | Value |
|-------|-------|
| Stage | Builder |
| Status | **declared** (stubs executed by Implementor) |

## Scaffold deliverables

| Path | Role |
|------|------|
| `00-evidence-inventory.md` | Tip-capture tables |
| `02-builder-scaffold-manifest.md` | This checklist |
| Phases A–D | Tip-capture → prune → archive → verify |

## Ordered phases (summary)

1. **A Tip-capture** — record SHAs, stash, rescue refs; classify KEEP/PRUNE/INVESTIGATE/ARCHIVE.
2. **B Prune registered** — broken b2-ops; redundant trees with tips on remotes/feat.
3. **C Archive orphans** — move to `G:/_mrs-archive/git-worktree-recovery-2026-07/` (prefer move over delete).
4. **D Verify** — `git worktree list`, CECP ancestors, GE non-reparse, no force-push.

## Bans (Builder)

No destructive git in Builder stage; no force-push stubs as defaults; no `--force` remove without tip-capture row.
