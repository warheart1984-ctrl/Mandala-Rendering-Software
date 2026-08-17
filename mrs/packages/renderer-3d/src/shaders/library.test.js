// Stub test for shader library index
import library from './index.js';
console.log('Library version', library.version);
if (!library.provenance || !library.provenance.intentId) {
  console.error('Missing provenance');
  process.exit(1);
}
console.log('Shader library test passed');
