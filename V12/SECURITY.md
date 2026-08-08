# SECURITY.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Posture

Security is constitutional: secrets must never enter the repository
(lawbook R8), authorities must be contracted (P3), and ungoverned
execution is blocked by policy.

## Controls

| Control | Mechanism |
|---------|-----------|
| No secrets in repo | `git.nvapi` audit; secrets excluded by policy |
| Credential scoping | BYOK policy — hosted/loopback, `printSoT` false in health views |
| Session handling | `sessionStorage` for UI state; no durable BYOK localStorage key |
| Authority checks | policy `no-authority-without-contract` |
| Input validation | contract record shapes; schema validation (`schemas/`) |
| Provenance | every render carries provenance (policy attach) |

## Audit log

`npm run security-audit` (genblaze scope) — recorded
`V12/VALIDATION/security-results/security-audit.txt`:

- 6 checks PASS (byok.policy, byok.printSoT, ui.sessionStorage,
  ui.localStorage, docs.hosted_flag, git.nvapi)
- 1 SKIP — browser XSS audit is static-only; a live browser suite is
  recommended before any public web deployment.

## Threat model

See `THREAT-MODEL.md` for threats, actors, and mitigations.

## Evidence

- `V12/VALIDATION/security-results/security-audit.txt` (2026-08-07)
