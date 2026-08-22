import { runCLI } from 'jest';

async function runFMCE() {
  const result = await runCLI(
    {
      config: JSON.stringify({
        testEnvironment: 'node',
        roots: ['mrs/packages/renderer-core/src/fmce'],
        verbose: true
      })
    },
    [process.cwd()]
  );

  if (result.results.success) {
    console.log('FMCE Canon Passed — Constitutional System Verified');
  } else {
    console.error('FMCE Canon Failed — Violations Detected');
    process.exit(1);
  }
}

runFMCE();
