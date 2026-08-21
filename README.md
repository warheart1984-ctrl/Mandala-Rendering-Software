# Mandala Engine

**Constitutional 4D simulation and rendering platform** — a governed synthetic-world runtime. Organs propose transitions; a constitutional gate certifies state; Mandala observes pixels. Movie Lane owns playback, not time integration.

Not a Unity/Unreal competitor claim. Not “beats Unreal.” Status tags: **working** · **partial** · **skeleton** · **declared** · **blocked-with-evidence**.

---

## Working now

| Piece | How to run |
|-------|------------|
| **Simulation Chamber** (cinematic + `--solver mandala-proto`) | `node scripts/simulation-chamber.mjs scripts/scene-cards/scene-salt-atlas.json` |
| Pose fallback | same + `--solver pose` |
| **Salt-atlas** scene card + speech (edge-tts when available) | outputs under `output/simulation/` |
| **Character Stage 1** (procedural wire GLB + PNG) | `node character/cli.mjs build --id char --species anthro` · `node character/tools/export-character.mjs` |
| **Mandala proto** four proofs (32³×64 CPU) | `npm run test:mandala-proto` |
| **Mandala engine e2e** | `node mandala/engine/run-e2e.mjs` · `npm run test:mandala-engine` |
| **H_gov** demo + dashboard | `python3 mandala/engine/hamiltonian/governance_api.py` → [http://127.0.0.1:8765/dashboard](http://127.0.0.1:8765/dashboard) |
| **AAIS organ ABI** freeze `mandala-engine-organ.v1` | see `mandala/engine/ABI.md` |
| **RT4D CPU** path tracer | `mrs/packages/renderer-core` · normalization suite in package tests |
| **Actor LLM** (Lemonade) | Dolphin uncensored preferred; Instruct fallback — `:13307` |
| **AI Painter open golden** (Anything-V5) | `node scripts/golden-painter.mjs` → `output/mandala-painter-open/` (no pro exports) |

Chamber with character hook (mesh path logged; still renders capsules until mesh adapter lands):

```bash
node scripts/simulation-chamber.mjs scripts/scene-cards/scene-salt-atlas.json --character-glb
```

---

## Partial / prototype

| Piece | Tag | Notes |
|-------|-----|--------|
| Character Stages 2–3 | **partial** | Skinning, beauty shaders, sim stand-ins |
| Blender / ZBrush path | **blocked-with-evidence** | Not on PATH / unavailable |
| Mandala substrate + Möbius | **partial** | `mandala/substrate/` — RHFD mapping; Chamber motion ≠ full ∇V |
| Scene graph | **skeleton** → **partial** | `mandala/engine/scenegraph.mjs` |
| Physics / materials / painter / Mythar | **partial** | Tiny CPU lattice; look still primitive |
| Vulkan ∇φ / compute | **partial** | RX 580 path exists; not a mature GPU substrate |
| Chamber mesh consume | **partial** | GLB accepted; RT4D still uses 15-part capsules |
| Full GPU substrate | **declared** / thin **partial** | One kernel + async queue; certified evolution still CPU truth |

---

## Declared / not started

- Mandala IDE, live shader debugger, GLB→lattice compiler
- Full GPU-driven renderer (mesh shaders, bindless, TAA)
- Production-rank physics / film PBR
- Independence from Unreal/Unity/Blender as a product claim
- Real CAR/CDR store beyond H_gov demo graph

Direction SoT: [`docs/mandala/MANDALA_ENGINE_ROADMAP.md`](docs/mandala/MANDALA_ENGINE_ROADMAP.md).

---

## Organ map

| Organ | Owns | Does not own |
|-------|------|----------------|
| **Story Forge** | Intent, narrative constraints, world-law | Pixels, time integration |
| **Mandala** | Geometry, fields, visibility, projection | Certified truth |
| **Simulation Chamber** | Temporal evolution `t → t+1` | Observer playback |
| **AI Painter** | Appearance under state constraints | Reality |
| **Mythar** | Breath, acoustic field, speech | Time |
| **AAIS** | Contracts, invariants, provenance | Creative authorship |
| **Movie Lane** | Observer path, editing, assembly | Time (must not own the integrator) |

Do not invent organs. Details: [`docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md).

---

## Quick start

```bash
# Chamber (salt-atlas cinematic)
node scripts/simulation-chamber.mjs scripts/scene-cards/scene-salt-atlas.json

# Character Stage 1 export
node character/tools/export-character.mjs

# Mandala proto + engine
npm run test:mandala-proto
node mandala/engine/run-e2e.mjs

# Governance dashboard
python3 mandala/engine/hamiltonian/governance_api.py
# → http://127.0.0.1:8765/dashboard

# Broader tests (as available)
npm test
npm run test:conformance   # 16/16 when green
```

---

## Hardware reality (this demo machine)

| Resource | Reality |
|----------|---------|
| CPU / RAM | FX-8350 · ~15 GB |
| GPU | AMD RX 580 · Vulkan (Polaris) |
| Lemonade chat / actor LLM | `:13307` |
| sd-server (SD-Turbo) | `:13306` — keep 512×512; 1024 can OOM |
| TTS | **edge-tts** preferred; Lemonade kokoro AVX2 **blocked** on this host |

---

## Deeper docs

| Doc | What |
|-----|------|
| [`docs/mandala/MANDALA_ENGINE_ROADMAP.md`](docs/mandala/MANDALA_ENGINE_ROADMAP.md) | Engine identity, foundations, versioned roadmap |
| [`docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md) | Runtime model |
| [`docs/mandala/INDEPENDENCE_ROADMAP.md`](docs/mandala/INDEPENDENCE_ROADMAP.md) | Independence plan (aspirational vs proven) |
| [`character/README.md`](character/README.md) | Character pipeline stages + honest status |
| [`mandala/engine/README.md`](mandala/engine/README.md) | Engine organs + e2e |
| [`mrs/README.md`](mrs/README.md) | MRS packages / RT4D / Genblaze |
| [`AGENTS.md`](AGENTS.md) | Binding rules for AI agents (do not edit without authorization) |

---

## License

MIT — see [LICENSE](LICENSE).
