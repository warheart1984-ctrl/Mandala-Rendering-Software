# API.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

Public API surface of the Phase D+ subsystem (`src/`). All modules are
ESM and export a singleton plus constants.

## ConstitutionalInferenceContract
`src/constitution/contracts/ConstitutionalInferenceContract.js`

| Method | Description |
|--------|-------------|
| `createInference({ type, conclusion, premiseIds, evidenceIds, reasoningChain, confidence, evidenceStrength })` | Create record; returns record with `id`, `replayToken`, `constitutionalHash` |
| `validateInference(id, validatorId?)` | Run registered validators; sets status validated/rejected |
| `reviseInference(id, revision)` | Produce revised record with lineage |
| `verifyReplayToken(id)` | `{ valid, token }` or `{ valid: false, reason }` |
| `checkBlindSpots(id)` | `{ hasBlindSpots, blindSpots, recommendations }` |
| `getInference(id)` / `getInferences(filter?)` | Read records |
| `getReasoningChain(id)` | Walk revise/derive lineage |
| `bindObservationProjection(bundle)` / `projectObservationPoint(point)` | Observation binding |

Constants: `INFERENCE_TYPES`, `EVIDENCE_STRENGTH`, `REASONING_STATUS`.

## ConstitutionalContinuityContract
`src/constitution/contracts/ConstitutionalContinuityContract.js`

| Method | Description |
|--------|-------------|
| `registerContinuity({ type, sourceState, targetState, level, evidence, causalChain })` | Register continuity; returns record with `id` |
| `verifyContinuity(id, verifier?)` | `{ verified, verdict, errors }` |
| `createContinuityChain(chainId, ids)` | Verify a chain of continuities |

Constants: `CONTINUITY_LEVELS`, `CONTINUITY_TYPES`, `CONTINUITY_VERDICTS`.

## IntentLifecycleContract
`src/constitution/contracts/IntentLifecycleContract.js`

| Method | Description |
|--------|-------------|
| `declareIntent(...)` / `commitIntent(...)` / `executeIntent(...)` | State transitions |
| `suspendIntent(...)` / `resumeIntent(...)` | Lifecycle control |

Constants: `INTENT_STATES`, `INTENT_PRIORITIES`, `INTENT_CATEGORIES`.

## ConstitutionalEvidenceRoot
`src/constitution/ConstitutionalEvidenceRoot.js`

| Method | Description |
|--------|-------------|
| `recordEvidence(bundle)` / `getEvidence(id)` | Evidence records with replay identity |

## ConstitutionalReasoningEngine
`src/reasoning/ConstitutionalReasoningEngine.js`

| Method | Description |
|--------|-------------|
| `submitReasoningTask(task)` | Queue a reasoning task; returns `{ taskId, status }` |
| `processQueue(maxConcurrent?)` | Process queued tasks |
| `getTaskStatus(taskId)` | queued / processing / completed / failed |
| `getQueuedTasks()` / `getActiveTasks()` / `cancelTask(id)` | Queue control |
| `getInference(id)` / `getInferences(filter?)` / `getReasoningChain(id)` | Read-through to inference contract |
| `getQualityMetrics()` | Engine-wide metrics |
| `registerQualityValidator(name, fn)` / `registerHook(event, fn)` | Extension |

Constants: `REASONING_MODES` (fast/deliberate/critical/audit).

## Example

```js
import { constitutionalReasoningEngine } from "./src/reasoning/ConstitutionalReasoningEngine.js";

const { taskId } = await constitutionalReasoningEngine.submitReasoningTask({
  type: "deductive",
  conclusion: "…",
  evidenceIds: ["ev1", "ev2"],
  evidenceStrength: "moderate",
  confidence: 0.8,
});
await constitutionalReasoningEngine.processQueue();
```
