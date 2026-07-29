# 08 — Storyforge E2E ownership ADR

| Field | Value |
|-------|-------|
| Status | **enforced** (ownership boundary) |
| Date | 2026-07-29 |
| Predecessor | `storyforge-runtime-boundary-2026-07` |

## Decision

**StoryForge owns** end-to-end producer flow: Story → Scene → Shot → RenderIntent → PromptComposer → immutable PromptSpec → IModelBackend → **RenderRequest**.

**MRS owns** crossing at RenderRequest → Engine3D / RT4D / proton / provenance → **RenderResult** only.

## E2E scope

| Layer | Owner | MRS evidence |
|-------|-------|----------------|
| SF producer E2E (PromptSpec → RenderRequest) | **StoryForge** | **declared** — not implemented in this repo |
| MRS RenderRequest → RenderResult | **MRS** | **partial** — `mrs/adapters/storyforge-boundary/`, `POST /api/render-request` opt-in |
| 4D full run (MRS side) | **MRS** | **enforced** — `storyforge-4d-full-run-2026-07` |

## Consequences

- Do not add PromptComposer, RenderIntent mutation, or SF timeline UI inside MRS without explicit charter change.
- MRS pytest/E2E for Storyforge = boundary schema tests + optional RenderRequest pipeline only.
- Marketing/docs must label SF upstream E2E as **SF-owned / declared**.

## References

- `mrs/adapters/storyforge-boundary/BOUNDARY.md`
- `docs/governance/cecp/trails/storyforge-runtime-boundary-2026-07/01-architect-adr.md`
