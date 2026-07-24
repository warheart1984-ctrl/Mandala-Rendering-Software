# ACP-NIM-Cosmos-v1.0 — Arena Certification Protocol (roadmap)

| Field | Value |
| --- | --- |
| Protocol ID | ACP-NIM-Cosmos-v1.0 |
| Status (Drive-G-1) | **declared / ROADMAP** |
| Implementation | **Not implemented** in this service |
| Related module | CMM-NIM-Cosmos-v1.0 |

JCR/CEL/Sovereign IDE bindings are declared; this service does not host those runtimes.

## Explicit non-claim

The stages below are a **roadmap**. They are **not complete**, **not runtime-gated**, and **not tested** as Arena certification. Shipping `POST /api/generate-video` does **not** mean any stage below has been executed.

## Declared stages (not implemented)

| Stage | Intent (roadmap) | Current evidence |
| --- | --- | --- |
| A1 | Capture CER fields (`run_id`, sha256, asset key) | Partial field recording on generate — not Arena-certified |
| A2 | Attach CPR / manifest lineage | Manifest upload via Genblaze — not Arena-certified |
| A3 | Policy / JCR evaluation before publish | **Not implemented** |
| A4 | CEL / conformance profile gate | **Not implemented** |
| A5 | Arena certificate issuance | **Not implemented** |
| A6 | Sovereign IDE binding / promotion | **Not implemented** |

Do not upgrade this document’s status tags without matching tests and runtime gates.
