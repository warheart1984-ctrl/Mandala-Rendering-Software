# BYOK Rules

1. BYOK keys must be stored in sessionStorage only — never localStorage or cookies.
2. Keys must never be logged, persisted to disk, or written into Digital Printer / evidence SoT.
3. Keys may be sent **only** on Genblaze stills + assist API calls (UI → Genblaze → NVIDIA NIM).
   They must never be treated as Digital Printer SoT inputs.
4. Hosted BYOK must respect `GENBLAZE_ALLOW_BYOK=1` (opt-in). Without the flag, hosted Render
   rejects per-request keys; local loopback Genblaze may honor session BYOK.
5. Model override should soft-check against the disclosed catalog (warn when unknown); hard
   reject is not required when the catalog is disclosure-only.
6. Authorization for NIM may use `X-NVIDIA-API-Key` and/or `Authorization: Bearer <session key>`.
7. Video and polish routes must reject BYOK headers with HTTP 400 (stills+assist scope only).
