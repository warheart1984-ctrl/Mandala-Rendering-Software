# Operator demo — prompt → scene → render → evidence → replay

**Print SoT:** CPU RT4D (`cpu.rt4d`). GPU assist is not used for evidence in this path.

## Prerequisites

- Node ≥ 20
- Python 3 on PATH (for `mrs/adapters/prompt-scene-bridge/run_bridge.py`)
- Repo root: `G:\Mandala Rendering Software` (or your clone)

## One command (recommended)

```bash
npm run demo:evidence-pipeline
```

Optional prompt and output path:

```bash
node scripts/demo-evidence-pipeline.mjs --prompt "a 4d star mandala under governance" --out ./tmp/evidence-run.json
```

## What it does

1. **Prompt → scene** — subprocess `run_bridge.py` (Infinity lane if on `PYTHONPATH`, else deterministic fallback).
2. **Scene → render** — `renderFrameToBuffer` via `@mrs/renderer-core` (wireframe CPU frame). Surfaces mapped from the prompt may be overridden to **tesseract** so CSE cinematic invariants (16 verts / 32 edges) hold; override is recorded in the evidence package.
3. **Governance** — CKL policies → `GovernanceKernel.evaluateIntent` → `ExecutionOrchestrator` → CSE CSR for `render.session.start`.
4. **Evidence** — render digest + governance fields assembled as `mrs-evidence-package` v1.
5. **Replay** — `ProvenanceRecorder` + `ReplayService.replayWithReceipt` restores parameters on a stub target.

Default artifact:

`docs/governance/cecp/trails/mrs-evidence-demo-interop-2026-07/artifacts/sample-evidence-package.json`

## Verify

```bash
npm run test:governance
npm run test:conformance
```

## Optional Genblaze HTTP path (not required for this demo)

With Genblaze running (`npm run genblaze:media`):

```bash
curl -s -X POST http://127.0.0.1:8787/api/prompt-to-scene -H "Content-Type: application/json" -d "{\"prompt\":\"a gothic altar\"}"
```

That path is **partial** for full Engine3D expand; the Node demo above is the **enforced** repeatable governance evidence loop in CI.

## Infinity Director

Director pytest is separate; run from `mrs/apps/infinity-director` when changing IDAC surfaces:

```bash
pytest tests/ -q --tb=no -m "not live"
```

IDAC certification remains **false** (`IDAC_CERTIFICATION_CHECKLIST.md`).
