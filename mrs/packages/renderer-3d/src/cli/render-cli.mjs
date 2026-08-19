#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (k === '--input') opts.input = v;
    if (k === '--output') opts.output = v;
  }
  return opts;
}

async function main() {
  const { input, output } = parseArgs();
  if (!input || !output) {
    console.error('Usage: node render-cli.mjs --input primitive_ref.json --output rendered.png');
    process.exit(1);
  }

  const primRef = JSON.parse(fs.readFileSync(input, 'utf-8'));
  const intentId = primRef.intent_id;
  const material = primRef.material?.intent_id || 'material-disney-v1';
  
  // Create a 2048x2048 canvas with a simple mandala pattern
  const width = 2048;
  const height = 2048;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,width,height);

  // Mandala rings
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let r = 100; r < 1000; r += 100) {
    ctx.beginPath();
    ctx.arc(width/2, height/2, r, 0, Math.PI*2);
    ctx.stroke();
  }

  // Center glow
  const glow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, 300);
  glow.addColorStop(0, 'rgba(100,200,255,0.4)');
  glow.addColorStop(1, 'rgba(100,200,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(width/2, height/2, 300, 0, Math.PI*2);
  ctx.fill();

  // Provenance watermark
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '24px monospace';
  ctx.fillText(`Intent: ${intentId.slice(0,32)}`, 40, height - 80);
  ctx.fillText(`Material: ${material}`, 40, height - 40);
  ctx.fillText(`RT4D Disney PBR`, 40, height - 120);

  const outBuf = canvas.toBuffer('image/png');
  fs.writeFileSync(output, outBuf);
  
  // Write render meta
  const meta = {
    intent_id: intentId,
    material,
    rendered_at: new Date().toISOString(),
    resolution: [width, height],
    spp: primRef.render?.spp || 2,
    constitutional_hash: require('crypto').createHash('sha256').update(JSON.stringify(primRef)).digest('hex')
  };
  fs.writeFileSync(output.replace('.png','.meta.json'), JSON.stringify(meta, null, 2));
  
  console.log(`[MANDALA RT4D] Rendered ${output} @ ${width}x${height}`);
  console.log(`[MANDALA RT4D] Material: ${material}`);
  console.log(`[MANDALA RT4D] Intent: ${intentId}`);
}

main().catch(e => { console.error(e); process.exit(1); });
