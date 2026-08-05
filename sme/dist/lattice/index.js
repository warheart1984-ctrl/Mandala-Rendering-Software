/**
 * Mandala Lattice v1.0 — Lattice Routing Contract (LRC) router + module facade.
 *
 * The constitutional mesh that binds sovereign nodes (SME modules, constitutional
 * gates, ledgers, and external organs) into a single governed intelligence organism.
 *
 * Horizontal spine: MRI -> CEN -> Lirl -> Ledger (see ./spine/orchestrator.js)
 * Vertical: SME substrates (TXT/VIS/AUD/GEN/VID) routed through LRC envelopes.
 *
 * Every routed operation:
 *   1. Builds an LRC request envelope (lrcVersion, requestId, originNodeId,
 *      targetNodeId, actorId, action, context, payload, lawbookChain).
 *   2. Validates identity against the LNIM.
 *   3. Runs the constitutional spine (MRI -> CEN -> Lirl -> Ledger).
 *   4. Dispatches to the target module.
 *   5. Builds a full LEPR evidence bundle.
 *   6. Records an LRDM replay record.
 *   7. Returns an LRC response envelope (requestId echo, nodeId, ok, violation,
 *      evidence, replayHandle).
 */

const { createHash, randomUUID } = require('crypto');
const { NodeIdentityMap, CANONICAL_NODES } = require('./lnim');
const { buildEvidenceBundle, EvidenceBundle } = require('./lepr');
const { ReplayRecord, ReplayStore, ReplayService } = require('./lrdm');
const { ConstitutionalOrchestrator } = require('./spine/orchestrator');
const { createResourceFloorInvariant } = require('./spine/cen');

const LRC_VERSION = '1.0';

const LAWBOOK_CHAIN = [
  'Authority',
  'Validation',
  'Decision',
  'Evidence',
  'Verification',
  'Replay',
  'Audit',
];

const ACTION_TO_MODULE = {
  generate_text: 'sme-txt',
  complete: 'sme-txt',
  summarize: 'sme-txt',
  query_knowledge: 'sme-txt',
  classify: 'sme-vis',
  encode: 'sme-vis',
  transcribe: 'sme-aud',
  generate_image: 'sme-gen',
  generate_audio: 'sme-gen',
  generate_video: 'sme-gen',
  analyze: 'sme-vid',
  transcode: 'sme-vid',
  extract_audio: 'sme-vid',
  trim: 'sme-vid',
};

class LatticeRouter {
  constructor(opts = {}) {
    this.identity = opts.identity || new NodeIdentityMap();
    this.orchestrator = opts.orchestrator || new ConstitutionalOrchestrator({
      cenInvariants: [createResourceFloorInvariant('continuity', 0)],
    });
    this.modules = opts.modules || new Map();
    this.replayStore = opts.replayStore || new ReplayStore();
    this.replayService = opts.replayService || new ReplayService(this.replayStore);
    this.lrcVersion = opts.lrcVersion || LRC_VERSION;
    this.routeCounter = 0;
  }

  registerModule(nodeId, module) {
    this.modules.set(nodeId, module);
    if (!this.identity.has(nodeId)) {
      const capabilities = ACTION_TO_MODULE_CAPABILITIES(nodeId);
      this.identity.register({
        nodeId,
        nodeType: 'substrate',
        capabilities,
        authorityScope: 'any',
        evidenceProfile: { required: ['output', 'decision'], optional: ['verification'] },
        replayProfile: { mode: 'seed-and-input', fields: ['seed', 'parameters', 'inputs'] },
      });
    }
    return this;
  }

  /**
   * Build an LRC request envelope.
   */
  buildRequest({ originNodeId, targetNodeId, actorId, action, context, payload }) {
    this.routeCounter += 1;
    return {
      lrcVersion: this.lrcVersion,
      requestId: `req-${Date.now()}-${randomUUID().slice(0, 8)}-${this.routeCounter}`,
      originNodeId,
      targetNodeId,
      actorId,
      action,
      context: context || {},
      payload: payload ?? {},
      lawbookChain: [...LAWBOOK_CHAIN],
    };
  }

