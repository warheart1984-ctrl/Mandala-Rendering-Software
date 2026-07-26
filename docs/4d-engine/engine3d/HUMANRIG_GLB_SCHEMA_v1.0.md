# HumanRig GLB Schema v1.0

## Nodes

Bones are GLTF nodes with:

- `name` equal to the canonical bone id, such as `spine`, `head`, or `thigh_L`
- `extras.humanRigBone = true`

## Meshes

Head, body, hair, clothing, and accessory meshes declare:

- `extras.humanRigMeshRole = "head" | "body" | "hair" | "clothing" | "accessory"`

## Materials

GLTF materials declare:

- `extras.humanRigMaterialType = "skin" | "hair" | "cloth" | "metal" | "glass"`

## Skinning

HumanRig uses standard GLTF skinning:

- `skins[joints]` map to bone nodes
- joint indices and weights are stored in standard vertex attributes
- bone nodes must match the canonical naming table for portable replay

## Poses

Animation clips may declare:

- `extras.humanRigPoseId = "pose_name"`

SceneBridge uses tagged clips to populate the pose library and deterministic pose state for evidence.
