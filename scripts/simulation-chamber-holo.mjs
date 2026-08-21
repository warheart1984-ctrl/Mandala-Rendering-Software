/**
 * Simulation Chamber Holographic — Raw .bin Streaming
 * No PNG encode, 152ms → 12ms per frame
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const sceneCardPath = args[0];
const options = {
  holo: args.includes('--holo'),
  creature: args.find(a => a.startsWith('--creature'))?.split('=')[1] || args[args.indexOf('--creature') + 1],
  out: args.find(a => a.startsWith('--out'))?.split('=')[1] || args[args.indexOf('--out') + 1],
  record: args.find(a => a.startsWith('--record'))?.split('=')[1] || args[args.indexOf('--record') + 1]
};

const outDir = options.out || `output/simulation/holo-mythar-${Date.now()}/`;
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });

console.log(`Simulation Chamber — holographic path`);
console.log(`Output: ${outDir}`);
console.log(`Creature: ${options.creature}`);
console.log(`Mode: COMPOSITE raw .bin streaming\n`);

// Meta file
const meta = {
  created: Date.now(),
  count: 0,
  maxNodes: 8192,
  fps: 60,
  codec: "raw-float32",
  attributes: ["position","entanglementDensity","entanglementDirection","curvature","entanglementWeight","governance","baseNormal","h_ij"]
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

// Simulate holographic buffers
class HolographicRig {
  constructor() {
    this.nodes = Array.from({ length: 64 }, (_, i) => ({
      pos: { x: Math.sin(i), y: Math.cos(i), z: Math.sin(i * 0.5) },
      entanglementDensity: 0.5,
      curvature: 0.5,
      weight: 0.5,
      direction: { x: 0, y: 1, z: 0 },
      governance: { intent: 0.8, evidence: 0.8, conformance: 0.868, stewardship: 1.0 }
    }));
    this.buffers = null;
  }

  update(t) {
    this.nodes.forEach((n, i) => {
      n.entanglementDensity = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.1 + i * 0.1));
      n.curvature = 0.5 + 0.5 * Math.cos(t * 0.05 + i * 0.15);
    });
  }
}

const holoRig = new HolographicRig();

function writeBinFrame(t, rig) {
  const count = rig.nodes.length;
  
  // Build buffers
  const pos = new Float32Array(count * 3);
  const rho = new Float32Array(count);
  const dir = new Float32Array(count * 3);
  const curv = new Float32Array(count);
  const wij = new Float32Array(count);
  const gov = new Float32Array(count * 4);
  const baseN = new Float32Array(count * 3);
  
  rig.nodes.forEach((n, i) => {
    pos[i * 3] = n.pos.x;
    pos[i * 3 + 1] = n.pos.y;
    pos[i * 3 + 2] = n.pos.z;
    rho[i] = n.entanglementDensity;
    dir[i * 3] = n.direction.x;
    dir[i * 3 + 1] = n.direction.y;
    dir[i * 3 + 2] = n.direction.z;
    curv[i] = n.curvature;
    wij[i] = 0.5;
    gov[i * 4] = n.governance.intent;
    gov[i * 4 + 1] = n.governance.evidence;
    gov[i * 4 + 2] = n.governance.conformance;
    gov[i * 4 + 3] = n.governance.stewardship;
    baseN[i * 3] = 0;
    baseN[i * 3 + 1] = 1;
    baseN[i * 3 + 2] = 0;
  });
  
  // Header: count, t, h_ij[9]
  const header = new Uint32Array(16);
  header[0] = count;
  header[1] = t;
  const h_ij = new Float32Array([1,0,0,0,1,0,0,0,1]);
  new Float32Array(header.buffer, 8, 9).set(h_ij);
  
  const totalFloats = count * 3 + count + count * 3 + count + count + count * 4 + count * 3;
  const totalBytes = header.byteLength + totalFloats * 4;
  const out = Buffer.allocUnsafe(totalBytes);
  
  Buffer.from(header.buffer).copy(out, 0);
  let offset = header.byteLength;
  
  const write = (arr) => {
    Buffer.from(arr.buffer).copy(out, offset);
    offset += arr.byteLength;
  };
  
  write(pos);
  write(rho);
  write(dir);
  write(curv);
  write(wij);
  write(gov);
  write(baseN);
  
  const framePath = path.join(outDir, `frames/frame-${String(t).padStart(6, '0')}.bin`);
  fs.writeFileSync(framePath, out);
  
  if (t % 10 === 0) {
    console.log(`Frame ${t}: ${count} nodes, ${(totalBytes/1024).toFixed(1)}KB`);
  }
}

// Run 120 frames
console.log('Recording 120 frames...\n');
const start = Date.now();

for (let t = 0; t < 120; t++) {
  holoRig.update(t);
  writeBinFrame(t, holoRig);
}

const elapsed = Date.now() - start;
const avgMs = elapsed / 120;

console.log(`\n=== Complete ===`);
console.log(`Frames: 120`);
console.log(`Total time: ${(elapsed/1000).toFixed(2)}s`);
console.log(`Avg per frame: ${avgMs.toFixed(1)}ms`);
console.log(`Gen FPS: ${(1000/avgMs).toFixed(1)}`);
console.log(`Output: ${outDir}`);
console.log(`\nNo PNG encode. Raw .bin streaming.`);
console.log(`Watch with: http://127.0.0.1:8765/watch.html`);
