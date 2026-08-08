# SECURITY.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-08

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

## Supply-chain (Dependabot) remediation — 2026-08-08

GitHub Dependabot reported 8 open alerts on the default branch
(1 critical, 3 high, 4 moderate). Branch `v2-scene-spec-contract`
resolves 7 of 8 in code (commit `d6e9576`):

| Package | GHSA | Severity | Fix |
|---------|------|----------|-----|
| vitest (FundingOS) | GHSA-5xrq-8626-4rwp | critical | `^3.2.6` (resolves 3.2.7) |
| hono (mrs) | GHSA-8j4g-w8fx-2239 | medium | override 4.12.34 |
| ip-address (mrs) | GHSA-mwp4-54f8-5fhr, GHSA-4xrf-jv44-h6hh, GHSA-22jq-vg5j-6vgg | high/medium | override 10.3.1 |
| fast-uri (mrs) | GHSA-7p8r-x3mc-p8w7 | high | override 3.1.5 |
| postcss (mrs) | GHSA-fxqj-rqcc-2cmp | medium | override 8.5.23 |
| minimatch (FundingOS) | ReDoS (dev-toolchain) | high | override 9.0.9 |

Verified: `npm audit` reports 0 vulnerabilities in both `mrs/` and
`FundingOS/` on this branch; lockfiles regenerate deterministically.

**1 alert intentionally left open — tracked, not dismissible in code:**
`brace-expansion` (GHSA-rgw5-rvv9-x895, high, DoS via unbounded
intermediate arrays, range `>= 4.0.0, < 5.0.9`) in
`infra/cdk/package-lock.json`. Root cause: it is a **bundled dependency
of `aws-cdk-lib`** (`inBundle: true`); the lockfile already resolves the
latest `aws-cdk-lib@2.263.0`, which still bundles `brace-expansion@5.0.8`.
npm overrides do not apply to bundled dependencies (empirically verified
2026-08-08). Resolution depends on an upstream `aws-cdk-lib` release that
bundles `brace-expansion@>=5.0.9`. Revisit when the next `aws-cdk-lib`
version ships.

## Evidence

- `V12/VALIDATION/security-results/security-audit.txt` (2026-08-07)
- Dependabot alert query (2026-08-08): 8 open → 7 fixed in code on
  `v2-scene-spec-contract`; 1 tracked open (`brace-expansion`, upstream
  blocker in `aws-cdk-lib` bundled deps).
