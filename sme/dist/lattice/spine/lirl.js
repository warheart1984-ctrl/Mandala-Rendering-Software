/**
 * LIRL law gate — Lawful Intent Receipt Loop invariant enforcement.
 * Ported from @sovereign-x/constitutional-compute (src/lirl/*) to CJS.
 * Combines InvariantEngine, FaultJournal, RunStore, and LirlLawGate in one module.
 */

const { randomUUID } = require('crypto');

const LIRL_ALLOWED_ACTIONS = [
  'memory.write',
  'ping',
  'observe',
  'architect.review',
  'inspector.audit',
  'foreman.execute',
  'agent.execute',
  'generate_text',
  'complete',
  'summarize',
  'query_knowledge',
  'classify',
  'encode',
  'transcribe',
  'generate_image',
  'generate_audio',
  'generate_video',
  'analyze',
  'transcode',
  'extract_audio',
  'trim',
];

class FaultJournal {
  constructor() {
    this.events = [];
    this.recurrenceCounts = new Map();
  }

  recurrenceKey(faultCode, invariantId) {
    return invariantId ? `${faultCode}::${invariantId}` : faultCode;
  }

  recordFault(input) {
    const key = this.recurrenceKey(input.faultCode, input.invariantId);
    const recurrenceCount = (this.recurrenceCounts.get(key) ?? 0) + 1;
    this.recurrenceCounts.set(key, recurrenceCount);
    const event = {
      faultId: `fault:${randomUUID()}`,
      runId: input.runId,
      spanId: input.spanId,
      invariantId: input.invariantId,
      timestamp: new Date().toISOString(),
      faultCode: input.faultCode,
      severity: input.severity,
      contextSnapshot: input.contextSnapshot,
      recurrenceCount,
    };
    this.events.push(event);
    return structuredClone(event);
  }

  getAll() { return this.events.map((event) => structuredClone(event)); }
  getByRun(runId) { return this.events.filter((e) => e.runId === runId).map((e) => structuredClone(e)); }
  getBySpan(spanId) { return this.events.filter((e) => e.spanId === spanId).map((e) => structuredClone(e)); }
  getByFaultCode(faultCode) { return this.events.filter((e) => e.faultCode === faultCode).map((e) => structuredClone(e)); }
  countRecurrence(faultCode, invariantId) { return this.recurrenceCounts.get(this.recurrenceKey(faultCode, invariantId)) ?? 0; }
  getRecurrence(faultCode, invariantId) { return this.countRecurrence(faultCode, invariantId); }
  clear() { this.events.length = 0; this.recurrenceCounts.clear(); }
}

class RunLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunLedgerError';
    this.code = code;
  }
}

class RunStore {
  constructor() {
    this.runs = new Map();
    this.spans = new Map();
    this.invariantLinks = [];
  }

  startRun(options = {}) {
    const runId = options.runId ?? `run:${randomUUID()}`;
    if (this.runs.has(runId)) {
      throw new RunLedgerError('RUN_ALREADY_EXISTS', `run already exists: ${runId}`);
    }
    const record = {
      runId,
      startedAt: new Date().toISOString(),
      metadata: options.metadata ? structuredClone(options.metadata) : undefined,
    };
    this.runs.set(runId, record);
    return structuredClone(record);
  }

  endRun(runId) {
    const run = this.requireRun(runId);
    if (run.endedAt) { return structuredClone(run); }
    const openSpans = this.getSpansByRun(runId).filter((span) => !span.endedAt);
    if (openSpans.length > 0) {
      throw new RunLedgerError('OPEN_SPANS_REMAIN', `cannot end run with open spans: ${openSpans.map((s) => s.spanId).join(', ')}`);
    }
    run.endedAt = new Date().toISOString();
    return structuredClone(run);
  }

  startSpan(runId, options) {
    this.requireOpenRun(runId);
    const spanId = options.spanId ?? `span:${randomUUID()}`;
    if (this.spans.has(spanId)) {
      throw new RunLedgerError('SPAN_ALREADY_EXISTS', `span already exists: ${spanId}`);
    }
    const record = {
      spanId,
      runId,
      name: options.name,
      startedAt: new Date().toISOString(),
      parentSpanId: options.parentSpanId,
      metadata: options.metadata ? structuredClone(options.metadata) : undefined,
      invariantIds: [],
    };
    this.spans.set(spanId, record);
    return structuredClone(record);
  }

  endSpan(spanId) {
    const span = this.requireSpan(spanId);
    if (span.endedAt) { return structuredClone(span); }
    span.endedAt = new Date().toISOString();
    return structuredClone(span);
  }

