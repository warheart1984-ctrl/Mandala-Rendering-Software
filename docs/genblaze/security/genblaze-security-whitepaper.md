# Genblaze Security Whitepaper

**Artifact:** `docs/genblaze/security/genblaze-security-whitepaper.md`  
**Status:** Constitutional · Binding · Local‑First

## Executive Summary

Genblaze is a local-first creative engine that integrates NIM/FLUX models, SceneSpec extraction, and GPU assist-only workflows while preserving the constitutional sovereignty of the RT4D CPU print system. This whitepaper defines the security posture, threat boundaries, and constitutional guarantees that govern Genblaze’s Bring‑Your‑Own‑Key (BYOK) model.

## 1. Architectural Principles

1. **Local-first sovereignty** — User secrets remain local and never enter shared infrastructure by default.
2. **Assist-only GPU / NIM domain** — Creative, non-deterministic, constitutionally barred from print SoT.
3. **Deterministic CPU print domain** — RT4D / `cpu.rt4d.print` remains the sole authoritative print SoT.
4. **Zero secret persistence** — Keys never enter logs, disk, B2, Git, or evidence SoT as BYOK material.

## 2. BYOK Security Model

- Keys stored only in `sessionStorage`
- Keys transmitted Genblaze UI → local Genblaze (or flagged hosted) → NIM
- Keys never proxied on hosted Render unless `GENBLAZE_ALLOW_BYOK=1`
- Keys never enter RT4D print or Digital Printer evidence
- Keys never appear in SceneSpec / CharacterSpec / parity harness as secrets

## 3. Threat Surface (minimized)

- No server-side BYOK vault
- No persistent BYOK secrets
- No shared key proxy by default
- No GPU → print SoT routing
- No deterministic claims from GPU assist layer

## 4. Constitutional Guarantees

- Compute sovereignty preserved
- Determinism boundaries enforced
- Assist-only GPU/NIM domain protected
- Evidence chain remains free of BYOK secrets
- BYOK never compromises constitutional integrity

## Related

- `byok-security-charter.md`
- `byok-threat-model.md`
- `docs/governance/cecp/trails/genblaze-byok-session-2026-07/`