  /**
   * Validate an LRC request envelope shape.
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') return 'request envelope is required';
    if (request.lrcVersion !== this.lrcVersion) return `unsupported lrcVersion: ${request.lrcVersion}`;
    if (!request.requestId?.trim()) return 'requestId is required';
    if (!request.originNodeId?.trim()) return 'originNodeId is required';
    if (!request.targetNodeId?.trim()) return 'targetNodeId is required';
    if (!request.actorId?.trim()) return 'actorId is required';
    if (!request.action?.trim()) return 'action is required';
    if (!Array.isArray(request.lawbookChain) || request.lawbookChain.length === 0) return 'lawbookChain is required';
    return null;
  }

  /**
   * Dispatch a fully-formed LRC request envelope.
   * Routing rules: no direct calls outside LRC envelopes; mandatory lawbook;
   * refusal emits violation + evidence.
   */
  async route(request) {
    const shapeError = this.validateRequest(request);
    if (shapeError) {
      return this.buildResponse(request, {
        ok: false,
        violation: 'envelope_invalid',
        violationReason: shapeError,
      });
    }

    const identityCheck = this.identity.validateCall({
      originNodeId: request.originNodeId,
      targetNodeId: request.targetNodeId,
      action: request.action,
      requestedScope: request.context?.scope,
    });
    if (!identityCheck.ok) {
      return this.buildResponse(request, {
        ok: false,
        violation: identityCheck.violation,
        violationReason: identityCheck.message,
      });
    }

    const module = this.modules.get(request.targetNodeId);
    if (!module) {
      return this.buildResponse(request, {
        ok: false,
        violation: 'target_unavailable',
        violationReason: `no module bound to node '${request.targetNodeId}'`,
      });
    }

    // Constitutional spine: MRI -> CEN -> Lirl -> Ledger.
    const spineIntent = {
      id: request.requestId,
      action: request.action,
      arena: request.context?.arena || 'cpu',
      actorId: request.actorId,
      authorityId: request.actorId,
      authoritySignature: request.context?.authoritySignature || `sig:${request.requestId}`,
      ccr: {
        continuityParentId: null,
        origin: request.originNodeId,
        justification: request.action,
        evidenceIds: [],
      },
      params: request.payload,
      authorityToken: request.context?.authorityToken ?? null,
      forceBypass: request.context?.forceBypass ?? false,
    };

    const spine = await this.orchestrator.evaluateAndDispatch(spineIntent);
    if (!spine.allowed) {
      const bundle = buildEvidenceBundle({
        requestId: request.requestId,
        authority: { actorId: request.actorId, action: request.action, spine: spine.mri?.scores ?? null },
        validation: { cen: false, lirl: false, reason: spine.reason, stage: spine.stage },
        decision: { verdict: 'DENY', reason: spine.reason },
        output: null,
        verification: { verified: false, reason: spine.reason },
        replay: { randomSources: { seed: request.context?.seed ?? null } },
        audit: { spineEventId: spine.event?.id ?? null },
        hops: [{ nodeId: 'constitutional-gate', at: Date.now(), segment: 'validationEvidence' }],
      });
      return this.buildResponse(request, {
        ok: false,
        violation: spine.stage === 'lirl' ? 'actor_legal' : 'resource_floor',
        violationReason: spine.reason,
        evidence: bundle.toJSON(),
      });
    }

    // Dispatch to module.
    let result;
    let outputEvidence;
    try {
      result = await this.dispatchToModule(module, request);
      outputEvidence = result;
    } catch (error) {
      const bundle = buildEvidenceBundle({
        requestId: request.requestId,
        authority: { actorId: request.actorId, action: request.action, spine: spine.mri?.scores ?? null },
        validation: { cen: true, lirl: true },
        decision: { verdict: 'EXEC', spine: 'allowed' },
        output: null,
        verification: { verified: false, reason: error.message },
        replay: { randomSources: { seed: request.context?.seed ?? null } },
        audit: { spineEventId: spine.event?.id ?? null },
        hops: [{ nodeId: request.targetNodeId, at: Date.now(), segment: 'outputEvidence' }],
      });
      return this.buildResponse(request, {
        ok: false,
        violation: 'execution_failed',
        violationReason: error.message,
        evidence: bundle.toJSON(),
      });
    }

    const bundle = buildEvidenceBundle({
      requestId: request.requestId,
      authority: { actorId: request.actorId, action: request.action, spine: spine.mri?.scores ?? null },
      validation: { cen: true, lirl: true, mriSnapshot: spine.mri?.full?.state ?? null },
      decision: { verdict: 'EXEC', spine: 'allowed', eventId: spine.event?.id ?? null },
      output: outputEvidence,
      verification: { verified: true },
      replay: { randomSources: { seed: request.context?.seed ?? null } },
      audit: { spineEventId: spine.event?.id ?? null, ledgerTip: spine.event?.id ?? null },
      hops: [{ nodeId: request.targetNodeId, at: Date.now(), segment: 'outputEvidence' }],
    });

    const replayRecord = this.replayService.store.save({
      requestId: request.requestId,
      nodePath: [request.originNodeId, 'constitutional-gate', request.targetNodeId],
      inputs: request.payload,
      parameters: request.context?.parameters ?? {},
      environment: {
        lrcVersion: this.lrcVersion,
        lawbookChain: request.lawbookChain,
        moduleNode: request.targetNodeId,
        action: request.action,
      },
      randomSources: { seed: request.context?.seed ?? null },
      outputs: outputEvidence,
      evidenceBundle: bundle.toJSON(),
    });

    return this.buildResponse(request, {
      ok: true,
      violation: null,
      violationReason: null,
      evidence: bundle.toJSON(),
      replayHandle: replayRecord.recordHash(),
      result,
    });
  }

