# 00 — Evidence Inventory

| Field | Value |
|-------|-------|
| Operator | CECP crew Implementor |
| Measured | 2026-07-27 |
| Force-push used? | **NO** |
| Stash drop used? | **NO** |
| Status | **partial** (filled from execution) |

## A. KEEP

| Path | Branch | SHA | Notes |
|------|--------|-----|-------|
| `G:/Mandala Rendering Software` | `feat/engine3d-genblaze-cinematic-plugin` | `fe01183` | Live tip; ancestors include `046d187`, `244b32f`, `7483b19` |
| `G:/mrs-wt` | `rescue/main-docker-wt` | `e95a419` | Tracks `origin/main`; Docker Gordon path |

Rescue refs retained: `rescue/cecp-046d187-backup`, `rescue/wip-pre-junction-fix`, `rescue/main-docker-wt`.

Stash retained: `stash@{0}` `rescue/wip-before-clean-worktree 20260727-2331`.

## B. PRUNE_REGISTERED

| Path | Tip | Disposition | Evidence |
|------|-----|-------------|----------|
| `G:/New folder-b2-ops` | `d20dfca` (on `origin/ops/b2-free-tier-demo-playbook`) | **PRUNED** | `.git` → dead `G:/New folder/...`; `worktree remove` failed validation; manual delete of `.git/worktrees/New-folder-b2-ops` + disk tree archived |

## C. INVESTIGATE

| Path | Tip | Decision | Rationale |
|------|-----|----------|-----------|
| `.worktrees/cecp-docker-rebase` | `b4d1505` | **PRUNED** | Ancestor of feat tip; `git worktree remove --force` OK |
| `.worktrees/pr80-resolve` | `6d1a569` | **UNREGISTERED** / dir **locked** | Tip on origin/feat; admin gone; leftover dir file-locked (GAP) |
| `.worktrees/fix-main-docker-merge` | `717e394` | **KEEP** | Remote branch present |
| `.worktrees/fix-worldgen-exports` | `9cbf29a` | **KEEP** | Remote branch present |

## D. ARCHIVE_ORPHAN (13 → archived)

All pointed at dead `G:/New folder/.git/worktrees/*` except `_rt4d-bench` (no `.git`). Moved to `G:/_mrs-archive/git-worktree-recovery-2026-07/`:

chatgpt-mcp-png, fix-zod-schema-dep, rt4d-lattice-timeout, rt4d-to-nvidia, New folder-nim-poll, New folder-test-coverage, New folder-wt-multipart, New folder-wt-ui-post, New folder-wt-webgpu-readback, _mrs-rt4d-lattice, _mrs-rt4d-rings, _mrs-rt4d-rings2, _rt4d-bench (+ New folder-b2-ops).

## E. GE Content

Path `unreal/GovernedUnrealProject/Plugins/GovernedEngine`: real directory (not reparse); `Content/` present. Earlier junction to missing `G:\New folder\unreal\GovernedEnginePlugin` removed and tree restored from git. Unreal plugin runtime remains **not** claimed enforced.
