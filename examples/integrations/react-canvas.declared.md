# Declared — React wrapper

No first-party React component package is published from this repo.

A future wrapper could mount a `<canvas>` and drive `CanvasRenderer` the same
way `examples/web-demo/demo.js` does. Until that lands, use:

- `examples/web-demo.html` (vanilla ES modules)
- or the governed host (`js/renderer.js` + `npm start`)
