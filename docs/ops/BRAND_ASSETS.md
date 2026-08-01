# Governed Brand Assets

Status: **partial** — manifest, route, asset hash check, and plugin wiring exist.

## MRS brand profile

Canonical app manifest:

- `mrs/apps/genblaze-media/app/static/assets/mrs-brand.json`

Public route:

- `/brand/mrs.json`

Primary logo:

- `/assets/mrs-logo.png`

The profile records:

- `brandId`
- `themeProfileVersion`
- logo `assetId`
- logo `version`
- logo path and public URL
- logo width / height / MIME type
- logo SHA-256
- `lastVerified`

## Rule

UI, plugin manifests, generated media receipts, and docs should reference the brand profile when they need MRS identity metadata. Do not duplicate logo hashes or theme versions in downstream artifacts unless they are copied from this manifest.

## Current verification

`tests/test_chatgpt_plugin.py` checks that `/brand/mrs.json` points at `/assets/mrs-logo.png` and that the manifest SHA-256 matches the actual served PNG bytes.
