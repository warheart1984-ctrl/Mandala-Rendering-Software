# Constitutional Threat Model for BYOK

**Artifact:** `docs/genblaze/security/byok-threat-model.md`  
**Status:** Constitutional · Security Critical

## Threat Category I — Secret Exfiltration

**Threat:** Key leaks via logs, disk, server vault, or evidence chain.  
**Mitigation:** Session-only storage; no logging of keys; no server persistence; no Digital Printer routing; no GPU → print SoT crossover.

## Threat Category II — Hosted Key Proxying

**Threat:** Hosted Genblaze becomes a proxy for user secrets.  
**Mitigation:** BYOK disabled by default on `RENDER`; `GENBLAZE_ALLOW_BYOK=1` required; explicit operator consent; policy in `app/byok.py`.

## Threat Category III — XSS Theft

**Threat:** Browser XSS steals `sessionStorage` keys.  
**Mitigation:** Local-first recommendation; settings copy warns; no persistence; prefer trusted loopback.

## Threat Category IV — Determinism Boundary Violation

**Threat:** GPU assist output accidentally routed into print SoT.  
**Mitigation:** `gpuPrintSafeguard`; DeterminismRequired → `cpu.rt4d.print`; GPU assist-only classification; SX dispatch contract.

## Threat Category V — Evidence Chain Contamination

**Threat:** Secrets or GPU beauty enter Digital Printer SoT.  
**Mitigation:** Evidence chain isolation; CPU-only RT4D print SoT; BYOK barred from print domain; parity harness isolated from secrets.
