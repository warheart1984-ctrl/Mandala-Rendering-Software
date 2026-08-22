# Art Direction Brief — Human Renders, Lighting, HoloRT4D

**Audience:** render passes, lighting rigs, future cinematic human shots  
**Reference outputs:** `output/holort4d-human/`  
**Status:** living brief — honest tags, no overclaim  
**Last context:** SD-Turbo human still + short clip on Polaris; HoloRT4D wave field sibling in `holort4d/`

---

## 1. Mission

Deliver **cinematic human presence** where the viewer reads **light, shadow, and composition first** — not “correct anatomy.” The first ~10 seconds must land: a face in believable light, weight on the ground, atmosphere in the falloff. Imperfect geometry and diffusion artifacts are acceptable when shadow grammar is right.

We are not chasing SD-as-truth. We are building a **shared lighting language** that SD reference passes and HoloRT4D wave fields can both obey, so future passes feel like the same photographer directed both.

---

## 2. Reference aesthetic (what worked in SD human pass)

**Location:** `output/holort4d-human/human.png`, `human.mp4` (preview-safe copy: `preview/human.png`)

| Element | What landed | Why it reads |
|---------|-------------|--------------|
| Key light | Warm, high angle (~35° off axis, steep downward) | Carves cheekbone and brow; separates face from background |
| Fill | Cool, low intensity, opposite hemisphere | Keeps shadow side readable without flattening |
| Contact shadow | Ground plane visible under figure | Anchors subject; sells weight |
| Shadow density | Deep but not crushed; midtones survive in lit zones | Hides micro-artifacts in transition bands |
| Mood | Restrained, portrait-forward | Photographer’s eye reads intent, not model checkpoint |

**Engine truth:** these frames are **SD-Turbo on Polar `sd-server` :13306** — prompt-to-portrait diffusion, **not** HoloRT4D, **not** governed wave optics. They are the **aesthetic target**, not the pipeline contract.

---

## 3. Lighting doctrine

Think like a location portrait: one motivated key, one controlled fill, optional rim only if separation fails.

### Key (primary)

- **Type:** directional, warm (≈5600K biased warm: `[1.0, 0.96, 0.9]`)
- **Direction:** high front-side — e.g. `[0.35, -0.85, 0.40]` normalized
- **Intensity:** dominant (reference rig: **2.4** relative units)
- **Job:** define plane of face, nose shadow, eye sockets

### Fill (secondary)

- **Type:** directional, cool (≈7000K: `[0.55, 0.65, 0.85]`)
- **Direction:** opposite hemisphere — e.g. `[-0.50, -0.30, -0.20]`
- **Intensity:** **≤15% of key** (reference: **0.35** vs key 2.4)
- **Job:** lift shadow side enough to read silhouette; never compete with key

### Rim (optional)

- Use only when subject separates poorly from background
- Narrow, controlled — avoid halo soup on hair/shoulders
- If rim is doing the composition’s work, fix key angle first

### Environment

- Low ambient: dark neutral (reference: `[0.04, 0.05, 0.07]` @ 0.25)
- Background stays **darker than lit skin** so key-side contrast carries the frame

### Exposure

- Target **2.0–2.4×** exposure multiplier after integrate (reference script uses 2.2)
- Protect highlights on forehead/nose; let shadow side fall naturally

---

## 4. Shadow as feature (not failure)

**Core insight:** correct lighting and shadow cover imperfections faster than higher step counts or bigger models. The eye catches bad symmetry before it catches a soft jawline — but it **does not** catch a jawline lost in proper falloff.

### Falloff rules

1. **Hide in transition, not in black.** Artifact-prone zones (jaw hinge, ear, hairline, fingers) sit in **mid-shadow gradient**, not clipped void.
2. **Contact shadows are mandatory.** Ground plane (hyperplane `y=0` or equivalent) gives a hard read at the feet — even when the figure is stylized or capsule-based.
3. **No uniform gray wash.** If shadow and lit sides converge to the same luminance, the frame reads “AI flat” regardless of face quality.
4. **Density over sharpness.** A slightly soft terminator with correct density beats a crisp terminator with wrong fill ratio.

