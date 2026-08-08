# Darz Reference Audit — Mandala Rendering System

**Audit date:** 2026-08-07
**Auditor:** opencode (agent), requested by repository owner `warheart1984-ctrl`

## Purpose

The repository owner requested:
1. A full sweep for any mention of the name **"Darz"** across the workspace.
2. Removal of every genuine reference found.
3. An audit record documenting each finding and its disposition.

## Method

- Recursive filename scan of the entire workspace (including hidden files).
- Recursive content scan (case-insensitive, `darz`) across all text, source, config,
  documentation, and binary files, excluding `.git`, `node_modules`, and lockfiles.
- Git history check: commit messages, author names, branch/tag names, refs.
- Byte-level verification of every binary match to classify genuine vs. coincidental.

## Findings

| # | Location | Type | Verdict |
|---|----------|------|---------|
| 1 | `tmp/_darz_paste.txt` | filename | **GENUINE** — removed. Content was an exact duplicate (MD5 `EC939E79F12E8C0B4B3ED0995CB1F31D`) of `tmp/scorecard-source.txt`, an untracked *A Map Drawn in Salt* review paste. No content lost. |
| 2 | `vendor/HIP/docs/data/tutorial/graph_api/ct_reconstruction_overview.drawio` | content | **FALSE POSITIVE** — "Darzi" appears inside base64-encoded diagram payload, not as a name. |
| 3 | `mandala-app/models/ggml-model-q4_k_m.bin` | content | **FALSE POSITIVE** — random bytes in quantized model weights at offsets 132723248, 246293095, 313643840, 591276916. Not readable text. |
| 4 | `sme/dist/models/ggml-model-q4_k_m.bin` | content | **FALSE POSITIVE** — same GGUF weights as #3 (identical offsets), duplicate artifact. |
| 5 | `mandala-app/dist/win-unpacked/locales/pl.pak` | content | **FALSE POSITIVE** — Polish locale; "darz" is the substring of the Polish word "Kalendarzu" (Calendar) in UTF-16 text. |
| 6 | `models/tinyllama-1.1b/*.gguf` | content | **FALSE POSITIVE** — no "darz" present in ASCII decode. |

## Git History

- No commit message, author name, branch, tag, or ref contains "darz".
- All commit authors: `warheart1984-ctrl` / `Jon Halstead` / `dependabot[bot]`.
- `git config user.name` = `warheart1984-ctrl`, `user.email` = `warheart1984@gmail.com`.
- Remote: `origin https://github.com/warheart1984-ctrl/Mandala-Rendering-Software.git`.

## Ownership

Attribution for this repository already resolves to the owner:
- Git author identity: `warheart1984-ctrl <warheart1984@gmail.com>` (also `Jon Halstead <warheart1984@gmail.com>` on earlier commits).
- The four false-positive binary hits were left untouched because they are machine-generated
  bytes (model weights / locale data / encoded diagram payload), not authorship claims.

## Disposition

- Removed: `tmp/_darz_paste.txt` (the only genuine reference).
- Left intact: all false positives, with byte-level justification recorded above.

**Net result:** zero genuine references to "Darz" remain in the workspace.
