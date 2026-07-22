# Examples suite (4DRS / Mandala)

Evidence-bound showcase for the **reference implementation** surface renderer.
Statuses follow Drive-G-1 / Drive-G-2: no claim outruns code.

| Artifact | Status | Notes |
| --- | --- | --- |
| [web-demo.html](./web-demo.html) | **Present** | Canvas 2D + optional hyperplane slice |
| [gallery/](./gallery/) | **Operator-generated** | Run `generate.mjs` to write PNGs |
| [tutorials/](./tutorials/) | **Present** | Node-runnable scripts for real APIs |
| [scenes/](./scenes/) | **Declared preset format** | JSON matches `createScene()` fields |
| [videos/](./videos/) | **Scaffold** | How to encode via CLI; no binaries shipped |
| [benchmarks/](./benchmarks/) | **Present** | Measures local Node render timing |
| [comparisons/](./comparisons/) | **Present** | Wireframe vs solid PNG pair |
| [integrations/](./integrations/) | **Declared stubs** | Thin notes only — not full plugins |
| [site/](./site/) | **Pages prep** | Static entry; no live URL claimed |

## Run the interactive demo

From the **repo root** (ES modules need HTTP):

```bash
npm run serve
# open http://localhost:8080/examples/web-demo.html
```

Or any static server that serves the repository root.

## Governed host (separate)

Full constitutional host with timelines / CSSV:

```bash
npm start
# http://localhost:8080/  (index.html)
```
