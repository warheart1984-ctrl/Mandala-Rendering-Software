# Scene-spec playground (prototype)

**Status:** prototype — not a second SceneSpecification SoT.

Generates **live** SceneSpecification JSON (`schemaVersion: "1.0"`, `geometry.kind: "surface"`, RT4D `surfaceId`s) using [`mapping-tables.json`](../renderer-core/src/scene-spec/mapping-tables.json).

Does **not** implement EmbeddedSurface4D / Material4DDesc / hex observation modes.

## Run

```bash
cd mrs/packages/scene-spec-playground
node generate.mjs
```

Paste `spec` into Genblaze `POST /api/render-scene` (or the UI). Receipt `sceneSpecHash` is a real SHA-256 of canonical JSON.

## Docs

- [SCENE_SPEC_RFC.md](../../../docs/4d-engine/v2/scene-spec/SCENE_SPEC_RFC.md)
- [SCENE_SPEC_IMPROVEMENT_RFC.md](../../../docs/4d-engine/v2/scene-spec/SCENE_SPEC_IMPROVEMENT_RFC.md)