### Where shadow works for us

| Zone | Shadow role |
|------|-------------|
| Under chin / jaw | Hide neck seam, SD chin artifacts |
| Eye socket (key side) | Depth without needing perfect iris detail |
| Nose bridge cast | Structural read; masks asymmetry |
| Hand far side | Simplify finger count errors |
| Background behind shadow ear | Separation without rim spam |

### Where shadow must not hide

| Zone | Keep lit |
|------|----------|
| Near eye (key side) | One catchlight minimum |
| Cheekbone (key side) | Plane break for “human” read |
| Near knuckles (if hands visible) | Gesture readability in first 10s |

---

## 5. Face / hand priority zones

Priority is **composition order**, not poly budget.

```
[ EYES + BROW ]  ← first read (3s)
[ NOSE + CHEEK KEY SIDE ]  ← structure (5s)
[ MOUTH + CHIN SHADOW ]  ← expression/weight (7s)
[ HANDS / GESTURE ]  ← only if in frame; else omit
[ BODY / COSTUME ]  ← support; never outshine face
```

**Face:** 60–70% of lighting decisions serve the head-shoulders crop. Key hits near-side eye plane; fill preserves shadow-side jaw edge.

**Hands:** If present, treat as secondary portrait subjects — same key/fill ratio, simpler background behind them. Prefer one visible hand over two half-lit hands.

**Body:** Capsule/humanoid proxies (`humanoid-holort4d-capsules`) are acceptable when head lighting sells the shot.

---

## 6. HoloRT4D-specific — same light grammar, different contract

HoloRT4D is **wave optics:** \(E = A \cdot e^{i\varphi}\), accumulated from traced `PathSample` buffers. It is **not** SD relabeled.

### How lighting enters the field

1. **RT4D path trace** computes per-pixel `radiance` and `weight` under the same key/fill/environment rig as §3.
2. **Amplitude \(A\)** derives from radiance magnitude (and path weight) — bright key side = higher \(A\); shadow side = lower \(A\).
3. **Phase \(\varphi\)** encodes optical path length (`opticalLength` from finalize) — shadow regions carry longer/shifted phase, not a separate fake darken pass.
4. **`lighting-reference.png`** (RT4D only) is the **diagnostic beauty pass** for the rig — compare against SD reference for mood match; it is **not** the HoloRT4D deliverable.

### Rules

- Do **not** tune HoloRT4D by editing SD prompts — tune the **shared light rig**, then re-trace.
- Do **not** collapse wave field to “looks like SD” — match **light grammar** (key angle, shadow density, contact), accept different micro-texture.
- Phase encode is for downstream holographic consumers; debug `frame.png` / `phase.png` are **partial** status — field viz, not final cinema grade.

**Reference script:** `scripts/holort4d-human-frame.mjs`  
**Reference outputs:** `output/holort4d-human/holort4d/`

---

## 7. What SD is for vs what HoloRT4D is for

| | **SD-Turbo (Polar :13306)** | **HoloRT4D** |
|---|---------------------------|--------------|
| **Contract** | Prompt → latent portrait diffusion | Traced paths → complex field \(E=Ae^{i\varphi}\) |
| **Purpose** | Fast aesthetic reference, mood board, “does this lighting read?” | Governed wave-optics layer on traced geometry |
| **Geometry** | Implicit in model weights | Explicit capsules / scene (`humanoid-holort4d-capsules`) |
| **Honest tag** | **partial** — 512×512, 4 steps, local diffusion | **partial** — CPU enforced; Polar GPU tiled path partial |
| **When to use** | Lock art direction, sell first 10s look, compare lighting | Prove field pipeline, CIEMS hashes, holographic downstream |
| **When not to use** | Claim “Mandala rendered this human” | Claim photoreal portrait or replace SD reference |

### Three holography contracts (stay separate)

1. **math4d projection** — \(\mathcal{R}(\Pi_{3\to2}[\Pi_{4\to3}(R_4 X)])\); collapse is the point  
2. **mandala/holography (`--holo`)** — bulk-boundary, EntanglementRenderer, COMPOSITE  
3. **HoloRT4D** — wave optics on PathSample buffers  

