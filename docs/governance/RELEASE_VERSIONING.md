# Release versioning convention

**Status:** **partial** — scripts + docs; not a full release automation factory.

## Sources of truth

| Artifact | Field | Role |
|----------|-------|------|
| `release.json` | `version` | **Product release SoT** for bump scripts |
| `release.json` | `rendererCoreVersion` / `engine3dCoreVersion` | Package alignment fields (must match `version` unless intentionally split — currently kept equal) |
| Root `package.json` | `version` | npm workspace root; must match `release.json` |
| `mrs/packages/renderer-core/package.json` | `version` | Must match `release.rendererCoreVersion` |
| `mrs/packages/engine3d-core/package.json` | `version` | Must match `release.engine3dCoreVersion` |
| `engine/constitution/charter.js` | `CHARTER.version` | Constitutional machine SoT — **protected**; sync only with explicit flag |

Do **not** treat README marketing strings or CECP trail titles as version SoT.

## Commands

```bash
# Fail if versions disagree (read-only)
npm run release:check

# Allow charter drift temporarily (docs/CI experiments only)
npm run release:check -- --allow-charter-drift

# Preview a bump (no writes)
node scripts/release-version.mjs patch --dry-run

# Apply bump to release.json + package.json files (no git commit/tag)
node scripts/release-version.mjs patch

# Also sync protected charter.js (explicit authorization required)
node scripts/release-version.mjs patch --sync-charter
```

After a bump:

1. `npm run release:check`
2. Update `CHANGELOG` / trail notes if shipping a named release
3. Operator creates git tag `vX.Y.Z` and pushes when ready

## What the bump script will not do

- No `git commit`, `git tag`, or `git push`
- No silent charter edits without `--sync-charter`
- No GitHub Release API calls (optional future `release.yml` may document tag-driven publish only)

## Optional CI

Root CI may add a `release-check` job that runs `npm run release:check`. Tag-and-release workflows remain **declared** until an operator lands `.github/workflows/release.yml`.

## Drive-G-1

Passing `release:check` proves version **string alignment**, not product maturity or constitutional enforcement completeness.
