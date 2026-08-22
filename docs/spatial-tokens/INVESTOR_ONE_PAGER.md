# Investor one-pager — HoloRT4D Spatial Tokens

**Product:** Spatial Tokens for multimodal LLMs — a deterministic 16×16 (or 8×8) grid of depth, curvature, and normals hashed as `HoloRT4D-Spatial-V1`.

**Problem:** LLMs reason over text and 2D pixels. They lack a compact, replayable spatial prior. Depth models and chat wrappers are opaque and non-deterministic.

**Solution:** Tokenize **existing HoloRT4D / chamber / face-rig outputs** (opticalLength, landmark-z, depth maps) into a canonical JSON grid + SHA-256. Same depth bytes → same hash.

**Honesty (build status):**

- Math tokenize from depth grids: **enforced** (code + tests)
- API stub / billing `$1`: **partial / declared** (not live payments)
- Photo → metric depth without ML: **declared** (not claimed)

**Go-to-market:** Robotics, interior scene assistants, assistive dermatology notes, fashion try-on briefs — via SDK + `$1`/call API (declared pricing).

**Moat:** Replayable spatial evidence tied to Mandala’s constitutional / holographic pipeline — not a generic vision API wrapper.

**Ask:** Productize Spatial-V1 as the eyes layer for LLM agents that already use Mandala chamber depth.
