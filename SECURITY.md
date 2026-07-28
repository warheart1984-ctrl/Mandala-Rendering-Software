# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **GitHub Security Advisories** (preferred): Use the [Security Advisories](https://github.com/anomalyco/opencode/security/advisories) page to privately report a vulnerability.
2. **Email**: Contact the maintainers directly via the email listed in `package.json`.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, typically within 2 weeks for critical issues

## Security Considerations for Self-Hosted Deployments

This repository includes several server components that should be hardened before production use:

### Genblaze Media / BYOK (`mrs/apps/genblaze-media/`)

- **Local-first BYOK:** session keys live in browser `sessionStorage` and are sent only as
  per-request headers (`X-NVIDIA-API-Key` / `Authorization: Bearer`) on stills + assist paths.
- **Hosted default:** BYOK is denied on Render unless `GENBLAZE_ALLOW_BYOK=1`.
- **Scope:** video and polish endpoints reject BYOK headers with HTTP 400.
- **Path honesty:** UI → Genblaze → NVIDIA NIM (assist). BYOK keys never enter Digital Printer
  evidence / print SoT.
- **XSS:** BYOK diagnostics and capability registry must not inject untrusted model IDs via
  `innerHTML` — use `textContent` / escaped text.
- See also: `docs/genblaze/security/`, `mandala-agent-pack/agents/GenblazeAgent/byok.rules.md`.

### CSSV Server (`cssv/server.js`)
- Binds to all interfaces by default — restrict to localhost in production
- No authentication on `/cql`, `/ingest`, or `/ledger` endpoints
- Add authentication middleware before exposing publicly

### MCP Server (`mrs/apps/chatgpt-mrs/server/`)
- Designed for ChatGPT/OpenAI Apps integration
- CORS is set to `*` — restrict to trusted origins in production
- No rate limiting — add rate limiting middleware

### Environment Variables
- `.env` files contain API keys and credentials
- Never commit `.env` files to version control
- Use a secrets manager for production deployments
- Rotate API keys if they are exposed
- Genblaze: `GENBLAZE_ALLOW_BYOK`, `NVIDIA_API_KEY`, `FAL_KEY` — treat as secrets

## Scope

The following are considered in scope:
- Remote code execution vulnerabilities
- Authentication/authorization bypasses
- Injection attacks (XSS, SQL injection, command injection)
- Sensitive data exposure
- Path traversal vulnerabilities

The following are out of scope:
- Denial of service attacks
- Social engineering
- Issues in third-party dependencies (report upstream)
