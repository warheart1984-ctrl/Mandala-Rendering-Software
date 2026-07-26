# SceneBridge to RT4D Universal Contract v1.0

## Purpose

SceneBridge maps any Engine3D world into an RT4D renderable scene and evidence record. HumanRig maps through the same contract as props, lights, cameras, environments, and procedural objects.

## Input

- `world: Engine3DWorldDocument`
- `frameIndex: number`
- `seed: number`

## Output

- `rt4dScene`
- `evidence`

## Mapping

World objects map to RT4D primitives:

- `primitive` maps to `sphere`, `box`, `plane`, `cylinder`, or `torus`
- `mesh` maps to `poly`
- `rig` maps to `skinned-mesh`
- `light` maps to RT4D lighting configuration
- `camera` maps to RT4D camera or character camera configuration
- `group` composes child transforms

Materials map through `MaterialRegistry`:

- `basic`, `skin`, `hair`, `cloth`, `plastic`, `wood`, and `stone` map to diffuse-family BRDFs in the first implementation
- `metal` and `glass` map to GGX-family BRDFs
- `emissive` maps to light/emission materials

HumanRig specialization:

- compute global bone transforms
- deform mesh vertices from weights and joints
- map skin, hair, cloth, eyes, clothing, and accessories to material entries
- emit `skinned-mesh` primitives with per-triangle material slots

## Evidence

Every frame records:

- `frameIndex`
- `seed`
- `worldHash`
- `materialHash`
- `cameraHash`
- `lightingHash`
- `rigHash`, when rigs are present
- `pngChecksum`

Character evidence extends this with:

- `rigId`
- `poseId`
- `boneHash`
- `meshDeformationHash`
- `materialHash`
- `cameraHash`
- `lightingRigHash`
- `pngChecksum`

## Determinism

Given the same world, frame index, seed, materials, camera, lighting, rigs, physics, and particles, SceneBridge must produce identical RT4D scene data and evidence. RT4D replay must produce identical PNG bytes for deterministic backends.