Never fuse labels in provenance or marketing copy.

---

## 8. Polaris constraints (RX 580)

| Parameter | Safe default | Hard limit |
|-----------|--------------|------------|
| Resolution | **512×512** | **1024×1024 OOMs** — wedges `sd-server`; restart required |
| SD steps | **4** (SD-Turbo) | More steps ≠ fix bad light |
| CFG | **1.0** | SD-Turbo tuned here |
| HoloRT4D samples | **8** per pixel (reference) | Scale with time budget |
| GPU atomics | **none** on Polar tiled path | No `shader-float32-atomic` assumption |
| Bind groups | max **4** | HoloRT4D physical 0/1 only |

**Status honesty:** RX 580 Polar / Vulkan — SD inference **works** at 512; HoloRT4D GPU dispatch **partial**; Lemonade :13305 may be down — document what actually ran.

---

## 9. Shot checklist (per render pass)

Copy this block into pass notes or provenance.

```
[ ] Intent declared (still / clip / field debug / comparison)
[ ] Contract tagged (sd-turbo | holort4d | math4d-projection | chamber-holo)
[ ] Resolution ≤512 for SD on Polaris
[ ] Key/fill directions + intensities logged
[ ] Contact shadow plane present (y=0 or equivalent)
[ ] Face priority: key-side eye/cheek readable
[ ] Shadow side in gradient (not clipped, not flat)
[ ] First-10s test: composition reads without inspecting teeth
[ ] SD reference compared ONLY for light mood (if HoloRT4D pass)
[ ] Outputs + sha256 + stage list in provenance.json
[ ] No stage labeled "photoreal" unless evidence supports it
```

### Cinematic first 10 seconds

1. **0–3s:** Establish key direction — viewer knows where light comes from  
2. **3–6s:** Face structure readable — brow, nose, cheek  
3. **6–10s:** Mood + weight — shadow density, ground contact, background falloff  

If step 1 fails, stop — do not compensate with prompt adjectives.

---

## 10. Provenance (required on every output)

Every deliverable ships with JSON provenance stating **which stages ran** and **honest status tags**.

### Minimum fields

```json
{
  "intent": "<what this output is for>",
  "honest": {
    "holort4d": "<wave-optics | did not run | not photoreal>",
    "sdTurbo": "<reference only | did not run>",
    "chamberHolo": "<composite density | did not run>",
    "photoreal": "<declared | partial | not claimed>"
  },
  "lighting": {
    "key": "<direction, color, intensity>",
    "fill": "<direction, color, intensity>",
    "ground": "<contact shadow plane>",
    "exposure": "<multiplier>"
  },
  "visuals": {
    "engine": "<sd-server :13306 | holort4d-cpu | ...>",
    "size": "512x512",
    "steps": 4,
    "samples": 8
  },
  "pipeline": {
    "stages": [{ "stage": "...", "status": "enforced|partial|declared" }]
  },
  "sha256": { "<artifact>": "<hash>" }
}
```

### Reference provenance files

- SD human: `output/holort4d-human/provenance.json`
- HoloRT4D sibling: `output/holort4d-human/holort4d/provenance.json`

**Rule:** if a stage did not run, say so. Reference PNGs and wave-field debug frames are different products — never merge their labels.

---

## Related docs

- `docs/math4d/HOLORT4D.md` — wave-optics contract, PathSample layout, three-contract split  
- `docs/holort4d/FACE_RIG_TURBO_CONTROL.md` — paint rig numbers for Turbo GGUF + canonical CPF-4D envelope  
- `scripts/holort4d-human-frame.mjs` — governed human frame script  
- `scripts/face-rig-turbo.mjs` — control image + sd-server img2img  
- `output/holort4d-human/preview/README.md` — preview-safe SD copies  

---

> **Photographer’s summary:** Light the face like you mean it. Let shadow do the retouching. Tag the pipeline like you’d tag RAW vs JPEG — different tools, same eye.
