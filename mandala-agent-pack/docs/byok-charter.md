# BYOK Charter (pack pointer)

> **Status:** pointer only — do not treat this file as SoT.

**Canonical charter:** [`docs/genblaze/security/byok-security-charter.md`](../../docs/genblaze/security/byok-security-charter.md)  
**Trail:** [`docs/governance/cecp/trails/genblaze-byok-session-2026-07/`](../../docs/governance/cecp/trails/genblaze-byok-session-2026-07/)  
**Implementation:** `mrs/apps/genblaze-media/app/byok.py` (unit-tested)

Hosted enablement flag is **`GENBLAZE_ALLOW_BYOK=1`** (not `BYOK_HOSTED`).
Keys leave the browser only to the Genblaze process (loopback or flagged hosted), which then calls NIM — see charter “transmission honesty.”
