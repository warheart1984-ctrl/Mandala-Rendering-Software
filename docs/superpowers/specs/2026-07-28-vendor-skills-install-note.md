# Vendor agent skills — install note (2026-07-28)

**Status:** **declared** tooling note (Drive-G-1) — skills aid operators/agents; they do **not** make CUDA/HIP/WebGPU print **enforced**.  
**Trail:** `docs/governance/cecp/trails/printer-gpu-quality-speed-2026-07/`  
**PR:** #83 · branch `feat/engine3d-genblaze-cinematic-plugin`

## NVIDIA skills installed (user-approved)

Commands (Cursor detected; PromptScript global copy skipped harmlessly):

```bash
npx skills add nvidia/skills --skill rag-blueprint --global --yes
npx skills add nvidia/skills --skill tilegym-cutile-python --global --yes
npx skills add nvidia/skills --skill dynamo-troubleshoot --global --yes
npx skills add nvidia/skills --skill tao-setup-nvidia-gpu-host --global --yes
npx skills add nvidia/skills --skill tao-run-inference-service --global --yes
```

Install root: `~/.agents/skills/<name>/` (also copied into Cursor skill paths).

| Skill | Why for MRS | Applied how |
|-------|-------------|-------------|
| `nvidia-skill-finder` | Already in Cursor nvidia-skills plugin | Catalog router |
| `rag-blueprint` | Genblaze embeddings/search is assist-only | Docs: do not conflate RAG Blueprint deploy with Digital Printer |
| `tilegym-cutile-python` | Future NVIDIA CUDA kernel research | Docs only — **no** cuTile/CUDA print SoT; HIP/CUDA **absent** in printer |
| `dynamo-troubleshoot` | Layered health debug pattern | Genblaze NIM empty-504 playbook ordered top-down |
| `tao-setup-nvidia-gpu-host` | GPU host prerequisites | WebGPU/print GPU path: check host before claiming GPU |
| `tao-run-inference-service` | Inference microservice patterns | Ops reference only — not wired into printer |

**Catalog honesty:** NVIDIA skills catalog has **no** dedicated `nim` / `nvcf` skill slug. Genblaze NIM/NVCF ops stay in-repo (`nvidia_http.py`, README playbook).

## AMD skills

### Cursor plugin (available)

`~/.cursor/plugins/cache/cursor-public/amd-skills/` includes (among others):

- `rocm-doctor` — diagnose broken ROCm/HIP on AMD hosts  
- `magpie-kernel-evaluator` — HIP/CUDA kernel evaluate/compare (**declared** for future; no MRS HIP kernels yet)

### skills.sh installs (user-approved this session)

```bash
npx skills add yechua-silva/amd-rocm-skills --skill rocm-setup --global --yes
npx skills add mohitmishra786/low-level-dev-skills --skill hip-rocm --global --yes
```

| Skill | Tag for MRS |
|-------|-------------|
| `rocm-setup` | Host ROCm setup for **future** AMD path — printer HIP **absent** |
| `hip-rocm` | HIP programming reference — do not stub `native/hip` as enforced |

### What ROCm path would need later (before any claim)

1. `native/rocm` or HIP kernels + device selection  
2. CPU↔HIP parity receipts (same bar as WebGPU)  
3. `rocm-doctor` / `rocm-setup` smoke (`rocminfo`, `rocm-smi`) on operator hosts  
4. Trail ESFR update — never claim AMD print acceleration until then

## Hard bans (unchanged)

- NIM/FLUX bytes must **not** become Digital Printer `beauty.png` SoT  
- Do **not** claim CUDA/HIP/WebGPU print **enforced**  
- Do **not** invent AMD MCP if only skills (not MCP) are installed  

## Reload

Reload Cursor / restart the agent so newly copied skills appear in the skill picker.

## Follow-up trail (2026-07-28)

Applied skills to in-repo surfaces:  
`docs/governance/cecp/trails/vendor-skills-fixup-2026-07/`  
(inventory `00-skill-inventory.md`, NIM `/health` ops checklist, check-only GPU host + detect scripts).

## Sovereign X vendor router (2026-07-28)

Machine-readable capability registration (NVIDIA + AMD skill IDs → upstream /
`forbidden_for_print`) lives at:

- Registry: `mrs/packages/sovereign-x-router/data/vendor-capability-registry.json`
- Package: `@mrs/sovereign-x-router` (thin dispatch stubs; print SoT rejected)
- CECP trail: `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/`
- Printer contract pointer: `mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md`

Status: **declared**/**partial** registration — not CUDA/HIP print enforcement.

