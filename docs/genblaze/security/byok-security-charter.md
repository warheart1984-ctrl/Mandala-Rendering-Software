# BYOK Security Charter

**Artifact:** `docs/genblaze/security/byok-security-charter.md`  
**Status:** Constitutional · Binding · Local‑First  
**Trail:** `docs/governance/cecp/trails/genblaze-byok-session-2026-07/`  
**Implementation:** `mrs/apps/genblaze-media/app/byok.py` (**enforced** in unit tests)

## Drive-G-1 transmission honesty

Keys leave the browser only to the **local Genblaze process** (loopback) or to a hosted Genblaze instance when `GENBLAZE_ALLOW_BYOK=1`. That process then calls NIM. This is not browser→NIM direct; it is also not a multi-tenant key proxy by default (hosted BYOK off).

## Article I — Purpose

Define the constitutional rules governing Bring‑Your‑Own‑Key (BYOK) usage within Genblaze, ensuring user secrets remain sovereign, local, and never enter the Digital Printer or evidence chain.

## Article II — Key Storage Requirements

1. Keys must be stored only in `sessionStorage` (browser tab lifetime).
2. Keys must never be written to:
   - disk (by Genblaze app code)
   - logs
   - B2
   - Git
   - durable server environment files as a BYOK store
   - Digital Printer evidence SoT
3. Keys must never be accepted on hosted Genblaze unless explicitly enabled by operator flag `GENBLAZE_ALLOW_BYOK=1`.

## Article III — Transmission Requirements

1. Keys may only be transmitted:
   - Genblaze UI → **local Genblaze** (loopback) → NIM endpoint, or
   - Genblaze UI → hosted Genblaze **only if** `GENBLAZE_ALLOW_BYOK=1` → NIM
   - via HTTPS to NIM (or HTTP only on loopback Genblaze)
   - with headers:
     - `Authorization: Bearer <key>`
     - `X-NVIDIA-API-Key: <key>`
2. Keys must never be transmitted:
   - into Digital Printer / `cpu.rt4d.print` evidence bundles
   - into GPU integrator parity harness as print SoT
   - into SceneSpec / CharacterSpec **persisted evidence** (assist artifacts may exist without keys)
   - to unrelated internal services as a shared vault

## Article IV — Model Override Rules

1. Users may override model ID per request.
2. Model override must be local-only (`sessionStorage` / request header `X-Genblaze-Model`).
3. Model override must never be persisted server-side as BYOK state.
4. Paid models may be used only if the user’s key grants access.

## Article V — Hosted Deployment Rules

1. Hosted Genblaze must default to BYOK disabled.
2. Enabling BYOK requires explicit operator intent: `GENBLAZE_ALLOW_BYOK=1`.
3. Hosted Genblaze must warn users that keys may be exposed to browser XSS.

## Article VI — Constitutional Guarantees

1. BYOK must never compromise compute sovereignty.
2. BYOK must never override determinism boundaries.
3. BYOK must never route GPU output into print mode as SoT.
4. BYOK must never enter the Digital Printer evidence chain.
