import { readFileSync } from 'fs';
import { join } from 'path';
const disney = readFileSync(join(import.meta.dirname, '../gpu/materials/disney.wgsl'), 'utf8');
const ggx = readFileSync(join(import.meta.dirname, '../gpu/materials/ggx.wgsl'), 'utf8');
const clearcoat = readFileSync(join(import.meta.dirname, '../gpu/materials/clearcoat.wgsl'), 'utf8');
const sss = readFileSync(join(import.meta.dirname, '../gpu/materials/sss.wgsl'), 'utf8');

function assert(cond, msg){ if(!cond) throw new Error(msg); }

assert(disney.includes('disneyBRDF'), 'disney missing');
assert(ggx.includes('ggxNDF'), 'ggx missing');
assert(clearcoat.includes('clearcoatFresnel'), 'clearcoat missing');
assert(sss.includes('sssDipole'), 'sss missing');

console.log('material-shaders.test.js PASS');
