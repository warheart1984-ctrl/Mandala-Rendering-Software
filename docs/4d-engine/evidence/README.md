# Constitutional photoreal evidence (CIEMS Phase 2)

| Status | Specs **declared** · Emitters **partial** |
|--------|-------------------------------------------|
| Trail | `docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/` |
| Schemas | `schemas/ciems/` |

## Artifacts

| Artifact | Spec | Schema | Emitter |
|----------|------|--------|---------|
| PEP v1.0 | [PEP_v1.md](./PEP_v1.md) | `schemas/ciems/pep-v1.json` | `emitPep.js` |
| SPR v1.0 | [SPR_v1.md](./SPR_v1.md) | `schemas/ciems/spr-v1.json` | `emitSpr.js` |
| CEC v1.0 | [CEC_v1.md](./CEC_v1.md) | `schemas/ciems/cec-v1.json` | `emitCec.js` |
| RDC / MFP-C / LJC | lean (sections of PEP) | `rdc-v1.json`, `mfp-c-v1.json`, `ljc-v1.json` | embedded |

## Evidence chain (textual)

```text
[Authority]
   |
   v
[SPR] -----> [PEP] -----> [CEC]
   |            |            |
   v            v            v
[MFP]        [LJC]        [RDC]
   \            |            /
    \           v           /
     \------> [Verification]
                 |
                 v
               [Replay]
                 |
                 v
               [Audit]
```

Governing chain: Authority → Validation → Decision → Evidence → Verification → Replay → Audit.

## Governed external-PBR integration

```text
prompt → VII/VIII soft wrap → layout (engine3d.soft)
       → --beauty external-pbr
       → GLB export (Held) + Cycles beauty (when Blender)
       → emit spr.json + pep.json + cec.json  (Partial scores)
       → verification-trail.json.photorealEvidence
```

Command:

```bash
npm run mrs:governed-render -- --prompt "…" --beauty external-pbr --width 64 --height 64
```

Run directory gains:

- `spr.json` — Scene Provenance Record
- `pep.json` — Photoreal Evidence Packet
- `cec.json` — Constitutional Evidence Contract

**Honesty bound:** completeness scores are Partial until MFP/LJC/PPL/topology fields are filled. Emitters set `fullPhotorealEligible: false` and do **not** auto-promote to Full Photoreal.

## Tests

```bash
node --test mrs/packages/renderer-core/src/evidence/photoreal/photorealEvidence.test.js
```

Checklist T-01..T-13 reports `pass` / `partial` / `fail` without faking Full.
