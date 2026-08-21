/**
 * Constitutional Runtime Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ConstitutionalRuntime } from './constitutional-runtime.js';

describe('ConstitutionalRuntime', () => {
  test('creates with default settings', () => {
    const runtime = new ConstitutionalRuntime();
    assert.ok(runtime);
    assert.ok(runtime.stateStore);
    assert.ok(runtime.validator);
    assert.equal(runtime.sessionId.length > 0, true);
  });

  test('initializes with world ID', async () => {
    const runtime = new ConstitutionalRuntime();
    const result = await runtime.initialize('world-001');
    
    assert.equal(result.status, 'initialized');
    assert.equal(result.worldId, 'world-001');
    assert.ok(result.stateId);
    assert.ok(result.certifiedHash);
    assert.equal(runtime.currentWorldId, 'world-001');
  });

  test('rejects initialization without world ID', async () => {
    const runtime = new ConstitutionalRuntime();
    
    await assert.rejects(
      async () => await runtime.initialize(),
      { message: 'World ID required for initialization' }
    );
  });

  test('proposes and certifies valid state', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result = await runtime.proposeState(proposal);
    
    assert.equal(result.status, 'certified');
    assert.ok(result.stateId);
    assert.ok(result.certifiedHash);
    assert.ok(result.aaisSignature);
  });

  test('rejects state with AAIS violations', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    // First certify a valid state
    const proposal1 = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result1 = await runtime.proposeState(proposal1);
    assert.equal(result1.status, 'certified');
    
    // Now try to change energy (should fail)
    const proposal2 = {
      intent_id: 'intent-002',
      world_id: 'world-001',
      previous_state_id: result1.stateId,
      simulation_step: 2,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: { energy: 200 }, // Changed!
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result2 = await runtime.proposeState(proposal2);
    
    assert.equal(result2.status, 'rejected');
    assert.ok(result2.violations);
    assert.ok(result2.violations.some(v => v.invariant === 'energy_conservation'));
  });

  test('rejects proposal without required fields', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    await assert.rejects(
      async () => await runtime.proposeState({ world_id: 'world-001' }),
      { message: /Proposal missing required fields/ }
    );
  });

  test('rejects proposal with wrong world ID', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-002', // Wrong world
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await assert.rejects(
      async () => await runtime.proposeState(proposal),
      { message: /World ID mismatch/ }
    );
  });

  test('renders certified state', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const result = await runtime.renderState({ width: 1920, height: 1080 });
    
    assert.ok(result);
    assert.equal(result.status, undefined); // renderState doesn't return status
    assert.ok(result.renderId);
    assert.ok(result.provenance);
    assert.equal(result.worldId, 'world-001');
    assert.equal(result.certified, true);
  });

  test('rejects render without initialization', async () => {
    const runtime = new ConstitutionalRuntime();
    
    await assert.rejects(
      async () => await runtime.renderState({}),
      { message: 'No certified state available for rendering' }
    );
  });

  test('constitutional loop completes successfully', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const proposal = {
      intent_id: 'intent-loop-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: {
        lattice: { topology: 'tesseract' }
      },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result = await runtime.constitutionalLoop(proposal, { width: 800, height: 600 });
    
    assert.equal(result.status, 'complete');
    assert.equal(result.stage, 'rendered');
    assert.ok(result.certification);
    assert.ok(result.render);
    assert.ok(result.provenanceChain);
  });

  test('constitutional loop rejects invalid proposal', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    // First certify with energy 100
    const proposal1 = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 100 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await runtime.proposeState(proposal1);
    
    // Now try invalid proposal with energy change
    const proposal2 = {
      intent_id: 'intent-002',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 2,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 200 }, // Changed
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    const result = await runtime.constitutionalLoop(proposal2, {});
    
    assert.equal(result.status, 'rejected');
    assert.equal(result.stage, 'certification');
  });

  test('tracks provenance chain', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await runtime.proposeState(proposal);
    await runtime.renderState({});
    
    const chain = runtime.getProvenanceChain();
    
    assert.ok(chain.length >= 3); // initialize, certify, render
    assert.ok(chain.some(e => e.event === 'initialize'));
    assert.ok(chain.some(e => e.event === 'state_certified'));
    assert.ok(chain.some(e => e.event === 'render'));
  });

  test('tracks render history', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    await runtime.renderState({});
    await runtime.renderState({});
    
    const history = runtime.getRenderHistory();
    
    assert.equal(history.length, 2);
    assert.ok(history[0].renderId);
    assert.ok(history[0].timestamp);
    assert.ok(typeof history[0].duration === 'number');
  });

  test('tracks metrics', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const proposal = {
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    };
    
    await runtime.proposeState(proposal);
    await runtime.renderState({});
    
    const metrics = runtime.getMetrics();
    
    assert.ok(metrics.totalRenders >= 0);
    assert.ok(metrics.successfulRenders >= 0);
    assert.ok(metrics.rejectedStates >= 0);
    assert.ok(metrics.aaisViolations >= 0);
  });

  test('getStatus returns runtime status', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const status = runtime.getStatus();
    
    assert.ok(status.initialized);
    assert.equal(status.worldId, 'world-001');
    assert.ok(status.currentStateId);
    assert.ok(status.sessionId);
    assert.ok(status.metrics);
  });

  test('reset clears runtime state', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    await runtime.proposeState({
      intent_id: 'intent-001',
      world_id: 'world-001',
      previous_state_id: runtime.currentStateId,
      simulation_step: 1,
      fields: { lattice: { topology: 'tesseract' } },
      conserved_quantities: { energy: 0 },
      causality_bounds: { max_light_speed: 1.0 }
    });
    
    runtime.reset();
    
    const status = runtime.getStatus();
    
    assert.ok(!status.initialized);
    assert.equal(status.worldId, null);
    assert.equal(status.currentStateId, 'genesis');
    assert.equal(runtime.getProvenanceChain().length, 0);
    assert.equal(runtime.getRenderHistory().length, 0);
  });

  test('verifies state integrity', async () => {
    const runtime = new ConstitutionalRuntime();
    await runtime.initialize('world-001');
    
    const state = runtime.getCurrentState();
    assert.ok(state);
    
    const verification = runtime.verifyState(state.state_id);
    
    assert.ok(verification);
    assert.ok(verification.valid);
    assert.ok(verification.hashValid);
    assert.ok(verification.provenanceValid);
  });
});
