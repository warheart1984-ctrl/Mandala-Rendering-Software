/**
 * SME-LOG: Evidence, Replay, and Audit Subsystem - JavaScript Version
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FileSystemStorage {
  constructor(basePath) { this.basePath = basePath; this.ensureDir(basePath); }
  ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  async write(p, data) { const fp = `${this.basePath}/${p}`; this.ensureDir(path.dirname(fp)); fs.writeFileSync(fp, data); }
  async read(p) { return fs.readFileSync(`${this.basePath}/${p}`); }
  async exists(p) { return fs.existsSync(`${this.basePath}/${p}`); }
  async list(dir) { const fp = `${this.basePath}/${dir}`; return fs.existsSync(fp) ? fs.readdirSync(fp) : []; }
  async delete(p) { const fp = `${this.basePath}/${p}`; if (fs.existsSync(fp)) fs.unlinkSync(fp); }
  async mkdir(p) { this.ensureDir(`${this.basePath}/${p}`); }
}

class EvidenceManager {
  constructor(storage) { this.storage = storage; this.index = new Map(); }
  async record(evidence) { const p = `evidence/${evidence.evidenceId}.json`; await this.storage.write(p, Buffer.from(JSON.stringify(evidence, null, 2))); this.index.set(evidence.evidenceId, { evidenceId: evidence.evidenceId, type: evidence.type, moduleId: evidence.moduleId, timestamp: evidence.timestamp, modelVersion: evidence.modelVersion, path: p, hash: evidence.hash }); await this.persistIndex(); }
  async get(id) { const e = this.index.get(id); if (!e) return null; try { const d = await this.storage.read(e.path); return JSON.parse(d.toString()); } catch { return null; } }
  async query(q) { const r = []; for (const [id, e] of this.index) { if (this.matches(e, q)) { const rec = await this.get(id); if (rec) r.push(rec); } } return r; }
  matches(e, q) { if (q.startTime && e.timestamp < q.startTime) return false; if (q.endTime && e.timestamp > q.endTime) return false; if (q.moduleId && e.moduleId !== q.moduleId) return false; if (q.type && e.type !== q.type) return false; if (q.modelVersion && e.modelVersion !== q.modelVersion) return false; return true; }
  async persistIndex() { const d = Array.from(this.index.entries()).map(([id, e]) => ({ id, ...e })); await this.storage.write('evidence/index.json', Buffer.from(JSON.stringify(d, null, 2))); }
  async loadIndex() { try { const d = await this.storage.read('evidence/index.json'); const es = JSON.parse(d.toString()); for (const e of es) this.index.set(e.id, e); } catch {} }
}

class DecisionLog {
  constructor(storage) { this.storage = storage; this.decisions = new Map(); }
  async record(d) { this.decisions.set(d.decisionId, d); await this.persist(); }
  async get(id) { return this.decisions.get(id) || null; }
  async query(q) { let r = Array.from(this.decisions.values()); if (q.startTime) r = r.filter(d => d.timestamp >= q.startTime); if (q.endTime) r = r.filter(d => d.timestamp <= q.endTime); if (q.userId) r = r.filter(d => d.intent.intentId.includes(q.userId)); if (q.modality) r = r.filter(d => d.intent.modalities.includes(q.modality)); return r.sort((a, b) => b.timestamp - a.timestamp); }
  async persist() { const d = Array.from(this.decisions.values()); await this.storage.write('decisions.json', Buffer.from(JSON.stringify(d, null, 2))); }
  async load() { try { const d = await this.storage.read('decisions.json'); for (const x of JSON.parse(d.toString())) this.decisions.set(x.decisionId, x); } catch {} }
}

class TraceLog {
  constructor(storage) { this.storage = storage; this.traces = new Map(); }
  async record(t) { this.traces.set(t.chainId, t); await this.persist(t); }
  async get(id) { return this.traces.get(id) || null; }
  async query(q) { let r = Array.from(this.traces.values()); if (q.startTime) r = r.filter(t => t.startTime >= q.startTime); if (q.endTime) r = r.filter(t => t.endTime <= q.endTime); if (q.success !== undefined) r = r.filter(t => t.success === q.success); if (q.stage) r = r.filter(t => t.stages.some(s => s.stage === q.stage)); return r.sort((a, b) => b.startTime - a.startTime); }
  async persist(t) { await this.storage.write(`traces/${t.chainId}.json`, Buffer.from(JSON.stringify(t, null, 2))); }
  async load() { try { const files = await this.storage.list('traces'); for (const f of files) if (f.endsWith('.json')) { const d = await this.storage.read(`traces/${f}`); const parsed = JSON.parse(d.toString()); this.traces.set(parsed.chainId, parsed); } } catch {} }
}

class ReplayEngine {
  constructor(evidenceManager, traceLog, decisionLog) { this.evidenceManager = evidenceManager; this.traceLog = traceLog; this.decisionLog = decisionLog; }
  async replay(chainId, options) { const t = await this.traceLog.get(chainId); if (!t) throw new Error(`Trace not found: ${chainId}`); const start = Date.now(); const diffs = []; try { for (const s of t.stages) { const ss = Date.now(); const ev = await this.verifyStageEvidence(s); if (!ev.verified) diffs.push({ field: `stage.${s.stage}`, original: s, replayed: { verified: false }, toleranceExceeded: true }); } const ov = await this.verifyOutput(chainId); if (!ov) diffs.push({ field: 'finalOutput', original: 'verified', replayed: 'mismatch', toleranceExceeded: true }); return { chainId, success: diffs.length === 0, output: t, differences: diffs, executionTimeMs: Date.now() - start }; } catch (e) { return { chainId, success: false, output: t, differences: [{ field: 'replay', original: 'success', replayed: `error: ${e.message}`, toleranceExceeded: true }], executionTimeMs: Date.now() - start }; } }
  async verifyStageEvidence(s) { return { verified: true }; }
  async verifyOutput(id) { return true; }
  async verifyReplay(id, t) { const mismatches = []; for (const s of t.stages) for (const eid of s.outputEvidenceIds) { const e = await this.getEvidence(eid); if (e) { const ch = this.computeHash(e.data); if (e.hash && e.hash !== ch) mismatches.push({ evidenceId: eid, expectedHash: e.hash, actualHash: ch }); } } return { verified: mismatches.length === 0, mismatches, evidenceIntegrity: mismatches.length === 0 }; }
  async getEvidence(id) { return null; }
  computeHash(d) { return crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 32); }
}

class AuditEngine {
  constructor(storage, traceLog, decisionLog) { this.storage = storage; this.traceLog = traceLog; this.decisionLog = decisionLog; }
  async archive(b) { const p = `archives/${b.bundleId}.json`; await this.storage.write(p, Buffer.from(JSON.stringify({ bundle: b, archivedAt: Date.now(), version: '1.0.0' }, null, 2))); return p; }
  async query(q) { const ts = await this.traceLog.query({ startTime: q.startTime, endTime: q.endTime, success: q.success }); let r = []; for (const t of ts) { const ds = await this.decisionLog.query({ startTime: t.startTime, endTime: t.endTime }); if (q.userId) { const ud = ds.filter(d => d.intent.intentId.includes(q.userId)); if (ud.length === 0) continue; } if (q.modality) { const md = ds.filter(d => d.intent.modalities.includes(q.modality)); if (md.length === 0) continue; } const te = t.stages.reduce((s, st) => s + st.outputEvidenceIds.length, 0); r.push({ chainId: t.chainId, userId: 'anonymous', timestamp: t.startTime, modalities: this.extractModalities(t), success: t.success, executionTimeMs: t.endTime - t.startTime, evidenceCount: te }); } r.sort((a, b) => b.timestamp - a.timestamp); if (q.limit) r = r.slice(0, q.limit); return r; }
  extractModalities(t) { const m = []; for (const s of t.stages) { if (s.moduleId === 'sme-vis' && !m.includes('image')) m.push('image'); if (s.moduleId === 'sme-aud' && !m.includes('audio')) m.push('audio'); if (s.moduleId === 'sme-vid' && !m.includes('video')) m.push('video'); if (s.moduleId === 'sme-txt' && !m.includes('text')) m.push('text'); if (s.moduleId === 'sme-gen' && !m.includes('image')) m.push('image'); } return m; }
  async generateReport(id) { const t = await this.getTrace(id); if (!t) throw new Error(`Trace not found: ${id}`); const ds = await this.getDecisionsForChain(id); const ev = await this.getEvidenceForChain(id); const fs = []; for (const s of t.stages) if (!s.success) fs.push({ findingId: `finding-${s.stage}-${Date.now()}`, severity: 'violation', description: `Stage ${s.stage} failed: ${s.errors.join(', ')}`, evidenceIds: s.outputEvidenceIds }); const ee = this.getExpectedEvidence(t); for (const e of ee) if (!e) fs.push({ findingId: `finding-missing-evidence-${Date.now()}`, severity: 'warning', description: 'Expected evidence not found', evidenceIds: [] }); const dc = this.checkDeterminism(t); if (!dc) fs.push({ findingId: `finding-determinism-${Date.now()}`, severity: 'violation', description: 'Determinism check failed', evidenceIds: [] }); const cs = { compliant: fs.filter(f => f.severity === 'violation').length === 0, violatedRules: fs.filter(f => f.severity === 'violation').map(f => f.description), recommendations: this.genRecs(fs) }; return { reportId: `report-${id}-${Date.now()}`, chainId: id, generatedAt: Date.now(), summary: `Audit for ${id}: ${fs.filter(f => f.severity === 'violation').length} violations, ${fs.filter(f => f.severity === 'warning').length} warnings`, findings: fs, compliance: cs }; }
  getTrace(id) { return null; }
  getDecisionsForChain(id) { return []; }
  getEvidenceForChain(id) { return []; }
  getExpectedEvidence(t) { return t.stages.flatMap(s => s.outputEvidenceIds); }
  checkDeterminism(t) { return true; }
  genRecs(fs) { const r = []; if (fs.some(f => f.severity === 'violation')) r.push('Investigate and fix violations before deployment'); if (fs.some(f => f.severity === 'warning')) r.push('Address warnings to improve compliance'); return r; }
}

class SmeLogModule {
  constructor() { this.moduleId = 'sme-log'; this.moduleType = 'log'; this.config = null; this.storage = null; this.evidenceManager = null; this.traceLog = null; this.decisionLog = null; this.replayEngine = null; this.auditEngine = null; this.initialized = false; }
  async initialize(config) { this.config = config; this.storage = new FileSystemStorage(config.storagePath); this.evidenceManager = new EvidenceManager(this.storage); this.traceLog = new TraceLog(this.storage); this.decisionLog = new DecisionLog(this.storage); this.replayEngine = new ReplayEngine(this.evidenceManager, this.traceLog, this.decisionLog); this.auditEngine = new AuditEngine(this.storage, this.traceLog, new DecisionLog(this.storage)); await this.evidenceManager.loadIndex(); await this.traceLog.load(); await this.decisionLog.load(); this.initialized = true; console.log('[SME-LOG] Initialized'); }
  async recordEvidence(e) { this.assertInitialized(); await this.evidenceManager.record(e); }
  async recordDecision(d) { this.assertInitialized(); await this.decisionLog.record(d); }
  async recordTrace(t) { this.assertInitialized(); await this.traceLog.record(t); }
  async getEvidence(id) { this.assertInitialized(); return this.evidenceManager.get(id); }
  async getDecision(id) { this.assertInitialized(); return this.decisionLog.get(id); }
  async getTrace(id) { this.assertInitialized(); return this.traceLog.get(id); }
  async replay(id, o) { this.assertInitialized(); return this.replayEngine.replay(id, o || {}); }
  async verifyReplay(id, t) { this.assertInitialized(); return this.replayEngine.verifyReplay(id, t); }
  async archive(b) { this.assertInitialized(); return this.auditEngine.archive(b); }
  async queryAudit(q) { this.assertInitialized(); return this.auditEngine.query(q || {}); }
  async generateReport(id) { this.assertInitialized(); return this.auditEngine.generateReport(id); }
  async healthCheck() { try { const id = `test-${Date.now()}`; await this.recordEvidence({ evidenceId: id, type: 'test', moduleId: 'sme-log', data: { test: true }, timestamp: Date.now(), modelVersion: 'test', hash: 'test' }); const r = await this.getEvidence(id); return r !== null; } catch { return false; } }
  async healthCheckDetailed() { const h = await this.healthCheck(); return { moduleId: this.moduleId, healthy: h, lastCheck: Date.now(), error: h ? undefined : 'Health check failed', modelVersion: '1.0.0' }; }
  async shutdown() { console.log('[SME-LOG] Shutdown complete'); }
  assertInitialized() { if (!this.initialized) throw new Error('SME-LOG not initialized'); }
}

module.exports = { SmeLogModule, EvidenceManager, DecisionLog, TraceLog, ReplayEngine, AuditEngine };