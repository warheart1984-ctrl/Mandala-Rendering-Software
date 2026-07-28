# ESFR Protocol

> **Status:** **partial** — protocol + skill + agent wiring exist; CI does not yet
> gate promotion on ESFR trail artifacts.
>
> **Authority:** CECP Ω∞ (`docs/governance/CECP_OMEGA_PROTOCOL.md`) stage 06.
> Does **not** amend `constitution/CHARTER.md` or `AGENTS.md`.
>
> **Identity:** ESFR (Engineer Standards Final Reviewer) **is** the CECP stage-06
> Engineer Standards role (`.opencode/agents/engineer-standards.md` /
> `mrs-engineer-standards`). Not a second parallel gate.

Trail artifact (canonical filename): `06-engineer-standards.md` under
`docs/governance/cecp/trails/<trail-id>/`.

Pipeline diagram: `docs/governance/esfr/pipeline.cecp-v2.md`  
Test matrix: `docs/governance/esfr/test-matrix.esfr.md`  
Evidence probes: `docs/governance/esfr/probes.esfr.md`

---

## Stage 01 — Intake

- Receive `InspectorVerdict` (`05-inspector-acceptance.md`).
- Load `CECPTrail` and lineage metadata (`README.md`, optional `lineage.json`).
- Validate module completeness against Architect file manifest / acceptance criteria.
- Confirm Inspector verdict is `PASS` or `PASS_WITH_GAPS` before proceeding to
  promotion consideration (`HOLD`/`REJECT` paths still evaluate for StandardsReport).

## Stage 02 — Standards Evaluation

Run every category in `test-matrix.esfr.md` and every probe in `probes.esfr.md`
(01–08), citing evidence.

- Check engineering standards compliance (coding, API, CI/tests, deps/license,
  Drive-G-1 / Drive-G-2 wording, scope discipline).
- Check architectural consistency with AAES-OS engineering standards (**declared**
  cross-org framing unless MRS-local evidence is cited).
- Check RT4D / Proton pipeline coherence when the module touches those paths.
- Validate CHEA Ω∞ execution environment — **declared** until CHEA artifacts exist
  (`docs/governance/CONSTITUTIONAL_LAYER_STACK.md`).
- Validate CCR capability legitimacy — **declared** until CCR artifacts exist.
- Validate CDGF operational legitimacy — **declared** until CDGF artifacts exist.

## Stage 03 — Evidence Alignment

- Cross-check Inspector evidence (commands, claim↔evidence rows, status tags).
- Ensure no contradictions or missing required trail artifacts (01–05 + 06).
- Confirm replayability and determinism claims match cited probes (Drive-G-1).
- **Invariant:** ESFR may interpret readiness; it must not rewrite or override
  Inspector evidence.

## Stage 04 — Verdict

| Verdict | Meaning |
|---------|---------|
| **PASS** | Ready for promotion; no listed gaps blocking ecosystem inclusion. |
| **PASS_WITH_GAPS** | Functionally correct for scoped claims; gaps listed with tags and promotion path. Preferred honest outcome when Inspector also used `PASS_WITH_GAPS`. |
| **HOLD** | Needs additional evidence before promotion eligibility can be decided. |
| **REJECT** | Violates engineering standards, claim honesty, license/hygiene, or constitutional ship rules for this gate. |

Deprecated aliases (map when reading older trails): `PASS_WITH_NOTES` →
`PASS_WITH_GAPS`; `FAIL` → `REJECT`.

## Stage 05 — Promotion Eligibility

`PromotionEligibility`: `PROMOTE` | `PROMOTE_WITH_GAPS` | `HOLD` | `REJECT`
(see `test-matrix.esfr.md` Promotion Readiness + `promotion.esfr.md`).

- If ESFRVerdict **PASS** → `PROMOTE`
- If ESFRVerdict **PASS_WITH_GAPS** → `PROMOTE_WITH_GAPS`
- If **HOLD** or **REJECT** → same token; return to crew with `StandardsReport`

Requires matrix category outcomes and probes 01–08 citations
(`probes.esfr.md`).

## Stage 06 — Lineage Update

- Append `ESFRVerdict` to trail `lineage.json` / `docs/governance/esfr/lineage.esfr.json`
  when recording a governed reference promotion review.
- Record standards compliance and gap list (immutable append; do not erase prior rows).
- Foreman may write trail files from the ESFR return if the read-only subagent cannot.

---

## Crew invocation

Foreman (`mrs-crew`) after Inspector:

1. Load `.cursor/skills/mrs-engineer-standards/SKILL.md` and
   `.opencode/agents/engineer-standards.md`.
2. Attach Inspector verdict + module paths + trail id.
3. Require ESFR output format (`ESFRVerdict`, test matrix, probes 01–08,
   `PromotionEligibility`).
4. Write `06-engineer-standards.md` before declaring ship-ready.
