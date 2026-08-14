# Mandala Rosetta Ledger

**Canonical record of MRK promotion.** Entries are append-only; an entry is published only after all parity evidence exists (MRK promotion criteria, `mrk-spec-v0.md` §4).

---

## Entry AXIOM-X-001

| Field | Value |
|-------|-------|
| **Kernel name** | Axiom X — Deterministic Mulberry32 Sampler |
| **Registry id** | `sx.kernel.axiom.x.sample` (ABI v0) |
| **Intent** | deterministic 32-bit mulberry32 sampler: output is a pure function of (seed, x, y, spp) |
| **Substrates** | OpenCL (GPU, AMD Ellesmere) · C reference · JS `cpu.rt4d.print` mirror |
| **Test configurations** | 64x64 spp=4 · 128x128 spp=8 · 37x53 spp=16 (odd dims) |
| **sha256 outputs** | `849a3bdcd9b346d13d087302809118dbf1547de768d2b844de73e94eb243cbfd` (64x64 spp=4 seed=0x5EED) · `5fe1468dd144c85088e29c28f2e2e50a25b760c06cfbbabba6d3e810cda34633` (128x128 spp=8 seed=0xABCD) · `7d6292215a158d2c1fa7fce302eec00080ac74736c46d322e0b7f5c39f837b71` (37x53 spp=16 seed=7) |
| **Parity status** | PASS — byte-exact across all substrates, all configurations |
| **Determinism** | PASS — same seed byte-identical; seed+1 diverges |
| **Temporal replay stability** | PASS — 5 replay loops byte-identical (kernel-level, 2026-08-13) |
| **Divergences caught** | 1 — JS mirror missing final XOR; corrected and re-verified |
| **Status** | **PROMOTED** |
| **Date** | 2026-08-13 |
| **Evidence paths** | `uals/tests/run_gates.exe` (G1-G7) · `uals/tests/parity/check_parity.mjs` · `axiom-native/node-bindings/test.js` (8/8) · `mrk-axiomx-promotion-record.md` |

## Entry AXIOM-X-002

| Field | Value |
|-------|-------|
| **Kernel name** | Axiom X — Deterministic 4D Diffuse NEE Integrator |
| **Registry id** | `sx.kernel.axiom.x.integrator` (ABI v0) |
| **Intent** | single-bounce 4D diffuse next-event-estimation against one S³ hypersphere light; fixed-scene, byte-exact across substrates |
| **Substrates** | OpenCL (GPU, AMD Ellesmere) · C reference (gate G8) · JS BigInt `cpu.rt4d.print` mirror |
| **Spec** | `mrk-axiomx-integrator-spec-v0.md` (Q16.16 fixed-point int64 only; no floats/transcendentals/atomics/reductions) |
| **Math** | Lambertian4D BRDF `3ρ/4π`, PDF `3cosθ/4π` (audited), S³ area `2π²R³`, r³ area→solid-angle Jacobian, `L_e·f·cosθ/pdf_ω` with `pdf_ω = (1/A)·d³/cos_light` |
| **Test configurations** | 64x64 spp=4 · 128x128 spp=8 · 37x53 spp=16 (odd dims) |
| **sha256 outputs** | `2e1df1c56ad62ee29489dbf305bc07f4d6f160d80f6080aa00fcb321b3cb1ad5` (64x64 spp=4 seed=0x5EED) · `4ad07bf8a22ff38eb1f2dde448adc82ee86e044c418dd655e086cd0fdc63a774` (128x128 spp=8 seed=0xABCD) · `88830bc1d42ef82bd7995a67ef1909507ec0f2eb1e3d2b792dbc8835d65a3993` (37x53 spp=16 seed=7) |
| **Parity status** | PASS — byte-exact across all substrates (GPU=C=JS), all configurations |
| **Determinism** | PASS — same seed byte-identical; seed+1 diverges (`dc458a9f…`) |
| **Divergences caught** | 4 — `pdfArea=0` (A missing `>>16`); cosLight inverted; JS stream not threaded (immutable BigInt); JS seed-mix missing 32-bit wrap. All corrected and re-verified byte-exact |
| **Status** | **PROMOTED** |
| **Date** | 2026-08-13 |
| **Evidence paths** | `uals/tests/run_gates.exe` (G1-G8) · `uals/tests/parity/check_integrator.mjs` · `uals/tests/parity/dump_integrator.exe` |

