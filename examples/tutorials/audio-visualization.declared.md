# Declared — audio visualization

`mrs/packages/renderer-core/src/audio/AudioVisualizer.js` includes `AudioAnalyzer` with
`loadMicrophone()` / `loadAudio()` using the Web Audio API.

**Not claimed in the examples suite:**

- No live mic binding in `web-demo.html`
- No committed audio assets or reactive rotation demo

The governed browser host also does not currently ship a mic UI. Treat audio-reactive
4D as an available library module, not a showcase feature, until a dedicated demo
is wired and tested.
