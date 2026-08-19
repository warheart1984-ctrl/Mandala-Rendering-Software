# governed-render — studio trial + hosted governed-render API

Deterministic 4D stills and movies wrapped in **FMCE constitutional governance**
(evidence chain, authority tokens, D2 determinism, replay verification) and
metered through a **credit-based pricing API**.

**Honest scope.** This is NOT text-to-image and NOT diffusion. A prompt selects a
procedural scene archetype + palette; a seed drives deterministic variation. Output
is a byte-identical, replayable path-traced render. FMCE does not judge aesthetics —
it records a constitutional decision + evidence entry per artifact so a studio can
prove *what was rendered, with which seed, and that it replays identically*.

---

## 1. Run the studio trial locally

Requirements: Node 20+, and `ffmpeg` on PATH for movies (stills need none).

```bash
cd governed-render
npm run trial
```

This renders a governed still + a governed movie and writes to `output/trial/`:

```
output/trial/
  still.png              # 256x256@16 governed still
  still-record.json      # full FMCE record (evidence, replay, D-class)
  movie-record.json      # movie record (frame seeds, movieHash, replay)
  frames/                # deterministic frame PNGs
  movie.mp4              # h264 encode (if ffmpeg present)
```

What a studio sees in `still-record.json`:

- `provenance` — seed, scene, camera, sha256, exposure stats, invariant check
- `evidence` — evidenceId + checksum + full FMCE chain (decision, authorityToken)
- `replay` — re-render produced a **byte-identical sha256** (`verified: true`)
- `constitution` — `D2 / PASS`, decision `authorize`

Determinism guarantee: same prompt + seed + size + samples ⇒ same PNG, forever.

---

## 2. Hosted governed-render API

Pure Node HTTP server, zero dependencies.

```bash
GOVERNED_RENDER_KEYS='[{"key":"demo-0001","tier":"trial"}]' npm start
# or:  node src/server.mjs
```

### Endpoints

| Method | Path                  | Purpose                                    |
|--------|-----------------------|--------------------------------------------|
| GET    | `/health`             | service status + ffmpeg availability       |
| GET    | `/pricing`            | pricing tiers + credit model               |
| POST   | `/v1/render`          | submit a governed render job               |
| GET    | `/v1/jobs/:id`        | job record (evidence, replay, D-class)     |
| GET    | `/v1/jobs/:id/media`  | rendered PNG / MP4                         |
| GET    | `/v1/jobs/:id/record` | record JSON only                           |

### Submit a render

```bash
curl -s -X POST http://localhost:8080/v1/render \
  -H "X-API-Key: demo-0001" \
  -H "content-type: application/json" \
  -d '{"prompt":"cyan tesseract lattice","seed":20260816,"width":256,"height":256,"samples":16,"format":"still"}'
```

For a movie:

```bash
curl -s -X POST http://localhost:8080/v1/render \
  -H "X-API-Key: demo-0001" \
  -d '{"prompt":"emissive quads","width":160,"height":160,"samples":8,"format":"movie","frames":24,"fps":12}'
```

Response: `{ ok, jobId, status, cost, remainingCredits, record, mediaPath }`.
Poll `GET /v1/jobs/:jobId` and fetch media from `GET /v1/jobs/:jobId/media`.

Anonymous requests (no key) are metered as `trial` tier.

### Auth & metering

- Keys are provisioned via `GOVERNED_RENDER_KEYS` env (JSON: `[{"key":"...","tier":"trial"}]`)
  or `data/keys.json`. Unknown keys fall back to `trial`.
- **Credits**: `ceil(width × height × samples / 1,000,000)` per render.
  A 448×448@24 still = 5 credits; a 160×160@8 frame = 1 credit.
- Per-month cap per tier (`pricing.json`). Ledger persists to `data/ledger.json`.
- Over-cap renders return `402 insufficient_credits`.

### Pricing tiers (see `pricing.json`)

| Tier   | $/mo | credits/mo | max size     | max samples | max movie |
|--------|------|-----------|--------------|-------------|-----------|
| trial  | 0    | 25        | 448×448      | 24          | 30f@12fps |
| studio | 149  | 1,000     | 1024×1024    | 64          | 240f@24fps|
| pro    | 499  | 5,000     | 2048×2048    | 256         | 1200f@60fps|

---

## 3. Deploy to Render

1. Push this repo to GitHub.
2. Render → New → Blueprint, point at the repo. The included `render.yaml`
   provisions the `governed-render` web service (Node 22, health check `/health`).
3. Set the `GOVERNED_RENDER_KEYS` secret env var in the Render dashboard
   (e.g. `[{"key":"demo-0001","tier":"trial"}]`).
4. Deploy. The `/pricing` and `/health` routes are public; render jobs require a key.

---

## Layout

```
governed-render/
  package.json
  pricing.json          # tiers + credit model
  render.yaml           # Render blueprint
  README.md
  src/
    core.mjs            # governed still/movie rendering + FMCE evidence + replay
    cli.mjs             # studio trial CLI
    server.mjs          # hosted HTTP API + metering
  output/               # rendered artifacts (git-ignored)
  data/                 # ledger + keys (git-ignored)
```
