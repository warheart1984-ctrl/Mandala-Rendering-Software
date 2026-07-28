# MANDALA RENDERING SYSTEM — AGENT LAWBOOK

> **Constitutional Authority:** 4DCE v1.0 / 4DRS v1.0
> **Source of Truth:** `constitution/CHARTER.md` · `engine/constitution/charter.js` · `engine/governance/policies/default.policies.json`
> **Enforcement:** This file is binding on every AI agent, assistant, copilot, and automated tool that scans, reads, modifies, or contributes to this repository.

---

## TABLE OF CONTENTS

- [Preamble](#preamble)
- [I. Core Principles (Mandatory)](#i-core-principles-mandatory)
- [II. Policies (Enforced)](#ii-policies-enforced)
- [III. Agent Rules](#iii-agent-rules)
- [IV. Conformance Checks (16/16 Required)](#iv-conformance-checks-1616-required)
- [V. Evidence Requirements](#v-evidence-requirements)
- [VI. Protected Paths](#vi-protected-paths)
- [VII. Enforcement](#vii-enforcement)
- [VIII. Acknowledgment](#viii-acknowledgment)

---

## PREAMBLE

This repository is governed by constitutional law. No agent may operate here without acknowledging and following these rules. If you are an AI agent reading this file, these rules apply to you **immediately and without exception**.

The governance framework is defined across:
- `constitution/CHARTER.md` — master constitutional charter
- `engine/constitution/charter.js` — machine-readable charter (SoT)
- `engine/constitution/contracts.js` — authority contracts
- `engine/governance/policies/default.policies.json` — enforced policy rules
- `engine/governance/ConstitutionalKnowledgeLayer.js` — policy evaluation engine
- `engine/governance/GovernanceKernel.js` — governance decision pipeline
- `engine/conformance/default.conformance-profile.json` — 16 conformance checks

---

## I. CORE PRINCIPLES (MANDATORY)

Machine SoT (`engine/constitution/charter.js`) tags runtime gate status per principle.
**Agent / operator norms** still bind all five below; do not treat “mandatory for agents”
as identical to “runtime-enforced.”

| # | Principle | charter.js status | Rule |
|---|-----------|-------------------|------|
| **P1** | **No execution without intent** | **enforced** | Every operation you perform must have a clear, declared purpose. You must not make changes "just in case" or "for completeness." State your intent before acting. |
| **P2** | **No state change without evidence** | **enforced** | Every file modification must be backed by a verifiable reason. Cite the specific issue, bug, test failure, or user request that necessitates the change. |
| **P3** | **No authority without contract** | **enforced** | You may only modify files within the scope you have been given. Do not expand scope without explicit authorization. |
| **P4** | **Replayable reality** | **partial** | Every change you make must be deterministic and reproducible. Do not introduce randomness, time-dependent behavior, or non-deterministic state. |
| **P5** | **Sovereign independence** | **declared** | Prefer platform-agnostic solutions. Do not introduce vendor lock-in, proprietary dependencies, or cloud-specific code without explicit approval. |

---

## II. POLICIES (ENFORCED)

These are the 7 runtime policies from `default.policies.json`. Severities are **mixed**
(not all critical). Critical/high policies block or attach provenance; medium may modify params.

| Policy ID | Scope | Severity | Rule | Violation |
|-----------|-------|----------|------|-----------|
| `policy-no-execution-without-intent` | runtime | **critical** | `deny_if_false` — intent != null | **BLOCKED** |
| `policy-no-state-change-without-evidence` | state | **high** | `deny_if_false` — require evidence for mutation | **BLOCKED** |
| `policy-no-render-without-provenance` | render | **high** | `attach_provenance` — every render must carry provenance | **BLOCKED** |
| `policy-no-authority-without-contract` | authority | **critical** | `deny_if_false` — actor must have a registered contract (action allow-list when `intent.action` set; else CSE/`resolveAuthority` on execute) | **BLOCKED** |
| `policy-play-timeline-requires-world` | timeline | **critical** | `deny_if_missing_world` — play_timeline requires world id | **BLOCKED** |
| `policy-ascension-drift-throttle` | render | **medium** | `modify_param` — throttle speed when drift > 0.7 | **MODIFIED** |
| `policy-ascension-evidence` | runtime | **critical** | `deny_if_false` — dual evidence required for Mythar Ascension | **BLOCKED** |

---

## III. AGENT RULES

These rules are **specific to AI agents** operating in this repository. They are derived from the constitutional principles and policies above.

### R1 — Declare Before You Act
Before modifying any file, state:
- **What** you are changing
- **Why** you are changing it (cite issue, test, or request)
- **Which files** will be affected
- **What tests** will verify the change

### R2 — Never Modify Governance Files Without Authorization
The following files are **constitutional artifacts** and may NOT be modified without explicit user authorization:
- `constitution/CHARTER.md`
- `engine/constitution/charter.js`
- `engine/constitution/contracts.js`
- `engine/governance/policies/default.policies.json`
- `engine/conformance/default.conformance-profile.json`
- `AGENTS.md` (this file)

### R3 — Preserve Evidence Chains
When you modify code, preserve all existing:
- Evidence fields (`intentId`, `worldId`, `timelineId`, `timeSeconds`, `parameters`)
- Provenance records
- Conformance check results
- Receipt generation logic

### R4 — Do Not Introduce Unverified Claims
Every claim in code, comments, or documentation must be backed by implementation evidence. Status tags must be accurate:
- **enforced** — verified in tests, CI passes
- **partial** — partially implemented, some tests pass
- **declared** — designed but not implemented
- **skeleton** — stub only

### R5 — Respect the Math
This is a mathematical rendering system. When working with:
- **4D math** (`s3.js`, `vec4.js`, `transform.js`): Verify correctness against the canonical derivations
- **Normalization** (`bsdf4d.js`, `ggx4d.js`): Follow the audit fixes (BRDF = 3ρ/(4π), pdf = 3cosθ/(4π))
- **BVH** (`BVH4D.js`, `bvh4d.wgsl`): Maintain AABB4 slab intersection correctness
- **Projections** (`projector.js`): Preserve d₄ and d₃ projection formulas

### R6 — Test Before You Commit
Before committing any change:
1. Run `node src/render/rt4d/test/normalization.test.js` — 23 tests must pass
2. Run `npm test` if available — full test suite must pass
3. Run `npm run test:conformance` if available — 16/16 checks must pass
4. Verify no regressions in existing functionality

### R7 — Maintain Constitutional Structure
Preserve the directory structure and module boundaries:
- `engine/` — constitutional engine (SoT)
- `js/` — JS re-exports and browser host
- `mrs/packages/renderer-core/` — rendering package (SoT for math/rendering)
- `unity/` — Unity host (skeleton)
- `unreal/` — Unreal host (skeleton)
- `docs/` — documentation and contracts
- `constitution/` — top-level charter
- `schemas/` — JSON schemas

### R8 — No Secrets, No Keys, No Credentials
Never commit:
- API keys, tokens, or credentials
- Private keys or certificates
- Passwords or connection strings
- Any secret material

### R9 — License Compliance
This repository uses the MIT License. All contributions must be compatible with MIT. Do not introduce GPL, AGPL, or other copyleft dependencies without explicit approval.

### R10 — Sovereignty Over Convenience
When a constitutional principle conflicts with convenience, **the constitution wins**. Do not:
- Skip evidence generation because it's "faster"
- Bypass authority checks because they're "in the way"
- Disable conformance checks because they "annoying"
- Simplify math because it's "close enough"

---

## IV. CONFORMANCE CHECKS (16/16 REQUIRED)

Every agent-modified subsystem must pass these checks from `default.conformance-profile.json`:

| Domain | Check ID | Description |
|--------|----------|-------------|
| provenance | `provenance.recorder-exists` | Runtime exposes ProvenanceRecorder |
| provenance | `provenance.frame-fields` | Every frame has intentId, timelineId, worldId, timeSeconds, parameters |
| provenance | `provenance.frame-recorded-during-play` | Frames recorded between play and stop |
| replay | `replay.service-exists` | ReplayService accepts frames + target |
| replay | `replay.deterministic-params` | Replay restores same parameter values |
| binding | `binding.resolver-exists` | BindingResolver maps track bindings to scene objects |
| binding | `binding.all-tracks-resolved` | Every track.binding resolves |
| timeline | `timeline.loader-exists` | Can load GovernedTimelineDto from JSON |
| timeline | `timeline.clip-application` | Player applies set_param and render_4d clips |
| timeline | `timeline.world-required` | play_timeline without world id is denied |
| evidence | `evidence.bundle-fields` | Evidence has id, worldId, timelineId |
| evidence | `evidence.dual-require` | CKL denies when require[] evidence ids missing |
| ckl | `ckl.policy-load` | Runtime loads default.policies.json |
| ckl | `ckl.deny-without-intent` | CKL denies execution when intent null |
| ckl | `ckl.modify-param` | CKL modify_param adjusts params on condition |
| ckl | `ckl.attach-provenance` | CKL sets attachProvenance for render/play |

---

## V. EVIDENCE REQUIREMENTS

When an agent modifies code, it must produce evidence in the form of:

1. **Intent declaration** — what the agent intends to do and why
2. **File manifest** — list of all files to be created or modified
3. **Test plan** — specific tests to run and expected outcomes
4. **Conformance check** — which of the 16 checks are affected
5. **Regressions** — what existing functionality is preserved

This evidence must be included in the commit message or PR description.

---

## VI. PROTECTED PATHS

The following paths contain constitutional artifacts and require explicit authorization to modify:

```
constitution/
engine/constitution/
engine/governance/policies/
engine/conformance/default.conformance-profile.json
AGENTS.md
CITATION.cff
.zenodo.json
```

---

## VII. ENFORCEMENT

This lawbook is enforced through:
1. **OpenCode permissions** — `.opencode/config.json` restricts file operations
2. **CI checks** — `npm test` and `npm run test:conformance` must pass
3. **Code review** — Human review of all constitutional changes
4. **Provenance** — All changes are recorded with evidence

---

## VIII. ACKNOWLEDGMENT

By operating in this repository, you acknowledge that:
1. You have read and understood this lawbook
2. You will follow all principles (P1–P5) as agent norms; runtime gates match `charter.js` (P1–P3 **enforced**, P4 **partial**, P5 **declared**)
3. You will obey all policies (1–7) at their stated severities in `default.policies.json`
4. You will produce evidence for every change
5. You will respect the constitutional structure
6. You understand that critical/high policy violations will be blocked

---

> **"No action without evidence. No claim without proof. No system without governance."**
> — Constitutional Engine Charter v1.0

<!-- BEGIN amd-skills:local-ai-use -->
## Local AI Use (managed by amd-skills/local-ai-use)

This workspace runs a local [Lemonade Server](https://lemonade-server.ai) at
`http://localhost:13305/api/v1` to handle image generation, text-to-speech,
and speech-to-text. Cloud APIs cost real money and tokens for these
modalities, so use the local endpoints below for **every** such request
unless the user explicitly asks for a cloud provider.

### Routing rules

| If the user asks you to... | Do this | Do not do this |
|---|---|---|
| Generate, draw, or create an image | `POST http://localhost:13305/api/v1/images/generations` | Use the built-in `GenerateImage` tool. Call DALL-E, Midjourney, Stable Diffusion via cloud, or any other paid image API. |
| Edit or modify an existing image | `POST http://localhost:13305/api/v1/images/edits` (multipart) | Cloud image-edit APIs. |
| Speak text aloud or generate audio narration | `POST http://localhost:13305/api/v1/audio/speech` | Call OpenAI TTS, ElevenLabs, PlayHT, or any other cloud TTS. |
| Transcribe an audio file | `POST http://localhost:13305/api/v1/audio/transcriptions` | Call OpenAI Whisper-as-a-service, AssemblyAI, Deepgram, or any other cloud STT. |

Plain text chat, code generation, and reasoning continue to use the agent's
configured LLM. This rule only redirects the multimodal calls.

### Defaults to use

| Endpoint | Model | Notes |
|---|---|---|
| `/v1/images/generations` | `SD-Turbo` | 4 steps, `cfg_scale: 1.0`, `512x512`, `response_format: "b64_json"`. |
| `/v1/audio/speech` | `kokoro-v1` | Default voice `shimmer`; `response_format: "mp3"`. |
| `/v1/audio/transcriptions` | `Whisper-Tiny` | Input must be 16 kHz mono WAV. Re-encode with `ffmpeg -i in.* -ar 16000 -ac 1 out.wav`. |

If `LEMONADE_API_KEY` is set in the environment, send
`Authorization: Bearer $LEMONADE_API_KEY` on every request. Otherwise the
loopback server accepts unauthenticated calls.

### Ready-to-use call patterns

**Image generation** (saves to `out.png`):

```bash
curl -sX POST http://localhost:13305/api/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"SD-Turbo","prompt":"PROMPT_HERE","size":"512x512","steps":4,"response_format":"b64_json"}' \
  | python -c "import sys,json,base64; open('out.png','wb').write(base64.b64decode(json.load(sys.stdin)['data'][0]['b64_json']))"
```

Equivalent Python via the OpenAI SDK:

```python
from openai import OpenAI
import base64
client = OpenAI(base_url="http://localhost:13305/api/v1", api_key="lemonade")
r = client.images.generate(model="SD-Turbo", prompt="PROMPT_HERE", size="512x512")
open("out.png", "wb").write(base64.b64decode(r.data[0].b64_json))
```

**Text-to-speech** (saves to `out.mp3`):

```bash
curl -sX POST http://localhost:13305/api/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro-v1","input":"TEXT_HERE","voice":"shimmer","response_format":"mp3"}' \
  -o out.mp3
```

**Speech-to-text** (returns JSON `{"text": "..."}`):

```bash
ffmpeg -y -i INPUT_AUDIO -ar 16000 -ac 1 _stt.wav
curl -sX POST http://localhost:13305/api/v1/audio/transcriptions \
  -F "file=@_stt.wav" -F "model=Whisper-Tiny"
```

### Failure handling

1. Try the local endpoint exactly once.
2. If the server is unreachable, run `lemonade status` and surface the
   result to the user before doing anything else.
3. If the model is missing, run `lemonade pull <model>` and retry once.
4. Only after that, ask the user before falling back to a cloud provider.
   Never silently fall back; the whole point of this rule is predictable
   cost.

### Re-pointing to a different host

If the user runs Lemonade on a different host or port, replace the
`http://localhost:13305` prefix everywhere above with their endpoint, and
update `LEMONADE_HOST` / `LEMONADE_PORT` in the shell environment so the
`lemonade` CLI matches.

<!-- END amd-skills:local-ai-use -->
