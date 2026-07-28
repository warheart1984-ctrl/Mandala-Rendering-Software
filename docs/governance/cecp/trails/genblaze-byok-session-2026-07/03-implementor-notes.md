# 03 — Implementor notes

Implemented FastAPI request-scoped settings via `dataclasses.replace` (key + model). Headers: `X-NVIDIA-API-Key`, `Authorization: Bearer`, `X-Genblaze-Model`. Face Creation CLI inherits `NVIDIA_API_KEY` / `GENBLAZE_IMAGE_MODEL` in subprocess env from effective settings. Static UI uses `byokHeaders()` on stills/assist fetches. Video generate returns 400 if BYOK headers present.
