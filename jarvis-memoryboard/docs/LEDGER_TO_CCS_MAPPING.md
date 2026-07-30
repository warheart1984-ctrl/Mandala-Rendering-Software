# Mapping: Continuity Ledger v1 → CCS constructs

**Honest gap analysis.** Left = what ships today. Right = CCS charter target (**declared** unless noted).

| Today (`continuity-ledger-v1`) | Future CCS construct | Gap |
|--------------------------------|----------------------|-----|
| Flat `memories[]` in JSON store | Continuity Block (immutable batch) | No block hashing / chaining / Merkle — **declared** |
| `MemoryRecord` | Continuity event inside a block | Event envelope incomplete vs CCS |
| `evidence: EvidenceLink[]` | Evidence Object (typed, signed) | Links only; no signature/payload store — **declared** |
| `source_agent` + `session_id` + `created_at` | Provenance Chain fragment | No Root Authority → … → Replay chain — **declared** |
| `GET /retrieve` + `selections` | Replay against RC.* | No RC execution; filter rationale only — **enforced** replay of ledger rows |
| `conflicts` | Continuity invariant: no silent merge | Surfaces disputes; does not evaluate truth — **enforced** |
| `supersedes` | Continuity edge / replacement claim | Not a CES Decision Object — **enforced** as field |
| `status` / `confidence` | Claimed lifecycle / caller confidence | Not Evidence Engine verification — **enforced** as stored fields |
| `content_sha256` | Evidence / block hash building block | Content hash only — **partial** |
| Hooks sessionEnd draft posts | Constitutional event recording | **transitional / partial** vs Boundary Clause V (memory exclusion) — may still write session facts |
| — | CES.* registration | Stubs in `schemas/ces/` — **declared** |
| — | RC.* registration | Stubs in `schemas/rc/` — **declared** |
| — | Unified provenance across products | **declared** |
| — | Domain merger prevention (Boundary Clauses I–VI) | **declared** charter; not runtime-enforced |

**Bottom line:** today’s ledger is a **working continuity store** with provenance and conflict surfacing. It is **not** yet CCS infrastructure (blocks, signed evidence objects, CES/RC registry runtime, multi-product provenance).