  linkInvariant(spanId, invariantId) {
    const span = this.requireSpan(spanId);
    const existing = this.invariantLinks.find((link) => link.spanId === spanId && link.invariantId === invariantId);
    if (existing) { return structuredClone(existing); }
    const link = { spanId, invariantId };
    this.invariantLinks.push(link);
    span.invariantIds = [...(span.invariantIds ?? []), invariantId];
    return structuredClone(link);
  }

  getRun(runId) { const run = this.runs.get(runId); return run ? structuredClone(run) : undefined; }
  getSpan(spanId) { const span = this.spans.get(spanId); return span ? structuredClone(span) : undefined; }
  getSpansByRun(runId) { return [...this.spans.values()].filter((s) => s.runId === runId).map((s) => structuredClone(s)); }
  getInvariantLinks(spanId) {
    if (spanId) { return this.invariantLinks.filter((l) => l.spanId === spanId).map((l) => structuredClone(l)); }
    return this.invariantLinks.map((l) => structuredClone(l));
  }

  getRunSnapshot(runId) {
    const run = this.runs.get(runId);
    if (!run) { return undefined; }
    const spans = this.getSpansByRun(runId);
    const invariantLinks = spans.flatMap((span) => this.getInvariantLinks(span.spanId));
    return { run: structuredClone(run), spans, invariantLinks };
  }

  requireRun(runId) {
    const run = this.runs.get(runId);
    if (!run) { throw new RunLedgerError('RUN_NOT_FOUND', `run not found: ${runId}`); }
    return run;
  }

  requireOpenRun(runId) {
    const run = this.requireRun(runId);
    if (run.endedAt) { throw new RunLedgerError('RUN_ALREADY_ENDED', `run already ended: ${runId}`); }
    return run;
  }

  requireSpan(spanId) {
    const span = this.spans.get(spanId);
    if (!span) { throw new RunLedgerError('SPAN_NOT_FOUND', `span not found: ${spanId}`); }
    return span;
  }
}

function normalizeSeverity(severity) {
  if (severity === 'fatal' || severity === 'error' || severity === 'warn' || severity === 'info') {
    return severity;
  }
  return 'error';
}

async function invokeInvariant(invariant, context) {
  const evaluator = invariant.check ?? invariant.evaluate;
  if (!evaluator) {
    return { passed: true, severity: 'info', invariantId: invariant.id, message: 'No evaluator registered' };
  }
  const normalizedContext = {
    id: context.runId,
    runId: context.runId,
    spanId: context.spanId,
    actor: context.actor ?? 'governance',
    action: context.action ?? 'inspect',
    payload: context.payload ?? { input: context.input, output: context.output, metadata: context.metadata },
    timestamp: context.timestamp ?? Date.now(),
    input: context.input,
    output: context.output,
    metadata: context.metadata,
    freezeActive: context.freezeActive,
    verified: context.verified,
    approved: context.approved,
    parentHash: context.parentHash,
  };
  try {
    const result = await evaluator.call(invariant, normalizedContext);
    return { ...result, severity: normalizeSeverity(result.severity), invariantId: result.invariantId ?? invariant.id };
  } catch (error) {
    return {
      passed: false,
      severity: 'fatal',
      invariantId: invariant.id,
      message: error instanceof Error ? error.message : 'Invariant evaluation failed',
      details: error,
    };
  }
}

class InvariantEngine {
  constructor(faultJournal, options = {}) {
    this.invariants = new Map();
    this.faultJournal = faultJournal;
    this.options = options;
  }

  register(invariant) { this.invariants.set(invariant.id, invariant); }
  unregister(invariantId) { this.invariants.delete(invariantId); }
  get(invariantId) { return this.invariants.get(invariantId); }
  list() { return [...this.invariants.values()]; }

  async evaluateAll(context) {
    const results = [];
    for (const invariant of this.list()) {
      const result = await invokeInvariant(invariant, context);
      results.push(structuredClone(result));
      if (!result.passed && this.faultJournal && typeof this.faultJournal.recordFault === 'function') {
        this.faultJournal.recordFault({
          runId: context.runId,
          spanId: context.spanId,
          invariantId: invariant.id,
          faultCode: `INV_FAIL_${invariant.id}`,
          severity: (result.severity ?? 'error').toUpperCase(),
          contextSnapshot: {
            input: context.input,
            output: context.output,
            payload: context.payload,
            metadata: context.metadata,
            details: result.details,
            message: result.message,
          },
        });
      }
    }
    return results;
  }

