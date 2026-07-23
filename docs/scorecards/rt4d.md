# Scorecard — rt4d

> Template alignment: Drive-G maturity dimensions.  
> Project id: `rt4d`  
> Updated: 2026-07-23  
> Evidence anchor: `docs/4d-engine/rt4d/` roadmap + `mrs/packages/renderer-core/src/render/rt4d/` + `docs/4drs/`

## Snapshot

| Field | Value |
| --- | --- |
| Project ID | `rt4d` |
| Repository path | `G:\New folder` |
| Review date | 2026-07-23 |
| Reviewer | agent session (roadmap land) |

## Dimension ratings

| Dimension | Rating | Audience | Evidence |
| --- | --- | --- | --- |
| Constitutional model | Early / declared | Architects | 4DRS naming + API freeze docs; GPU evolution roadmap **declared** |
| Governance methodology | Early | Operators | Charter evidence tags; HCL validation factory **enforced**; GPU gates not machine-enforced |
| Reference implementation | Partial (CPU) · Early skeleton (GPU) | Developers | `PathTracer4D`, `BVH4D`, HCL; WebGPU/CUDA sketches; v2–v4 features **roadmap** |
| Platform engineering | Early / roadmap | Operators | No multi-GPU; Vulkan/DX RT4D backends **not present**; adapters hybrid-first **skeleton** |
| Commercial operations | Roadmap | Business | No self-serve RT4D product claimed |

## Audience readiness

| Audience | Assessment | Notes |
| --- | --- | --- |
| Operators (deploy & run) | Partial (CPU / browser paths) · Not ready (v2–v4 GPU scale) | Do not conflate |
| Users (signup & self-serve) | Not ready | Not claimed |

## Overall framing

> **This project is** partial at the CPU reference-implementation layer (4DRS v1.0 path engine), and early / roadmap at the GPU core, image-quality, and multi-backend platform layers. The engine (CPU tracer) exists; the GPU factory (queues, denoise, multi-GPU, native backends) is still early.

## Non-claims (explicit)

- [ ] Wavefront / path queues implemented  
- [ ] Adaptive sampling / temporal accumulation implemented  
- [ ] 4D-aware denoising implemented  
- [ ] Production-grade images at low spp (as delivered fact)  
- [ ] Multi-GPU RT4D dispatcher  
- [ ] WebGPU ↔ Vulkan ↔ DX12 RT4D backend parity achieved  
- [ ] FourDAdapter consuming native Vulkan/DX RT4D backends  

## Verification commands

Documentation land — optional existing smokes:

```bash
npm run render:hcl-baseline
# optional: scripts/test-bvh4d-gpu.mjs when present
```

## Cross-links

- Roadmap index: [`docs/4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md`](../4d-engine/rt4d/RT4D_EVOLUTION_ROADMAP.md)  
- 4DRS package: [`docs/4drs/README.md`](../4drs/README.md)  
- FourDRenderer v2 scorecard: [`docs/scorecards/fourd-renderer-v2.md`](./fourd-renderer-v2.md)  
- Charter: [`constitution/CHARTER.md`](../../constitution/CHARTER.md)
