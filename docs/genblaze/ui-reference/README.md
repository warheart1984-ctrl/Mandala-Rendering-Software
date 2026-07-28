# Genblaze UI reference (static SPA)

> **Status:** **declared** reference — Genblaze ships a **static** `index.html`, not a React app.
> Do not invent `src/` React trees for production UI.

## Live host

`mrs/apps/genblaze-media/app/static/index.html`

## Sections (honest labels)

| Section | Anchor | Notes |
|---------|--------|-------|
| BYOK Quickstart | `#byok-quickstart` | Steps only |
| Settings · Local BYOK | `#byok-settings` | sessionStorage key + model |
| Model Marketplace | `#model-marketplace` | Catalog disclosure, not live inventory API |
| Compliance Badge | `#compliance-badge` | From `/health.byok` + session — not a certification |
| Capability Registry Browser | `#capability-registry` | `/health` availability disclosure |

## Docs

- `docs/genblaze/operators/user-onboarding-guide.md`
- `docs/genblaze/operators/operator-training-manual.md`
- `docs/genblaze/security/byok-security-charter.md`
