# HoloRT4D Spatial Tokenizer (API stub)

CPU-only FastAPI scaffold for `POST /v1/spatial-tokenize`.

| Capability | Status |
|------------|--------|
| Depth grid → Spatial-V1 token (via Node CLI) | **enforced** (math core) |
| API / OpenAPI surface | **partial** |
| Billing `$1`/call | **declared** (not charged) |
| `image_base64` → metric depth | **declared** |

## Run

```bash
cd mrs/apps/spatial-tokenizer
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8792
```

Health: `GET http://localhost:8792/health`

## Prefer CLI for local determinism

```bash
node scripts/holort4d-tokenize.mjs --depth-bin path/to/depth.f32.bin --width 64 --height 64
```
