# SIGGRAPH Course Notes — FourDRenderer v2.0 (Outline)

> Course / educational outline. Label every demo and timing claim with status vocabulary.  
> Not a claim that a SIGGRAPH course is accepted or scheduled.

| Field | Value |
| --- | --- |
| Working title | Higher-Dimensional Rendering Contracts: From \(\mathbb{R}^{4}\) to Host-Visible 3D |
| Length | Half-day outline (adjustable) |
| Status | **Declared educational outline** |
| Contact | **TBD** |

## Learning objectives

By the end, attendees can:

1. Explain why Observation Modes are policies, not camera tricks.  
2. Sketch BVH4D / SO(4) BSDF **contracts** and state what is **not** yet GPU-enforced.  
3. Describe PLP-aligned projection into `ShadingOutput3D`.  
4. Separate FourDRenderer authority from FourDAdapter consumer scope.  
5. Apply Drive-G-1 wording when discussing performance targets.

## Session outline

| Block | Minutes | Content | Status labels to speak aloud |
| --- | --- | --- | --- |
| 0. Framing | 15 | Motivation; prior art honesty; “declared vs shipped” | Vocabulary drill |
| 1. Math warm-up | 25 | \(\mathbb{R}^{4}\) rays, hyper-boxes, projection intuition | Educational |
| 2. Architecture deep dive | 40 | Accel · shade · path · project · observe | **Declared** RFCs |
| 3. ABI sketch | 20 | Buffer slots / conceptual passes | **Declared** Shader ABI — not shipped SDK |
| 4. Host landing | 30 | PLP · Scene3D · FourDAdapter hybrid-first | **Skeleton** adapter; RHI **roadmap** |
| 5. Live / recorded demos | 30 | Only paths that exist (MRS / RT4D / Canvas) | Label **partial** / prior — not “v2 GPU done” |
| 6. Evaluation plan | 15 | T1–T5; 4–6 ms as **design target** | **Not measured** |
| 7. Q&A | 15 | Use [`TECHNICAL_FAQ.md`](./TECHNICAL_FAQ.md) | Redline on overclaims |

## Demo policy

- Prefer architecture diagrams with on-canvas legend ([`ENGINE_ARCHITECTURE_DIAGRAM.md`](./ENGINE_ARCHITECTURE_DIAGRAM.md)).  
- Do not show invented Unreal Nanite/Lumen 4D plates.  
- If showing timings, mark **target** or **prior package** explicitly.

## Take-home materials (planned pointers)

- [`../README.md`](../README.md)  
- [`ACADEMIC_PAPER_OUTLINE.md`](./ACADEMIC_PAPER_OUTLINE.md)  
- [`ENGINE_SDK_DOCUMENTATION.md`](./ENGINE_SDK_DOCUMENTATION.md)  
- [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)

## Explicit non-claims for organizers

- Course acceptance / date: **TBD**  
- Production-ready engine training: **no**  
- Press contact: **TBD**
