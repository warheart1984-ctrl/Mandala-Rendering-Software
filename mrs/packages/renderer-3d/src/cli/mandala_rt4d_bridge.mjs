#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PRIM_REF_PATH = process.argv[2] || 'primitive_ref.json';

function loadPrimitiveRef() {
  const raw = readFileSync(PRIM_REF_PATH, 'utf-8');
  return JSON.parse(raw);
}

function buildRenderPipeline(primRef) {
  const material = primRef.material.intent_id || 'material-disney-v1';
  const resolution = primRef.render.output_resolution || [2048,2048];
  const spp = primRef.render.spp || 2;
  
  return {
    intent_id: primRef.intent_id,
    material,
    resolution,
    spp,
    denoise: primRef.render.denoise,
    shade_wgsl: primRef.render.shade_wgsl,
    material_dispatch: primRef.render.material_dispatch,
    constitutional: primRef.constitutional
  };
}

function main() {
  const primRef = loadPrimitiveRef();
  const pipeline = buildRenderPipeline(primRef);
  
  console.log('[MANDALA RT4D] PrimitiveRef loaded:', primRef.intent_id);
  console.log('[MANDALA RT4D] Material:', pipeline.material);
  console.log('[MANDALA RT4D] Resolution:', pipeline.resolution);
  console.log('[MANDALA RT4D] Constitutional:', pipeline.constitutional.gpu_assist_only);
  
  const output = {
    pipeline,
    provenance_hash: require('crypto').createHash('sha256').update(JSON.stringify(primRef)).digest('hex'),
    generated_at: new Date().toISOString()
  };
  
  writeFileSync('rt4d_render_provenance.json', JSON.stringify(output, null, 2));
  console.log('[MANDALA RT4D] Provenance written to rt4d_render_provenance.json');
}

main();
