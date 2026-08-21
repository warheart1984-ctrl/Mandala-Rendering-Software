# Mythar Voice + Gaulish Provenance Schema (minimal)

**Status:** declared (not enforced). No CI gate unless tests exist.  
**Session:** `mythar-gaulish-voice-2026-08-20`  
**Evidence (repo):** `mrs/narrative/sre/mythar/data.py` (`VOICE_CONFIG` / P-01→P-07), `scripts/mythar_lemonade_tts.py`

---

## 1. Mythar voice contract (backend-agnostic)

Mythar is the **voice contract** (prosody rules + timbre/F0/cadence). Lemonade (and any ONNX/future TTS) is a **backend**, not the contract.

| Field | Status | Notes |
|-------|--------|-------|
| `contract_id` | declared | e.g. `mythar-natural` |
| `version` | skeleton | mirrors `VOICE_CONFIG.version` (today `1.0.0` in `data.py`) |
| `rules` | partial | P-01…P-07 in `MYTHAR_VOICE_CONFIG.prosodyRules` |
| `timbre` / `baselineF0` / `cadence` | partial | in `data.py`; not independently fixture-tested |
| `fixtures[]` | skeleton | per-rule utterance + expected acoustic cues |
| `tolerances` | declared | numeric windows for F0/duration/amplitude — not implemented |
| `conformance` | declared | gate backends (Lemonade :13315, ONNX, …); **valid WAV ≠ P-rule proof** |

**Runtime note (ops, not schema):** Mythar TTS currently on `:13315`; Lemonade multimodal / sd-bridge owns `:13305`.

**Next evolution (declared):** independently testable P-rules with fixtures, acoustic expectations, tolerances, version, provenance; conformance gate per backend.

---

## 2. Gaulish utterance provenance (≠ Mythar)

Do **not** collapse Gaulish pronunciation into Mythar P-rules. Separate pipeline:

```
corpus → attestation DB → phonological reconstruction → pronunciation rules
  → confidence/provenance → phoneme+prosody plan → TTS backend → WAV
```

| Field | Status | Meaning |
|-------|--------|---------|
| `utterance_id` | declared | stable id for the surface form |
| `attestation` | declared | cited forms / inscriptions / glosses (evidence) |
| `reconstruction` | declared | phonological reconstruction under named assumptions |
| `extrapolation` | declared | steps beyond attestation (must be labeled) |
| `confidence` | declared | `0..1` or ordinal; visible to consumers |
| `reconstruction_id` | declared | scholarly reconstruction variant (multiple allowed) |
| `sources[]` | declared | bibliographic / corpus pointers |
| `claim_framing` | declared | *"given evidence and reconstruction assumptions, may plausibly have sounded…"* — never *"this is how Gaulish sounded"* |

Long-term: multiple competing reconstructions as **variants** of the same utterance with visible uncertainty.

---

## 3. Shared render plan (phoneme + prosody → WAV)

Common handoff so Mythar and Gaulish both retain provenance through synthesis:

```json
{
  "plan_version": "0.1.0-declared",
  "language_track": "mythar | gaulish",
  "phonemes": [],
  "prosody": { "rule_refs": [], "f0_contour": null, "durations": null },
  "backend": { "id": "lemonade-tts", "endpoint": ":13315", "model": null },
  "provenance": {
    "contract_version": null,
    "reconstruction_id": null,
    "confidence": null,
    "sources": [],
    "evidence_paths": [
      "mrs/narrative/sre/mythar/data.py",
      "scripts/mythar_lemonade_tts.py"
    ]
  },
  "artifact": { "wav_path": null, "valid_wav": false }
}
```

- `valid_wav: true` means the pipeline produced audio — **not** that each P-rule (or Gaulish reconstruction) had the intended perceptual effect.
- Status of this object shape: **skeleton / declared**.

---

## Honesty tags

| Claim | Tag |
|-------|-----|
| P-01…P-07 defined in `data.py` | partial (data present; fixture/conformance absent) |
| Backend-agnostic Mythar contract + Lemonade as one backend | declared |
| Gaulish path + provenance fields | declared |
| Shared plan JSON | skeleton |
| Enforced / CI | **no** (do not claim until tests land) |
