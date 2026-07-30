# Replay / regression reference for CKO-0001

**Status:** skeleton (NOT FROZEN)

`python aiki/pipeline/cli.py replay CKO-0001` reconstructs a semantic checklist from the CKO + content paths. This folder documents what freeze will require.

## Expected hash files (after publish freeze)

Same set as `archive/published/CKO-0001/`:

- `cko.hash`
- `script.hash`
- `narration.hash`
- `visuals.hash`
- `video.hash`
- `pipeline-version.txt`

## Checklist (pre-freeze)

See [`checklist.json`](checklist.json). All critical inputs should exist; hash files should be absent until freeze.

## How this relates to validators

`python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001` exits 0 with **NOT FROZEN** while hashes are missing, after structure checks pass. Once hashes exist, the gate becomes fail-closed for missing/mismatched provenance (semantic MVP).
