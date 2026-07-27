# Operator face assets (drop-in)

Place licensed production face GLBs here. Engine3D prefers these over in-repo fixtures at runtime without changing public APIs or logical filenames.

| Drop file | Role |
|-----------|------|
| `HumanFaceNeutral.glb` | Neutral face mesh |
| `HumanFaceRigged.glb` | Rigged mesh + bones + blendshapes |

## Resolution

1. `${OPERATOR_ASSETS_ROOT}/human/<Name>.glb` (this directory when env is unset)
2. Fallback: `mrs/assets/human/<Name>.glb` (CI fixtures)

`OPERATOR_ASSETS_ROOT` defaults to `./operator-assets` and is resolved against the **repository / install root** (not the npm package cwd). Absolute values (e.g. Docker `/operator-assets`) are used as-is.

When an operator file is present, structure stills report `face_asset: "operator"`. Fixtures remain the canonical CI baseline.

## Install helper

From the repo root:

```bash
npm run operator:face-install -- path/to/HumanFaceRigged.glb
npm run operator:face-install -- path/to/HumanFaceNeutral.glb
```

This copies into `operator-assets/human/` and runs `validate:face-glb` for rigged assets.

## Docker / Render

Mount this directory (or set `OPERATOR_ASSETS_ROOT`):

```bash
docker run -v /host/operator-assets:/operator-assets \
  -e OPERATOR_ASSETS_ROOT=/operator-assets ...
```

Do **not** bake production GLBs into the image. In-repo fixtures under `mrs/assets/human/` stay for CI/smoke.

## Drive-G-1

This directory ships empty of production meshes. A 20k–40k sculpt is **declared** as an operator drop-in only — not invented or committed here. `*.glb` under `operator-assets/` is gitignored; keep this README tracked.
