# Trail: git-worktree-recovery-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `git-worktree-recovery-2026-07` |
| Feature | Windows git worktree / orphan-tree recovery |
| RequestedBy | Operator (Gordon ~20 trees report) |
| Started | 2026-07-27 |
| Lineage | Architecture → Build → Implementation → Review → Inspection → ESFR |
| OverallStatus | **partial** (ops hygiene enforced for probes; Unreal runtime not claimed) |
| Protocol | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| Modes | Navigator, Debugger, Code-Historian, Boundary-Guardian, Librarian |

## Operator homes (after recovery)

| Role | Path | Branch / tip |
|------|------|----------------|
| **CECP / feature work** | `G:/Mandala Rendering Software` | `feat/engine3d-genblaze-cinematic-plugin` @ `c8bd350` (ahead 22; includes CECP `046d187`+) |
| **Docker / Gordon main** | `G:/mrs-wt` | `rescue/main-docker-wt` → `origin/rescue/main-docker-wt` @ `e95a419` (**pushed**) |

## Stage index

| # | File | Role |
|---|------|------|
| 00 | `00-evidence-inventory.md` | Tip-capture / dispositions |
| 01 | `01-architect-adr.md` | Architect + Navigator/Debugger |
| 02 | `02-builder-scaffold-manifest.md` | Builder checklist |
| 03 | `03-implementor-notes.md` | Implementor execution log |
| 04 | `04-reviewer-conformance.md` | Reviewer + Boundary-Guardian |
| 05 | `05-inspector-acceptance.md` | Inspector + Librarian |
| 06 | `06-engineer-standards.md` | ESFR ship gate |
| 07 | `07-post-recovery-followup.md` | Docker cwd / Genblaze build / pr80 lock / push status |

## Counts (evidence)

| Metric | Before | After |
|--------|--------|-------|
| Registered `git worktree list` | 7 | **4** |
| Orphan dirs (disk, not registered) | 13 | **0** (archived) |
| Gordon “~20 trees” | ≈20 | **4 registered** (+1 locked leftover dir `pr80-resolve`) |
| Archive | — | `G:/_mrs-archive/git-worktree-recovery-2026-07/` (14 entries) |

## Hard bans observed

- No force-push
- No `git config` user identity changes
- CECP commits retained as ancestors of feat tip; rescue refs kept
