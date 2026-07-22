# Integrations (declared / skeleton)

Thin notes only — not installable plugins.

| Integration | Status | Evidence |
| --- | --- | --- |
| CLI (`4d-render`) | Present | `4d-renderer/src/cli.js`, `npm run render:4d` |
| Browser host adapter | Present | `js/renderer.js` → `CanvasRenderer` |
| Unity mesh JSON | Partial | `npm run export:surfaces` → StreamingAssets |
| Unreal mesh JSON | Partial | same mesh export → Content/Surfaces |
| React wrapper | Declared | See `react-canvas.declared.md` |
| Three.js bridge | Declared | See `threejs.declared.md` |

Do not treat this folder as a marketplace of production SDKs.