## Entry AXIOM-X-003

| Field | Value |
|-------|-------|
| **Substrate** | Engine-level temporal replay wiring (Axiom X bridge) |
| **Intent** | close declared gap: engine `ReplayService` + `ProvenanceRecorder` wired to the uals/axiomx GPU bridge with fail-closed provenance and lineage receipts |
| **Files** | `engine/runtime/AxiomXReplayTarget.js` · `engine/runtime/test/AxiomXReplayTarget.test.js` · `sovereign-x/axiom-native/node-bindings/replay-wiring.test.js` |
| **Evidence** | engine target 6/6 (replay-twice byte-identical, lineage receipt, fail-closed denial); live GPU replay-wiring **5/5** (probe, 5 frames × 2 replays byte-identical render hashes, `timeSeconds` is provenance not sampling input, receipt, denial); engine full suite 292/292 |
| **Status** | **COMPLETE** (wiring evidence recorded) |
| **Date** | 2026-08-13 |

## Reference entry WAVEMATH-F-001

| Field | Value |
|-------|-------|
| **Record** | `mrk-wavemath-findings-v0` — Wave Math / CFT / Reconstruction Sufficiency series review |
| **Type** | Reference entry — NOT an MRK promotion (no kernel, no parity evidence, no substrate claims) |
| **Intent** | citable findings record for the Wave Math series: 11 axioms inventoried, 9 theorems tagged (7 valid-as-written, 2 loosely stated, 1 definitional), physics layer marked analogy, 7 unproven items listed |
| **Source papers** | Wave Math: Foundations v1.0 · CFT: Foundations v1.0 · Reconstruction Sufficiency v1.0 (Zenodo preprints, Apache 2.0, 2026-06-24) |
| **Status** | **DECLARED** (not proven) |
| **Date** | 2026-08-13 |
| **Zenodo** | concept record `zenodo.org/records/20827642` — DOI `10.5281/zenodo.20827642` (all four series PDFs; record metadata license CC-BY-4.0, PDFs state Apache 2.0) |
| **Evidence paths** | `mrk-wavemath-findings-v0.md` · PDFs at `C:\Users\My PC\Downloads\{WaveMath_Foundations_v1.0, ReconstructionSufficiency_v1.0, ConstitutionalPhysics_CompleteSeries_v1.0}.pdf` · `E:\Users\randj\Downloads\WaveMath_Foundations_v1.0.pdf` |

## Zenodo publications (metadata verified 2026-08-14 via Zenodo API)

| DOI | Record | Title | Type | Date | License |
|-----|--------|-------|------|------|---------|
| `10.5281/zenodo.20827642` | `zenodo.org/records/20827642` | Wave Math: Foundations — A Mathematical Framework for Identity, Judgment, and Continuity Under Reality | Preprint (concept record; contains WaveMath, CFT, ReconstructionSufficiency, ConstitutionalPhysics series PDFs) | 2026-06-24 | CC-BY-4.0 |
| `10.5281/zenodo.21499388` | `zenodo.org/records/21499388` | 4D Rendering System (4DRS) v1.0.0 | Software (repo release — Mandala-Rendering-System-MRS- tarball + zip; code repo `github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-`) | 2026-07-22 | MIT |
| `10.5281/zenodo.21860512` | `zenodo.org/records/21860512` | Axiom-X: A Governed Dual-Category Operating System | Report (DOCX) | 2026-08-09 | CC-BY-4.0 |
| `10.5281/zenodo.21876726` | `zenodo.org/records/21876726` | A Governed 4D-to-3D Rendering Pipeline for Constitutional Physics Computing | Report (PDF) | 2026-08-10 | CC-BY-4.0 |
| `10.5281/zenodo.21927654` | `zenodo.org/records/21927654` | Dynamic Instruction Translation Bridge (DITB) | Software (white paper, v.1.01) | 2026-08-14 | CC-BY-4.0 |

Note: metadata verified from Zenodo API responses; no content-level claims beyond published metadata. No dedicated Zenodo record exists for the `sx.kernel.axiom.x.*` kernels themselves; the 4DRS v1.0.0 release (`10.5281/zenodo.21499388`) contains the repo including kernel sources.

## Declared future entries (not yet published)

| Kernel | Status | Blocking evidence |
|--------|--------|-------------------|
| Glyph Shader Engine substrate | declared | no shader engine exists yet |