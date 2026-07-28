# 01 — Architect ADR: Genblaze BYOK 1A

**Decision:** Session-only BYOK (`sessionStorage`), stills+assist scope, local-only default (hosted requires `GENBLAZE_ALLOW_BYOK=1`).

**Rationale:** Matches GPU-assist constitution — keys never become print SoT; hosted key-proxy risk avoided; paid NIM models work when the *user's* key allows them.

**Non-goals:** Server-side key vault, video/polish BYOK, React SPA rewrite.