  /**
   * Convenience: build envelope + route in one call.
   */
  async call(requestFields) {
    const request = this.buildRequest(requestFields);
    return this.route(request);
  }

  buildResponse(request, { ok, violation, violationReason, evidence, replayHandle, result }) {
    return {
      requestId: request?.requestId ?? null,
      nodeId: request?.targetNodeId ?? null,
      ok: Boolean(ok),
      violation: violation ?? null,
      violationReason: violationReason ?? null,
      evidence: evidence ?? null,
      replayHandle: replayHandle ?? null,
      result: result ?? null,
    };
  }

  async dispatchToModule(module, request) {
    const payload = request.payload ?? {};
    switch (request.targetNodeId) {
      case 'sme-txt':
        return module.generate({
          prompt: payload.prompt ?? payload.text ?? '',
          maxTokens: payload.maxTokens ?? 256,
          temperature: payload.temperature ?? 0.7,
          topP: payload.topP ?? 0.9,
          seed: payload.seed ?? request.context?.seed ?? undefined,
        });
      case 'sme-vis':
        return module.encode({
          imageData: payload.imageData,
          mimeType: payload.mimeType ?? 'image/png',
          authorityGrant: { permittedModalities: ['image'] },
          extractFeatures: payload.extractFeatures ?? true,
        });
      case 'sme-aud':
        return module.transcribe({
          audioData: payload.audioData,
          authorityGrant: { permittedModalities: ['audio'] },
          options: payload.options ?? {},
        });
      case 'sme-gen':
        return this.dispatchToGen(module, payload);
      case 'sme-vid':
        return module.process({
          preset: payload.preset ?? 'transcode-h264',
          inputPath: payload.inputPath,
          outputPath: payload.outputPath,
          ffmpeg: payload.ffmpeg,
        });
      default:
        throw new Error(`no dispatch handler for node '${request.targetNodeId}'`);
    }
  }

  async dispatchToGen(module, payload) {
    switch (payload.operation ?? 'generate_image') {
      case 'generate_image':
        return module.generateImage({
          prompt: payload.prompt ?? '',
          width: payload.width ?? 256,
          height: payload.height ?? 256,
          steps: payload.steps ?? 8,
          guidanceScale: payload.guidanceScale ?? 7.5,
          seed: payload.seed ?? undefined,
          authorityGrant: { permittedModalities: ['image'] },
        });
      case 'generate_audio':
        return module.generateAudio({
          text: payload.text ?? '',
          voice: payload.voice,
          speed: payload.speed,
          authorityGrant: { permittedModalities: ['audio'] },
        });
      case 'generate_video':
        return module.generateVideo({
          prompt: payload.prompt ?? '',
          width: payload.width ?? 256,
          height: payload.height ?? 256,
          durationSec: payload.durationSec ?? 3,
          fps: payload.fps ?? 8,
          authorityGrant: { permittedModalities: ['video'] },
        });
      default:
        throw new Error(`unsupported gen operation: ${payload.operation}`);
    }
  }

