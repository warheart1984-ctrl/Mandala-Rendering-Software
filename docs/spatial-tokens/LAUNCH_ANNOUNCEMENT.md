# Launch announcement — HoloRT4D Spatial Tokens (scaffold)

**Headline:** LLMs have a brain. Give them eyes.

Today we ship the **HoloRT4D Spatial Token** scaffold: a deterministic `HoloRT4D-Spatial-V1` grid that turns depth, curvature, and surface normals into something an LLM can reason over — and hash for replay.

## What’s real on day one

- **Enforced:** Tokenize Float32 depth from chamber / opticalLength / landmark-z into 8×8 or 16×16 cells with curvature + normals; SHA-256 of canonical JSON.
- **Partial:** Face region labels, motion from previous depth, FastAPI stub.
- **Declared / skeleton:** `$1` billing field, marketing site, API client, photo→metric depth without ML.

## What we are not claiming

Arbitrary photo in → photoreal metric depth out **without ML** is **not** shipping. Prefer Mandala depth evidence.

## Try it

```bash
node scripts/holort4d-tokenize.mjs --synthetic 64 --resolution 16
```

Docs: `docs/spatial-tokens/`. Landing: `mrs/apps/spatial-tokenizer/web/index.html`.