  async evaluateById(invariantId, context) {
    const invariant = this.invariants.get(invariantId);
    if (!invariant) { return null; }
    return invokeInvariant(invariant, context);
  }
}

function createLirlInvariants() {
  return [
    {
      id: 'LIRL_ACTOR_REQUIRED',
      description: 'Intent must identify a non-empty actorId',
      evaluate: (ctx) => {
        const intent = ctx.input;
        const actorId = intent?.actorId?.trim();
        if (!actorId) {
          return { passed: false, severity: 'error', message: 'actorId is required' };
        }
        if (actorId.toLowerCase() === 'anonymous') {
          return { passed: false, severity: 'error', message: 'anonymous actor is not lawful under LIRL' };
        }
        return { passed: true, severity: 'info', message: 'actorId present' };
      },
    },
    {
      id: 'LIRL_NO_BYPASS',
      description: 'forceBypass and unlawful bypass actions are rejected',
      evaluate: (ctx) => {
        const intent = ctx.input;
        if (intent?.forceBypass === true) {
          return { passed: false, severity: 'fatal', message: 'forceBypass is unlawful' };
        }
        if (intent?.action === 'unlawful.bypass') {
          return { passed: false, severity: 'fatal', message: 'action unlawful.bypass is forbidden' };
        }
        return { passed: true, severity: 'info', message: 'no bypass attempted' };
      },
    },
    {
      id: 'LIRL_ACTION_ALLOWLIST',
      description: 'action must be in LIRL allowlist',
      evaluate: (ctx) => {
        const intent = ctx.input;
        const action = intent?.action;
        if (!action || !LIRL_ALLOWED_ACTIONS.includes(action)) {
          return {
            passed: false,
            severity: 'error',
            message: `action not in allowlist; must be one of: ${LIRL_ALLOWED_ACTIONS.join(', ')}`,
          };
        }
        return { passed: true, severity: 'info', message: 'action allowed' };
      },
    },
    {
      id: 'LIRL_MEMORY_WRITE_SHAPE',
      description: 'memory.write requires payload.key and payload.value',
      evaluate: (ctx) => {
        const intent = ctx.input;
        if (intent?.action !== 'memory.write') {
          return { passed: true, severity: 'info', message: 'not a memory.write' };
        }
        const key = intent.payload?.key;
        if (typeof key !== 'string' || key.trim().length === 0) {
          return { passed: false, severity: 'error', message: 'memory.write requires non-empty payload.key' };
        }
        if (!('value' in (intent.payload ?? {}))) {
          return { passed: false, severity: 'error', message: 'memory.write requires payload.value' };
        }
        return { passed: true, severity: 'info', message: 'memory.write shape ok' };
      },
    },
  ];
}

class LirlLawGate {
  constructor() {
    this.journal = new FaultJournal();
    this.engine = new InvariantEngine(this.journal);
    this.runs = new RunStore();
    for (const invariant of createLirlInvariants()) {
      this.engine.register(invariant);
    }
  }

  async evaluate(intent) {
    const run = this.runs.startRun({ metadata: { subsystem: 'lirl', intentAction: intent.action } });
    const span = this.runs.startSpan(run.runId, { name: 'lirl.law_gate' });

    const actor = intent.actorId?.toLowerCase() === 'governance' ? 'governance'
      : intent.actorId?.toLowerCase() === 'runtime' ? 'runtime'
      : intent.actorId?.toLowerCase() === 'agent' ? 'agent'
      : intent.actorId?.toLowerCase() === 'substrate' ? 'substrate'
      : 'agent';

    const invariantResults = await this.engine.evaluateAll({
      runId: run.runId,
      spanId: span.spanId,
      input: intent,
      output: { stage: 'law_gate' },
      actor,
      action: intent.action || 'unknown',
      payload: intent.payload,
    });

    this.runs.endSpan(span.spanId);
    this.runs.endRun(run.runId);

    const failures = invariantResults.filter((result) => !result.passed);
    const reasons = failures.map((result) => result.message ?? `invariant failed: ${result.invariantId ?? 'unknown'}`);

    return {
      verdict: failures.length === 0 ? 'ACCEPT' : 'REJECT',
      reasons,
      invariantResults: invariantResults.map((result) => ({
        invariantId: result.invariantId,
        passed: result.passed,
        message: result.message,
      })),
      runId: run.runId,
      spanId: span.spanId,
    };
  }
}

module.exports = {
  LIRL_ALLOWED_ACTIONS,
  FaultJournal,
  RunStore,
  RunLedgerError,
  InvariantEngine,
  createLirlInvariants,
  LirlLawGate,
};
