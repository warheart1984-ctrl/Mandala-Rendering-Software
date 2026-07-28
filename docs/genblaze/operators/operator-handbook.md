# Genblaze Operator Handbook

**Artifact:** `docs/genblaze/operators/operator-handbook.md`  
**Status:** Operational · Constitutional

## Section 1 — Operator Responsibilities

Operators must:

- Protect user secrets
- Maintain local-first posture
- Enforce assist-only GPU/NIM domain
- Preserve CPU RT4D sovereignty
- Avoid key proxying unless explicitly enabled (`GENBLAZE_ALLOW_BYOK=1`)

## Section 2 — Deployment Modes

### Local Mode (Recommended)

- BYOK allowed on loopback without flag
- Full model freedom (subject to user’s key)
- Ideal for paid NIM models
- UI: Settings · Local BYOK

### Hosted Mode

- BYOK disabled by default
- Enable only with `GENBLAZE_ALLOW_BYOK=1`
- Warn users about XSS risk
- Avoid becoming a multi-tenant key proxy

## Section 3 — Operational Workflow

1. User loads Genblaze → enters key (session only).
2. User selects model override (session only).
3. User generates → Genblaze → NIM → assist-only output.
4. SceneSpec / CharacterSpec hints (assist-only).
5. Human curation → RT4D / Digital Printer print (CPU SoT; no secrets).

## Section 4 — Constitutional Violations (Forbidden)

Operators must never:

- Store user BYOK keys in Git / B2 / durable vaults
- Log user keys
- Proxy user keys on hosted without `GENBLAZE_ALLOW_BYOK=1`
- Route GPU/NIM beauty into print SoT
- Allow NIM output into Digital Printer evidence as SoT
- Persist model overrides server-side as BYOK state
