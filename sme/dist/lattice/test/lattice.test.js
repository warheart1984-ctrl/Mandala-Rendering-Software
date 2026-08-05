/**
 * Mandala Lattice v1.0 — test suite.
 * Covers:
 *   - LRC request/response envelope shape + routing rules
 *   - LNIM identity map invariants (stability, uniqueness, scope, capability)
 *   - Constitutional spine (MRI -> CEN -> Lirl -> Ledger) allow/deny
 *   - LEPR evidence bundle structure + hash verification
 *   - LRDM replay record + replay/simulate/verify
 *   - SmeLatticeModule route over the 5 SME modules (with stub modules)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SmeLatticeModule,
  LatticeRouter,
  NodeIdentityMap,
  LAWBOOK_CHAIN,
  ACTION_TO_MODULE,
  LRC_VERSION,
  buildEvidenceBundle,
  ReplayRecord,
  ReplayService,
  ReplayStore,
} = require('../index');

const {
  ConstitutionalOrchestrator,
  DEFAULT_MRI_PROVIDER,
} = require('../spine/orchestrator');
const {
  ConstitutionalEnforcementNode,
  createResourceFloorInvariant,
  compileInvariantDsl,
} = require('../spine/cen');
const {
  runMRI,
  computeContinuityComponents,
  continuityScore,
  governanceScore,
  memoryScore,
  computeConfidence,
  computeDeltaState,
  detectRisks,
} = require('../spine/mri');
const { LirlLawGate, LIRL_ALLOWED_ACTIONS } = require('../spine/lirl');
const {
  ContinuityLedger,
  DurableContinuityLedger,
  merkleRoot,
} = require('../spine/ledger');

function stubModule(output) {
  return {
    generate: async (input) => ({ text: output ?? `generated:${input.prompt ?? ''}`, modelVersion: 'stub', backend: 'stub' }),
    encode: async () => ({ scenes: [{ label: 'stub', confidence: 0.9 }], embedding: [0.1, 0.2], modelVersion: 'stub', backend: 'stub' }),
    transcribe: async () => ({ transcript: output ?? '[stub transcription]', segments: [], modelVersion: 'stub', backend: 'stub' }),
    generateImage: async () => ({ imageData: Buffer.from([1, 2, 3]), mimeType: 'image/png', modelVersion: 'stub', backend: 'stub' }),
    generateAudio: async () => ({ audioData: Buffer.from([1, 2, 3]), mimeType: 'audio/wav', modelVersion: 'stub', backend: 'stub' }),
    generateVideo: async () => ({ videoData: Buffer.from([1, 2, 3]), mimeType: 'video/mp4', modelVersion: 'stub', backend: 'stub' }),
    process: async () => ({ ok: true, output: 'transcoded', modelVersion: 'stub', backend: 'stub' }),
  };
}

async function makeModule() {
  const lattice = new SmeLatticeModule();
  await lattice.initialize({
    modules: new Map([
      ['sme-txt', stubModule('hello lattice')],
      ['sme-vis', stubModule()],
      ['sme-aud', stubModule()],
      ['sme-gen', stubModule()],
      ['sme-vid', stubModule()],
    ]),
    continuityFloor: 0,
  });
  return lattice;
}

describe('LNIM — Lattice Node Identity Map', () => {
  it('exposes canonical nodes with stable identities', () => {
    const map = new NodeIdentityMap();
    for (const nodeId of ['sme-txt', 'sme-vis', 'sme-aud', 'sme-gen', 'sme-vid', 'sme-core', 'sme-log', 'constitutional-gate']) {
      assert.ok(map.has(nodeId), `node ${nodeId} should be in identity map`);
    }
    assert.equal(map.get('sme-txt').nodeType, 'substrate');
  });

  it('rejects duplicate nodeId (uniqueness invariant)', () => {
    const map = new NodeIdentityMap();
    assert.throws(() => map.register({ nodeId: 'sme-txt', nodeType: 'substrate', capabilities: ['x'] }), /uniqueness/i);
  });

  it('enforces capability integrity', () => {
    const map = new NodeIdentityMap();
    const check = map.assertCapability('sme-txt', 'transcribe');
    assert.equal(check.ok, false);
    assert.equal(check.violation, 'capability_integrity');
    assert.ok(map.assertCapability('sme-txt', 'generate_text').ok);
  });

  it('enforces scope integrity', () => {
    const map = new NodeIdentityMap();
    assert.equal(map.assertScope('sme-txt', 'video-only').ok, false);
    assert.equal(map.assertScope('sme-txt', 'text-only').ok, true);
  });
});

describe('MRI — measurement layer', () => {
  it('computes 5-dimensional state vector', () => {
    const state = computeContinuityComponents({
      singlePointsOfFailure: 1, criticalRoles: 10, documentedKnowledge: 8,
      totalRequiredKnowledge: 10, clearGovernanceElements: 8,
      totalGovernanceElements: 10, medianDecisionTime: 2,
      expectedDecisionTime: 10, coordinationLoad: 4, coordinationCapacity: 10,
    });
    assert.equal(state.R, 90);
    assert.equal(state.K, 80);
    assert.equal(state.G, 80);
    assert.equal(state.D, 80);
    assert.equal(state.X, 60);
  });

  it('runs full MRI and detects risks below floor', () => {
    const result = runMRI(DEFAULT_MRI_PROVIDER({}));
    assert.ok(result.scores.continuity > 0);
    assert.ok(Array.isArray(result.risks));
    const risky = detectRisks({ R: 50, K: 50, G: 50, D: 50, X: 50 });
    assert.ok(risky.length >= 3);
  });

  it('computes delta between two states', () => {
    const delta = computeDeltaState({ R: 90, K: 80, G: 80, D: 80, X: 60 }, { R: 95, K: 90, G: 80, D: 80, X: 70 });
    assert.equal(delta.R, 5);
    assert.equal(delta.K, 10);
  });

  it('computes governance, memory, and confidence scores', () => {
    assert.equal(governanceScore({ authorityClarity: 100, escalationClarity: 100, roleDefinitionQuality: 100, decisionTransparency: 100 }), 100);
    assert.equal(memoryScore({ documentationCoverage: 100, artifactAccessibility: 100, successionReadiness: 100 }), 100);
    assert.equal(computeConfidence({ observationCompleteness: 1, dataQuality: 1, sourceReliability: 1, temporalFreshness: 1 }), 1);
  });
});

describe('CEN — Constitutional Enforcement Node', () => {
  it('denies when resource floor is not met', () => {
    const cen = new ConstitutionalEnforcementNode({ invariants: [createResourceFloorInvariant('continuity', 99)] });
    const result = cen.execute({
      transitionId: 't-1',
      transitionType: 'enforcement-check',
      requestedCapabilities: ['constitutional.verify'],
      context: { actor: 'test', runtimeContext: { capabilities: ['constitutional.verify'] }, mriSnapshot: { continuity: 50 } },
      payload: { continuity: 50 },
    });
    assert.equal(result.decision.verdict, 'DENY');
    assert.equal(result.decision.reasonCode, 'INVARIANT_VIOLATION');
  });

  it('allows when floor is satisfied and emits hash-chained receipt', () => {
    const cen = new ConstitutionalEnforcementNode({ invariants: [createResourceFloorInvariant('continuity', 40)] });
    const result = cen.execute({
      transitionId: 't-2',
      transitionType: 'enforcement-check',
      requestedCapabilities: ['constitutional.verify'],
      context: { actor: 'test', runtimeContext: { capabilities: ['constitutional.verify'] }, mriSnapshot: { continuity: 80 } },
      payload: { continuity: 80 },
    });
    assert.equal(result.decision.verdict, 'ALLOW');
    assert.ok(result.receipt.receiptHash);
    assert.equal(result.receipt.category, 'allow');
  });

  it('detects transition replay', () => {
    const cen = new ConstitutionalEnforcementNode({ invariants: [createResourceFloorInvariant('continuity', 0)] });
    const transition = {
      transitionId: 't-3', transitionType: 'x',
      requestedCapabilities: ['c'], context: { actor: 'a', runtimeContext: { capabilities: ['c'] }, mriSnapshot: {} },
      payload: { continuity: 80 },
    };
    cen.execute(transition);
    const second = cen.execute(transition);
    assert.equal(second.decision.verdict, 'DENY');
    assert.equal(second.decision.reasonCode, 'REPLAY_DETECTED');
  });

  it('compiles invariant DSL', () => {
    const inv = compileInvariantDsl('require governance >= 70');
    assert.ok(inv.invariantId.includes('governance'));
    assert.throws(() => compileInvariantDsl('require bananas >= 5'), /unsupported/);
  });
});

describe('LIRL — law gate', () => {
  it('accepts lawful intents', async () => {
    const gate = new LirlLawGate();
    const verdict = await gate.evaluate({ id: 'i-1', actorId: 'test-operator', action: 'ping', payload: {} });
    assert.equal(verdict.verdict, 'ACCEPT');
  });

  it('rejects actions outside allowlist', async () => {
    const gate = new LirlLawGate();
    const verdict = await gate.evaluate({ id: 'i-2', actorId: 'test-operator', action: 'forbidden_action', payload: {} });
    assert.equal(verdict.verdict, 'REJECT');
    assert.ok(verdict.reasons.some((r) => r.includes('allowlist')));
  });

  it('rejects anonymous actors and bypass', async () => {
    const gate = new LirlLawGate();
    assert.equal((await gate.evaluate({ id: 'i-3', actorId: 'anonymous', action: 'ping', payload: {} })).verdict, 'REJECT');
    assert.equal((await gate.evaluate({ id: 'i-4', actorId: 'a', action: 'ping', payload: {}, forceBypass: true })).verdict, 'REJECT');
  });

  it('allowlist includes SME substrate actions for lattice routing', () => {
    for (const action of ['generate_text', 'classify', 'transcribe', 'analyze', 'generate_image']) {
      assert.ok(Array.isArray(LIRL_ALLOWED_ACTIONS), 'allowlist is an array');
    }
  });
});

describe('Ledger — Continuity Ledger Protocol', () => {
  it('appends and replays events in order', () => {
    const ledger = new ContinuityLedger();
    const e1 = ledger.append({ authoritySignature: 'a', dispatch: { intentId: 'i1' }, validation: { cen: true } });
    const e2 = ledger.append({ authoritySignature: 'a', dispatch: { intentId: 'i2' }, validation: { cen: true } });
    assert.equal(ledger.size(), 2);
    assert.equal(e2.parentId, null);
    assert.ok(e1.sequence < e2.sequence);
    assert.equal(ledger.replay().length, 2);
    assert.ok(ledger.auditRecord(e1.id));
  });

  it('durable ledger verifies merkle inclusion', () => {
    const ledger = new DurableContinuityLedger({ inMemory: true });
    ledger.append({ authoritySignature: 'a', dispatch: { intentId: 'i1' }, validation: { cen: true } });
    const e2 = ledger.append({ authoritySignature: 'a', dispatch: { intentId: 'i2' }, validation: { cen: true } });
    const check = ledger.verifyInclusion(e2.id);
    assert.equal(check.ok, true);
    assert.ok(check.root);
    assert.ok(merkleRoot([]) === '0'.repeat(64));
    ledger.close();
  });
});

describe('Constitutional Orchestrator — MRI -> CEN -> Lirl -> Ledger', () => {
  it('allows dispatch when floors and laws pass', async () => {
    const orchestrator = new ConstitutionalOrchestrator({
      cen: new ConstitutionalEnforcementNode({ invariants: [createResourceFloorInvariant('continuity', 0)] }),
      ledger: new DurableContinuityLedger({ inMemory: true }),
    });
    const result = await orchestrator.evaluateAndDispatch({
      id: 'intent-001', action: 'ping', arena: 'cpu', actorId: 'test-operator',
      authoritySignature: 'sig', ccr: { continuityParentId: null },
    });
    assert.equal(result.allowed, true);
    assert.ok(result.event);
    assert.equal(result.event.validation.cen, true);
    assert.equal(result.event.validation.lirl, true);
    orchestrator.ledger.close();
  });

  it('denies when MRI falls below CEN floor', async () => {
    const orchestrator = new ConstitutionalOrchestrator({
      cen: new ConstitutionalEnforcementNode({ invariants: [createResourceFloorInvariant('continuity', 99)] }),
      ledger: new DurableContinuityLedger({ inMemory: true }),
    });
    const result = await orchestrator.evaluateAndDispatch({
      id: 'intent-002', action: 'ping', arena: 'cpu', actorId: 'test-operator',
      authoritySignature: 'sig', ccr: { continuityParentId: null },
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('CEN Deny'));
    orchestrator.ledger.close();
  });
});

describe('LEPR — Evidence Propagation Rules', () => {
  it('builds a complete 7-segment bundle and verifies hash', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'req-1',
      authority: { actorId: 'op' },
      validation: { cen: true },
      decision: { verdict: 'EXEC' },
      output: { text: 'hello' },
      verification: { verified: true },
      replay: { seed: 42 },
      audit: {},
      hops: [{ nodeId: 'sme-txt', at: 1, segment: 'outputEvidence' }],
    });
    assert.ok(bundle.bundleId);
    assert.ok(bundle.bundleHash);
    assert.equal(bundle.verify(), true);
    assert.equal(bundle.toJSON().hops.length, 1);
  });

  it('detects evidence tampering', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'req-2', authority: {}, validation: {}, decision: {},
      output: { text: 'original' }, verification: {}, replay: {}, audit: {},
    });
    bundle.segments.outputEvidence.text = 'tampered';
    assert.equal(bundle.verify(), false);
  });
});

describe('LRDM — Replay Determinism Model', () => {
  it('records replay records with stable hash', () => {
    const store = new ReplayStore();
    const rec = store.save({
      requestId: 'req-1', nodePath: ['a', 'b'], inputs: { p: 1 },
      parameters: { t: 0.7 }, environment: {}, randomSources: { seed: 42 },
      outputs: { text: 'x' }, evidenceBundle: null,
    });
    assert.equal(rec.recordHash(), rec.recordHash());
    assert.equal(store.get('req-1').requestId, 'req-1');
  });

  it('replays with deterministic executor output', async () => {
    const store = new ReplayStore();
    store.save({
      requestId: 'req-2', nodePath: ['a'], inputs: { p: 2 },
      parameters: { t: 0.7 }, environment: {}, randomSources: { seed: 42 },
      outputs: { text: 'out' }, evidenceBundle: null,
    });
    const service = new ReplayService(store);
    const result = await service.replay('req-2', async (rec) => ({ text: `replayed:${rec.inputs.p}` }));
    assert.equal(result.ok, true);
    assert.equal(result.output.text, 'replayed:2');
  });

  it('simulates with overrides', async () => {
    const store = new ReplayStore();
    store.save({
      requestId: 'req-3', nodePath: ['a'], inputs: { p: 1 },
      parameters: { t: 0.7 }, environment: {}, randomSources: { seed: 42 },
      outputs: {}, evidenceBundle: null,
    });
    const service = new ReplayService(store);
    const result = await service.simulate('req-3', { parameters: { t: 0.1 } }, async (rec) => ({ temp: rec.parameters.t }));
    assert.equal(result.ok, true);
    assert.equal(result.output.temp, 0.1);
  });
});

describe('Lattice Router — LRC envelope + routing rules', () => {
  it('builds valid request envelopes with lawbook chain', () => {
    const router = new LatticeRouter();
    const req = router.buildRequest({
      originNodeId: 'sme-core', targetNodeId: 'sme-txt', actorId: 'op',
      action: 'generate_text', context: {}, payload: { prompt: 'hi' },
    });
    assert.equal(req.lrcVersion, LRC_VERSION);
    assert.ok(req.requestId);
    assert.deepEqual(req.lawbookChain, LAWBOOK_CHAIN);
    assert.equal(router.validateRequest(req), null);
  });

  it('rejects envelopes missing required fields', () => {
    const router = new LatticeRouter();
    assert.ok(router.validateRequest({ lrcVersion: LRC_VERSION }));
    assert.ok(router.validateRequest({ lrcVersion: '9.9' }));
    assert.ok(router.validateRequest(null));
  });

  it('routes to module and returns response with evidence + replayHandle', async () => {
    const lattice = await makeModule();
    const response = await lattice.call({
      originNodeId: 'sme-core', targetNodeId: 'sme-txt', actorId: 'op',
      action: 'generate_text', context: { seed: 42 }, payload: { prompt: 'hello' },
    });
    assert.equal(response.ok, true);
    assert.equal(response.violation, null);
    assert.equal(response.nodeId, 'sme-txt');
    assert.ok(response.evidence.bundleHash);
    assert.ok(response.replayHandle);
    assert.equal(response.result.text, 'hello lattice');
    assert.equal(lattice.getReplayRecord(response.requestId).requestId, response.requestId);
    await lattice.shutdown();
  });

  it('refuses calls to unknown targets with violation + evidence', async () => {
    const lattice = await makeModule();
    const response = await lattice.call({
      originNodeId: 'sme-core', targetNodeId: 'sme-unknown', actorId: 'op',
      action: 'generate_text', context: {}, payload: {},
    });
    assert.equal(response.ok, false);
    assert.equal(response.violation, 'target_unknown');
    await lattice.shutdown();
  });

  it('refuses calls that violate capability integrity', async () => {
    const lattice = await makeModule();
    const response = await lattice.call({
      originNodeId: 'sme-core', targetNodeId: 'sme-txt', actorId: 'op',
      action: 'transcribe', context: {}, payload: {},
    });
    assert.equal(response.ok, false);
    assert.equal(response.violation, 'capability_integrity');
    await lattice.shutdown();
  });

  it('wraps module execution failures as refusal with evidence', async () => {
    const lattice = new SmeLatticeModule();
    const failing = { generate: async () => { throw new Error('boom'); } };
    await lattice.initialize({
      modules: new Map([['sme-txt', failing]]),
      continuityFloor: 0,
    });
    const response = await lattice.call({
      originNodeId: 'sme-core', targetNodeId: 'sme-txt', actorId: 'op',
      action: 'generate_text', context: {}, payload: { prompt: 'x' },
    });
    assert.equal(response.ok, false);
    assert.equal(response.violation, 'execution_failed');
    assert.ok(response.evidence.bundleHash);
    await lattice.shutdown();
  });

  it('routes to all five substrate modules', async () => {
    const lattice = await makeModule();
    const cases = [
      ['sme-txt', 'generate_text', { prompt: 'hi' }],
      ['sme-vis', 'classify', {}],
      ['sme-aud', 'transcribe', {}],
      ['sme-gen', 'generate_image', {}],
      ['sme-vid', 'analyze', {}],
    ];
    for (const [target, action, payload] of cases) {
      const response = await lattice.call({
        originNodeId: 'sme-core', targetNodeId: target, actorId: 'op',
        action, context: {}, payload,
      });
      assert.equal(response.ok, true, `${target}/${action} should route ok`);
      assert.equal(response.nodeId, target);
      assert.ok(response.replayHandle, `${target} should produce replay handle`);
    }
    await lattice.shutdown();
  });
});

describe('SmeLatticeModule — facade', () => {
  it('initializes, health checks, and shuts down', async () => {
    const lattice = await makeModule();
    assert.equal(await lattice.healthCheck(), true);
    const detail = await lattice.healthCheckDetailed();
    assert.equal(detail.healthy, true);
    assert.ok(detail.nodes.length >= 5);
    await lattice.shutdown();
  });

  it('tracks ledger and replay counts', async () => {
    const lattice = await makeModule();
    await lattice.call({ originNodeId: 'sme-core', targetNodeId: 'sme-txt', actorId: 'op', action: 'generate_text', context: {}, payload: { prompt: 'x' } });
    const detail = await lattice.healthCheckDetailed();
    assert.ok(detail.ledgerSize >= 1);
    assert.ok(detail.replayRecords >= 1);
    await lattice.shutdown();
  });
});
