# THREAT-MODEL.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Assets

| Asset | Value |
|-------|-------|
| Charter integrity | constitutional SoT; if compromised, all gates lie |
| Evidence / replay records | auditability, provenance |
| Secrets / credentials | never allowed in repo (R8) |
| Rendering authority | governed access to GPU/render pipeline |
| Provider credentials (BYOK) | user-owned keys for inference providers |

## Threat actors

| Actor | Capability |
|-------|------------|
| Unprivileged agent/actor | can issue intents, cannot self-authorize |
| Compromised module | can attempt ungoverned execution |
| Malicious third-party dep | supply-chain risk |
| Exfiltrator | reads repository/files for secrets |

## Threats & mitigations

| ID | Threat | Mitigation | Status |
|----|--------|-----------|--------|
| T-1 | Execution without intent | CKL deny-if-false (I-1) | enforced |
| T-2 | Unauthorized authority escalation | no-authority-without-contract; `authority.chain-valid`; no-implicit-escalation | enforced |
| T-3 | State change without evidence | no-state-change-without-evidence | enforced |
| T-4 | Unprovenanced render | attach-provenance | enforced |
| T-5 | Replay forgery / record tampering | replay token recompute verification | enforced |
| T-6 | Secret leakage | git.nvapi audit; R8; BYOK scoping | enforced |
| T-7 | Cross-layer mutation | execution.no-cross-layer-mutation | enforced |
| T-8 | Supply-chain compromise | dependency review; MIT-compatible deps only (R9) | partial |
| T-9 | XSS in web host | sessionStorage discipline; static review only | declared (browser suite pending) |
| T-10 | Drift / ascension fraud | dual evidence requirement (I-5); drift throttle | enforced |

## Residual risks

- Browser XSS verification is static-only until a live browser suite runs
  (`V12/VALIDATION/security-results/security-audit.txt`, SKIP entry).
- Identity generation is non-deterministic; this is a correctness
  caveat, not a security control (see `DETERMINISM.md`).

## Evidence

- `V12/VALIDATION/security-results/security-audit.txt`
- `V12/VALIDATION/conformance-results/conformance-run.txt`