  replay(requestId) {
    return this.replayService.store.get(requestId);
  }

  async verifyReplay(requestId, executor) {
    return this.replayService.verify(requestId, executor);
  }
}

function ACTION_TO_MODULE_CAPABILITIES(nodeId) {
  const caps = [];
  for (const [action, moduleId] of Object.entries(ACTION_TO_MODULE)) {
    if (moduleId === nodeId) { caps.push(action); }
  }
  return caps;
}

class SmeLatticeModule {
  constructor() {
    this.moduleId = 'sme-lattice';
    this.moduleType = 'lattice';
    this.config = null;
    this.router = null;
    this.initialized = false;
    this.routeCount = 0;
  }

  async initialize(config) {
    this.config = config;
    const identity = new NodeIdentityMap();
    const orchestrator = new ConstitutionalOrchestrator({
      cenInvariants: [
        createResourceFloorInvariant('continuity', config.continuityFloor ?? 0),
        ...(config.extraCenInvariants || []),
      ],
    });
    this.router = new LatticeRouter({
      identity,
      orchestrator,
      lrcVersion: config.lrcVersion || LRC_VERSION,
    });
    if (config.modules) {
      for (const [nodeId, module] of config.modules) {
        this.router.registerModule(nodeId, module);
      }
    }
    this.initialized = true;
    console.log(`[SME-LATTICE] Initialized: ${this.router.identity.list().length} nodes in LNIM`);
    return this;
  }

  async route(request) {
    this.assertInitialized();
    this.routeCount += 1;
    return this.router.route(request);
  }

  async call(requestFields) {
    this.assertInitialized();
    this.routeCount += 1;
    return this.router.call(requestFields);
  }

  buildRequest(fields) {
    this.assertInitialized();
    return this.router.buildRequest(fields);
  }

  getNode(nodeId) { return this.router.identity.get(nodeId); }
  listNodes() { return this.router.identity.list(); }
  getReplayRecord(requestId) { return this.router.replay(requestId); }
  listReplayRecords() { return this.router.replayStore.list().map((r) => ({ requestId: r.requestId, recordHash: r.recordHash() })); }

  async healthCheck() {
    if (!this.initialized) return false;
    return Boolean(
      this.router.identity.list().length > 0 &&
      this.router.orchestrator.cen &&
      this.router.orchestrator.ledger
    );
  }

  async healthCheckDetailed() {
    const healthy = await this.healthCheck();
    return {
      moduleId: this.moduleId,
      healthy,
      lastCheck: Date.now(),
      error: healthy ? undefined : 'Lattice health check failed',
      nodes: this.router ? this.router.identity.list().map((n) => ({ nodeId: n.nodeId, nodeType: n.nodeType, capabilities: n.capabilities })) : [],
      ledgerSize: this.router?.orchestrator?.ledger?.size ? this.router.orchestrator.ledger.size() : 0,
      replayRecords: this.router?.replayStore ? this.router.replayStore.list().length : 0,
      routeCount: this.routeCount,
    };
  }

  async shutdown() {
    if (this.router?.orchestrator?.ledger?.close) {
      try { this.router.orchestrator.ledger.close(); } catch {}
    }
    this.initialized = false;
    console.log('[SME-LATTICE] Shutdown complete');
  }

  assertInitialized() {
    if (!this.initialized) throw new Error('SME-LATTICE not initialized');
  }
}

module.exports = {
  SmeLatticeModule,
  LatticeRouter,
  NodeIdentityMap,
  EvidenceBundle,
  LAWBOOK_CHAIN,
  ACTION_TO_MODULE,
  LRC_VERSION,
  buildEvidenceBundle,
  ReplayRecord,
  ReplayStore,
  ReplayService,
};
