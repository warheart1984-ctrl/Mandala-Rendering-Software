# Release: Anime-Structure Plate Projector Lane (v1)

| Field | Value |
| --- | --- |
| Status | **Declared, not promoted** |
| Branch | `feat/anime-structure-plate-projector` |
| PR | #95 (contract), #96 (promotion package on `main`) |
| Commit tip | `8f2012b` (#96); land `fbc50a2` / parallel `a8f6e57` |

## Overview

This release introduces the Anime-Structure Plate Projector Lane, a governed 4D→3D projection pathway for expressive visualization of 4D ray-traced hits. It provides foreshortening, depth cues, and narrative structure that help viewers understand 4D geometry when collapsed into 3D.

## Features

- Projector4D (SoT): \((x',y',z') = \frac{d_4}{d_4+w}(x,y,z)\)
- `drop_w` lane for literal XYZ debugging
- Provenance schema (v1)
- Replay determinism
- Sparse + scene-rich experiments
- Pole-stress experiment
- Formal contract + design note
- Multi-lane verdict lock
- Option C pole auto-fallback (**partial** in compare runner)

## Promotion Status

Projector4D is **eligible** but not yet promoted.

Pending: pole thresholds, ink-cel evaluation, CI provenance validator.

## Why This Matters

This is the first governed projection lane in the RT4D engine, establishing the mathematical and constitutional foundation for expressive 4D media — without mutating Print SoT / Digital Printer.
