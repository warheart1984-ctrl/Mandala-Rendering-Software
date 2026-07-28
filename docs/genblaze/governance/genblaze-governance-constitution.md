# Genblaze Governance Constitution

**Artifact:** `docs/genblaze/governance/genblaze-governance-constitution.md`  
**Status:** Constitutional · Binding · Local‑First

## Article I — Purpose

Genblaze is a local-first, assist-only creative engine integrated into the Sovereign X ecosystem. This constitution defines the governance, security, and routing rules that bind Genblaze to CIEMS sovereignty, RT4D determinism, and BYOK security.

## Article II — Domains of Authority

- **CPU Print Domain (Authoritative):** RT4D CPU renderer / `cpu.rt4d.print`. Deterministic, evidence-backed print SoT. No GPU beauty SoT, no NIM beauty SoT, no BYOK secrets.
- **GPU / NIM Assist Domain (Creative):** NIM/FLUX, lookdev, face creation, SceneSpec/CharacterSpec hints. Non-deterministic, assist-only, barred from print SoT and evidence as beauty.
- **UI/Operator Domain:** Genblaze UI, settings, BYOK, model catalog. Local-first, user-controlled, non-authoritative.

## Article III — Routing Principles

1. DeterminismRequired → CPU RT4D only.
2. Print mode → CPU RT4D / Digital Printer only.
3. GPU/NIM capabilities → assist-only modes.
4. No GPU or NIM beauty may enter the Digital Printer evidence chain as SoT.
5. Genblaze must never override Sovereign X Router constitutional contracts.

## Article IV — BYOK Governance

1. Keys stored only in `sessionStorage`.
2. Keys never logged, persisted, or routed into Digital Printer evidence.
3. BYOK enabled by default only on local loopback.
4. Hosted BYOK requires `GENBLAZE_ALLOW_BYOK=1` and explicit operator consent.
5. BYOK must never turn Genblaze into a multi-tenant key proxy.

## Article V — Capability Governance

1. All NIM/FLUX capabilities are assist-only.
2. Model overrides are local-only and non-persistent server-side.
3. Multi-vendor NIM usage must remain vendor-neutral and constitutionally bound.
4. Capability registry must classify `cpu.rt4d.print` as authoritative and `gpu.*` / NIM as assist-only.

## Article VI — Evidence and Lineage

1. Only RT4D / Digital Printer outputs may enter print evidence SoT.
2. SceneSpec and CharacterSpec are assist-only hints, not print evidence.
3. Lineage may track prompts/images, assist summaries (no keys), SceneSpec/CharacterSpec transforms, and final RT4D frame hashes.

## Article VII — Operator Duties

Operators must preserve local-first posture, enforce assist-only GPU/NIM usage, protect user secrets, maintain RT4D as sovereign print backend, and respect constitutional safeguards and audit requirements.
