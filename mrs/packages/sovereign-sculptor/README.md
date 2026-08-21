# Sovereign Sculptor

Sovereign Sculptor is Mandala's deterministic face, body, rig, pose, and whole-body skin authority. It supplies governed character anatomy to Engine3D and keeps RT4D/diffusion in a surface-polish role.

## Honest status

**Deterministic core and Blender integration proof: enforced at this package boundary. Production sculpt assets: partial.**

- The TypeScript core, strict GLB exporter/validator, constitutional records, human/fox/anthro rig profiles, pose replay adapter, topology lifecycle, and surface-only skin policy are implemented and covered by focused tests.
- The local studio loads and saves project JSON, previews topology, supports masked soft vertex movement with explicit X symmetry, and inspects rig, pose, skin, and anatomy sidecars.
- The human/fox/anthro fixture GLBs are tiny deterministic conformance records. The Blender anthro GLB is an actual rendered, rigged, animated procedural character proof; it is still not a production sculpt.
- The Blender adapter exports an engine-neutral governed GLB for Mandala/Engine3D and the repository's existing Unity and Unreal consumers. Independent Blender processes reproduce the same topology, vertex-order, UV, armature, blendshape, and material digests; ancillary container bytes are not claimed identical.
- Blender/ZBrush-class brush breadth, production base meshes, UV editing, texture-pixel painting, and production operator assets remain future work.

## Constitutional boundary

- Anatomy originates in a governed `SculptDocument`, is locked, exported to GLB, and bound to a constitutional record.
- Subdivision is allowed only in the authoring state. It appends stable vertex IDs, increments the topology revision, and records the parent topology digest. Locking ends topology authoring permanently for that lineage.
- A locked lineage permits position edits but never vertex/index addition, removal, remapping, or runtime retopology.
- Species, creator-supplied identity metadata, and morphology controls remain separate.
- Whole-body skin is surface-only. Every texture reference is content-addressed and pinned to exact topology and UV digests. Height/displacement and anatomy mutation are rejected.
- Diffusion may paint or polish governed surfaces. It may not invent, repair, or replace anatomy.

## Governed AI surface boundary

`SurfacePaintAuthorityGrant` revives the useful boundary from SME: an operator may authorize named models, texture channels, step limits, and resolution limits for one exact rig, sculpt, topology digest, and UV digest. `StableDiffusionCppSurfacePainter` sends a sealed UV-layout PNG to Mandala's local stable-diffusion.cpp `/sdapi/v1/img2img` endpoint and accepts PNG pixels back—never vertices, bones, topology, or displacement.

The returned texture and its request, prompt, guide, topology, UV, model, seed, and authority are hashed into `SurfacePaintEvidence`. `applySurfacePaintResultToSkinLayer` refuses mismatched evidence and can change only an approved `SkinLayer` channel. Remote endpoints are rejected by default so unpublished character art stays local unless an operator explicitly opts in.

The normative contract is [ENGINE3D_ANATOMY_SOURCE_SPEC_v1.0.md](../../../docs/4d-engine/engine3d/ENGINE3D_ANATOMY_SOURCE_SPEC_v1.0.md).

## Build and test

```bash
npm run build
npm test
```

The focused suite covers deterministic hashing, soft selection, masks, symmetry, the authoring-to-lock topology lifecycle, all three rig profiles, strict GLB parsing and tamper rejection, whole-body skin policy, governed AI surface-paint authority, constitutional records, deterministic Engine3D/Mandala pose replay, and the command-line pipeline.

## Command-line workflow

```bash
# Generate non-production human, fox, and anthro evidence bundles.
node dist/src/cli.js fixture all --out fixtures

# Inspect or validate a GLB.
node dist/src/cli.js inspect fixtures/human/human-character-fixture.glb
node dist/src/cli.js verify fixtures/human/human-character-fixture.glb --profile human

# Lock an authoring document before GLB export.
node dist/src/cli.js lock authoring.json --out locked.json

# Start the local studio.
node dist/src/cli.js studio --port 1990

# Build, render, seal, and strictly validate the actual Blender anthro proof.
node dist/src/cli.js blender-demo --out fixtures/blender-anthro-v1 --size 768 --seed 1990
```

Each fixture bundle contains the GLB, sculpt document, rig, constitutional record, GLB inspection, and final record digest.

## Actual Blender workflow

The adapter discovers `BLENDER_PATH`, native Blender, Linux user Flatpak Blender, or the former Windows default installation in that order. It then:

1. Reads the governed anthro rig and whole-body skin records.
2. Builds an actual procedural character with all declared bones and facial blendshapes.
3. Freezes triangulation, exports dense morph targets, and seals stable vertex, triangle, material, species, rig, and surface-policy metadata into the GLB.
4. Runs the package's strict GLB validator before reporting success.
5. Emits the `.blend`, governed `.glb`, rendered `.png`, adapter report, and replay audit under `fixtures/blender-anthro-v1`.

The Blender proof also emits `anthro-blender-silhouette.png`, a flat diagnostic pass used to judge torso rhythm, muscle arcs, joint taper, paw arches, and toe/claw flow before Mandala's existing shader stack is applied. It is validation evidence, not a replacement shader.

The picture-first proof is available at `http://127.0.0.1:1990/workflow.html` after starting `node dist/src/cli.js demo --port 1990`. JSON remains available behind “Inspect technical evidence.”

## Studio workflow

1. Start the studio and open `http://127.0.0.1:1990`.
2. Load either a `SculptDocument` or a `sovereign-sculptor-project/1.0` sidecar envelope.
3. Use the orthographic views, region/mask constraints, radius, strength, and explicit symmetry to adjust vertex positions.
4. Inspect rig, blendshape, skin, pose, and constitutional sidecars. Geometry edits deliberately invalidate stale sidecars.
5. Export project JSON, lock the topology with the CLI, then export/validate the GLB through the governed core.

The browser never exports GLB or synthesizes textures. That separation keeps the evidence-producing path small and testable.

## Schemas

- `schemas/sculpt-document.schema.json`
- `schemas/character-rig.schema.json`
- `schemas/anatomy-record.schema.json`
- `schemas/pose-frame.schema.json`
- `schemas/skin-layer.schema.json`

All governed schemas use JSON Schema draft 2020-12, reject unknown fields at record boundaries, and use lowercase hexadecimal SHA-256 digests.

## Next integration: dialogue

Dialogue should produce a deterministic, timestamped phoneme/viseme track that targets the existing rig's declared facial blendshapes. It may animate `jawOpen`, lip, cheek, eye, and expression controls, but it must not alter mesh topology or identity. Audio, dialogue text, timing, voice/model provenance, and the resulting pose-frame digests should travel together as one replayable shot record.
