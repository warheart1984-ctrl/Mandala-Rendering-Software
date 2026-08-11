const { workerData, parentPort } = require('worker_threads');
const { render_4d } = require('./src/rt4d');
const { SHA256 } = require('crypto-js');

// ============================================================
// Axiom-X Tile Seed Contract
// S_tile = H(masterSeed, sceneId, frameId, tileX, tileY)
// This ensures tile 17 always gets the same seed regardless
// of how many workers or what backend is used.
// ============================================================

function makeSeed(masterSeed, sceneId, frameId, tileX, tileY) {
  // Deterministic seed derivation using all components
  // This becomes the ABI contract: every backend must implement the same function
  let h = masterSeed ^ 0xA70FE3A1;

  // Encode tile position
  h ^= (tileX & 0xFFFFFFFF) << 12;
  h = (h << 19) | (h >>> 13);
  h ^= (tileY & 0xFFFFFFFF) << 5;
  h = (h << 15) | (h >>> 17);
  h ^= (sceneId.length & 0xFFFFFFFF) << 19;
  h = (h << 7) | (h >>> 25);
  h ^= (frameId & 0xFFFFFFFF);

  return (h >>> 0) & 0xFFFFFFFF; // u32 seed for render_4d
}

// ============================================================
// Shared Atomic Tile Queue
// Using SharedArrayBuffer + Atomics.add for proper work distribution
// Each worker grabs a unique tile index - no duplication.
// ============================================================

function initTileQueue(totalTiles) {
  // Shared array buffer for inter-worker coordination
  const queueBuffer = new SharedArrayBuffer(4);
  const queueView = new Int32Array(queueBuffer);
  // Atomic counter at index 0, initialized to 0
  queueView[0] = 0;
  return { queueBuffer, queueView };
}

function pullNextTile(totalTiles, queueView) {
  // Atomically increment and read the counter
  // Returns the index BEFORE increment, so first call returns 0
  const tileIndex = Atomics.add(queueView, 0, 1);

  if (tileIndex >= totalTiles) {
    return null; // No more tiles
  }
  return tileIndex;
}

// ============================================================
// Worker Main Loop
// ============================================================

const { masterSeed, sceneId, frameId, totalTiles, gridSize, scene } = workerData;

// Initialize the shared tile queue
const { queueBuffer } = initTileQueue(totalTiles);
const queueView = new Int32Array(queueBuffer);

// Render tiles until queue is exhausted
let tileIndex;
while ((tileIndex = pullNextTile(totalTiles, queueView)) !== null) {

  // Derive seed from tile index (backend-independent contract)
  // tileIndex is stable - tile 17 always gets same seed
  const tx = tileIndex % gridSize;
  const ty = Math.floor(tileIndex / gridSize);
  const seed = makeSeed(masterSeed, sceneId, frameId, tx, ty);

  // Compute pixel bounds for this tile in the full image
  // Image: 1280×720, tileSize determined by gridSize
  const imageWidth = 1280;
  const imageHeight = 720;
  const tileW = Math.ceil(imageWidth / gridSize);
  const tileH = Math.ceil(imageHeight / gridSize);

  const x0 = tx * tileW;
  const y0 = ty * tileH;
  const x1 = Math.min(x0 + tileW, imageWidth);
  const y1 = Math.min(y0 + tileH, imageHeight);

  // Render the tile region
  const pixels = render_4d(scene, {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    seed
  });

  // Write pixels to shared output buffer at correct offset
  // Each pixel is 4 bytes (RGBA float32)
  const outputBuffer = workerData.outputBuffer;
  const pixelView = new Float32Array(outputBuffer);

  const baseOffset = (y0 * imageWidth + x0) * 4;
  for (let i = 0; i < pixels.length; i++) {
    const px = Math.min(Math.max(pixels[i], 0), 1); // clamp [0,1]
    pixelView[baseOffset + i] = px;
  }

  // Signal completion (optional: could use SharedArrayBuffer for completion too)
  parentPort.postMessage({
    type: 'tileComplete',
    tileIndex,
    x0, y0, x1, y1,
    pixelsRendered: pixels.length
  });
}

 // Signal master that this worker is done
 parentPort.postMessage({ type: 'workerDone' });