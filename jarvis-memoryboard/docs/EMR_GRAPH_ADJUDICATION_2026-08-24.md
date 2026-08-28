# EMR Graph Adjudication — 2026-08-24

**Reviewer:** assistant semantic review; human confirmation pending  
**Source report:** `emr-evaluation-v1`, two-item adjudication queue  
**Scope:** answer-bearing top-k relevance, not general topical similarity

## Judgments

| Case | Candidate | Judgment | Rationale |
|---|---|---|---|
| Simulation Chamber holo anatomy | `mem-5951932d6867` | Relevant supporting context | Names the Chamber holoRig/buffer/COMPOSITE path and the queried rho, d-hat, and K field structure. It supports, but does not replace, the primary Chamber memory. |
| Holographic streaming binary codec benchmark | `mem-5951932d6867` | Not answer-relevant | Describes older shader/buffer plumbing, not the raw binary codec, Aetherian benchmark, or measured streaming result requested. |

## Evidence-driven tuning

- Default graph contribution: `0.35` → `0.30`.
- Minimum derived edge strength: `0.20` → `0.35`.
- Explicit lineage and evidence-reference edges retain their recorded strengths.
- Depth, seed limit, node limit, and hop decay are unchanged.

The lower graph contribution preserves strong lineage context while preventing
the weaker streaming-case predecessor from crossing the evaluation promotion
floor. The higher derived-edge threshold reduces broad tag-only traversal;
same-subject, supersession, and explicit evidence relationships remain usable.

These settings are calibrated on two manually reviewed additions, so they are
a conservative default rather than a universal optimum. The judgments are
recorded as `assistant-adjudicated-provisional`, not human ground truth. An
operator should confirm or override them before they are promoted to the
human-adjudicated evidence tier.
