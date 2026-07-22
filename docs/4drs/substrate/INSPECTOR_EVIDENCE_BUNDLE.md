# Inspector evidence bundle

**Status:** **declared**. Used for replay / research artifacts.

```
InspectorEvidenceBundle
├── schemaVersion: "1.1"
├── frameIndex
├── rayInput (origin, dir) | screenInput (sx, sy)
├── bvhPath[]
├── primitiveId
├── Inspector4DResult
└── hash (sha256 of canonical JSON body without hash)
```

**Replay rule (intent):** identical initial state, inputs, and RNG seed ⇒ identical bundle hash. Full bit-identity across hosts is **not** claimed enforced in v1.1.

Engine helper: `buildInspectorEvidenceBundle(result, meta)` in `4d-renderer/src/inspector/serialize.js`.
