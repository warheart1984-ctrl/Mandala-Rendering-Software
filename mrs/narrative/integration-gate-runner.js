// mrs/narrative/integration-gate-runner.js
// Integration Gate Test Runner

import { IntegrationGate } from './integration-gate.js';

async function runIntegrationGate() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MANDALA + MYTHAR INTEGRATION GATE - PRODUCTION TEST     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const gate = new IntegrationGate({
    workDir: './integration-gate-output',
  });
  
  try {
    const results = await gate.runAllTests();
    
    if (results.overall) {
      console.log('\n🎉 INTEGRATION GATE PASSED - SYSTEM PRODUCTION READY');
      process.exit(0);
    } else {
      console.log('\n💥 INTEGRATION GATE FAILED - NOT PRODUCTION READY');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Integration gate crashed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationGate();
}

export { IntegrationGate };
export default IntegrationGate;