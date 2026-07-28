/**
 * SceneSpec lineage tracker (assist → hints → print hash).
 *
 * STATUS: **partial** — in-memory / injectable store; never stores API keys.
 * Drive-G-1: summaries only for FLUX; print records frameHash only.
 */

export class MemoryLineageStore {
  constructor() {
    this.rows = [];
  }

  append(row) {
    this.rows.push(row);
    return row;
  }

  list() {
    return [...this.rows];
  }
}

export class SceneSpecLineageTracker {
  /**
   * @param {{ append: (row: object) => unknown, list?: () => object[] }} store
   */
  constructor(store) {
    this.store = store || new MemoryLineageStore();
  }

  recordFluxAssist({ intentId, sourceImage, prompt, fluxResult }) {
    return this.store.append({
      type: "flux-assist",
      intentId,
      sourceImage: sourceImage || null,
      prompt: prompt || null,
      fluxResultSummary: this._summarizeFlux(fluxResult),
      timestamp: new Date().toISOString(),
      assistOnly: true,
      printSoT: false,
    });
  }

  recordSceneSpec({ intentId, sceneSpecHints }) {
    return this.store.append({
      type: "scene-spec",
      intentId,
      sceneSpecHints: sceneSpecHints || null,
      timestamp: new Date().toISOString(),
      assistOnly: true,
      printSoT: false,
    });
  }

  recordCharacterSpec({ intentId, characterSpec }) {
    return this.store.append({
      type: "character-spec",
      intentId,
      characterSpec: characterSpec || null,
      timestamp: new Date().toISOString(),
      assistOnly: true,
      printSoT: false,
    });
  }

  recordRt4dPrint({ intentId, frameHash }) {
    return this.store.append({
      type: "rt4d-print",
      intentId,
      frameHash: frameHash || null,
      timestamp: new Date().toISOString(),
      assistOnly: false,
      printSoT: true,
    });
  }

  _summarizeFlux(fluxResult) {
    const fr = fluxResult || {};
    return {
      tags: fr.tags || [],
      palette: fr.palette || [],
      camerasCount: (fr.cameras || []).length,
      lightingCount: (fr.lighting || []).length,
      // Never include secrets or raw base64 plates here.
    };
  }
}

export default SceneSpecLineageTracker;
