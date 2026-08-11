const { workerData, parentPort } = require('worker_threads');
const pt = require('./js-path-tracer');

// ============================================================
// Worker Parameters
// ============================================================
const { masterSeed, totalTiles, gridSize, sceneId, frameId,
        outputBuffer, imageWidth, imageHeight, queueBuffer } = workerData;

// Int32Array view of the shared atomic queue
const queueView = new Int32Array(queueBuffer);

// ============================================================
// Worker Main Loop: Pull tiles from shared atomic queue
// ============================================================

let tileIndex;
while ((tileIndex = pt.pullNextTile(totalTiles, queueView)) !== null) {

  // Derive stable seed from tile index (Axiom-X seed contract)
  // tileIndex is stable - tile 17 always gets same seed regardless of worker count
  const tx = tileIndex % gridSize;
  const ty = Math.floor(tileIndex / gridSize);
  const seed = pt.makeAxiomSeed(masterSeed, sceneId, frameId, tx, ty);

  // Compute tile position in the full image
  const tileW = Math.ceil(imageWidth / gridSize);
  const tileH = Math.ceil(imageHeight / gridSize);
  const x0 = tx * tileW;
  const y0 = ty * tileH;
  const x1 = Math.min(x0 + tileW, imageWidth);
  const y1 = Math.min(y0 + tileH, imageHeight);
  const actualW = x1 - x0;
  const actualH = y1 - y0;

  // Render the tile using the JS path tracer
  const tilePixels = pt.renderTile(
    tileIndex, gridSize, imageWidth, imageHeight,
    seed, x0, y0, actualW, actualH
  );

  // Write tile to shared output buffer at correct offset
  // outputBuffer is a SharedArrayBuffer, pixelView is a Float32Array view
  const outputPixelView = new Float32Array(outputBuffer);
  
  const baseOffset = (y0 * imageWidth + x0) * 4;
  for (let i = 0; i < tilePixels.length; i++) {
    // Clamp to [0,1] and write RGBA
    const px = Math.min(Math.max(tilePixels[i], 0), 1);
    outputPixelView[baseOffset + i] = px;
  }

  // Signal completion to master
  parentPort.postMessage({
    type: 'tileComplete',
    tileIndex,
    x0, y0, x1, y1,
    pixelsRendered: tilePixels.length
  });
}

// Signal master that this worker is done
parentPort.postMessage({ type: 'workerDone' });