# AIKI Reproducibility Charter (RBC-0001)

**Status:** **declared** (not **enforced** until CKO-0001 publish freeze)  
**Contract ID:** RBC-0001  
**Reference object:** CKO-0001 — Research Decoded: LLM Evaluation Basics  
**Constitutional authority:** [AIKI Constitution v0.1](./CONSTITUTION.md) — **Article III (The Reproducibility Contract)** expanded here

This charter is the operational expansion of Constitution Article III. Prefer the Constitution for mission and governance; prefer this document for hashes, CLI commands, freeze procedure, and merge policy.

## Constitutional milestone

CKO-0001 is the first fully published Knowledge Object whose video is live on YouTube. It becomes the permanent reference object for AIKI.

**Invariant:** Every improvement to AIKI must be validated by asking:

> Can CKO-0001 still be reproduced from the repository?

This is a governance rule, not a suggestion.

## Reproducibility contract

### Deterministic input

CKO-0001 must contain (or reference) all information required to regenerate:

- Script
- Narration plan (recorded voice for MVP; TTS optional later)
- Visual plan
- Final video metadata
- Thumbnail reference
- Editing timeline structure

### Deterministic pipeline (replay mode)

```text
python aiki/pipeline/cli.py replay CKO-0001
```

Must reconstruct script, narration plan, visuals plan, and timeline checklist from the CKO + archive. Output target for MVP: **semantic equivalence** (not bitwise media identity).

### Immutable provenance

After publish freeze, `archive/published/CKO-0001/` must include:

| Artifact | Purpose |
|----------|---------|
| `cko.hash` | Hash of CKO YAML |
| `script.hash` | Hash of frozen script |
| `narration.hash` | Hash of narration audio or transcript |
| `visuals.hash` | Hash of visual plan |
| `video.hash` | Hash of final video file |
| `pipeline-version.txt` | Pipeline semver used |

### Versioned pipeline

`config/pipeline.yaml` carries `pipeline_version: X.Y.Z`.

- **Patch:** bugfix that preserves CKO-0001 semantics
- **Minor:** additive stage / optional field
- **Major:** breaking change to CKO schema or replay contract

### Merge policy (declared intent)

When CKO-0001 is frozen:

```text
python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
```

must pass before merge. Until freeze, the test reports **not frozen** and exits successfully after structure checks only.

## Media nondeterminism

MVP uses **recorded voice** and **template-based** visual planning. Bitwise-stable video is **not** required in v0.1. Semantic checks verify required fields, referenced paths, and hash presence after freeze.

## Activation

RBC-0001 becomes active after:

1. First video is live on YouTube
2. CKO-0001 is frozen
3. Provenance artifacts are written
4. Reproducibility test passes against frozen hashes
5. Pipeline version is locked in the archive entry
