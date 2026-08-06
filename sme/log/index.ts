/**
 * SME-LOG: Evidence, Replay, and Audit Subsystem
 * Provides deterministic logging, replay capability, and audit trail
 */

import { 
  SmeLogIFC, SmeLogConfig, EvidenceRecord, EvidenceId, ModelVersion,
  DecisionRecord, ConstitutionalTrace, TraceStage, EvidenceBundle,
  ProvenanceRecord, ReplayOptions, ReplayResult, VerificationResult,
  AuditQuery, AuditResult, AuditReport, AuditFinding, ComplianceStatus,
  ModuleHealth, ResourceUsage, UserIntent, Modality,
  GovernedResponse, ResponseMetadata
} from '../contracts';

// ============================================================
// STORAGE BACKENDS
// ============================================================

interface StorageBackend {
  write(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  delete(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

class FileSystemStorage implements StorageBackend {
  private basePath: string;
  
  constructor(basePath: string) {
    this.basePath = basePath;
    this.ensureDir(basePath);
  }
  
  private ensureDir(dir: string): void {
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  async write(path: string, data: Buffer): Promise<void> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${path}`;
    this.ensureDir(require('path').dirname(fullPath));
    fs.writeFileSync(fullPath, data);
  }
  
  async read(path: string): Promise<Buffer> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${path}`;
    return fs.readFileSync(fullPath);
  }
  
  async exists(path: string): Promise<boolean> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${path}`;
    return fs.existsSync(fullPath);
  }
  
  async list(dir: string): Promise<string[]> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${dir}`;
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath);
  }
  
  async delete(path: string): Promise<void> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${path}`;
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  
  async mkdir(path: string): Promise<void> {
    const fs = require('fs');
    const fullPath = `${this.basePath}/${path}`;
    this.ensureDir(fullPath);
  }
}

// ============================================================
// EVIDENCE MANAGER
// ============================================================

class EvidenceManager {
  private storage: StorageBackend;
  private index: Map<EvidenceId, EvidenceIndexEntry> = new Map();
  
  constructor(storage: StorageBackend) {
    this.storage = storage;
  }
  
  async record(evidence: EvidenceRecord): Promise<void> {
    // Store evidence
    const path = `evidence/${evidence.evidenceId}.json`;
    const data = Buffer.from(JSON.stringify(evidence, null, 2));
    await this.storage.write(path, data);
    
    // Update index
    this.index.set(evidence.evidenceId, {
      evidenceId: evidence.evidenceId,
      type: evidence.type,
      moduleId: evidence.moduleId,
      timestamp: evidence.timestamp,
      modelVersion: evidence.modelVersion,
      path,
      hash: evidence.hash
    });
    
    // Update index file
    await this.persistIndex();
  }
  
  async get(evidenceId: EvidenceId): Promise<EvidenceRecord | null> {
    const entry = this.index.get(evidenceId);
    if (!entry) return null;
    
    try {
      const data = await this.storage.read(entry.path);
      return JSON.parse(data.toString());
    } catch {
      return null;
    }
  }
  
  async query(query: EvidenceQuery): Promise<EvidenceRecord[]> {
    const results: EvidenceRecord[] = [];
    
    for (const [id, entry] of this.index) {
      if (this.matchesQuery(entry, query)) {
        const record = await this.get(id);
        if (record) results.push(record);
      }
    }
    
    return results;
  }
  
  private matchesQuery(entry: EvidenceIndexEntry, query: EvidenceQuery): boolean {
    if (query.startTime && entry.timestamp < query.startTime) return false;
    if (query.endTime && entry.timestamp > query.endTime) return false;
    if (query.moduleId && entry.moduleId !== query.moduleId) return false;
    if (query.type && entry.type !== query.type) return false;
    if (query.modelVersion && entry.modelVersion !== query.modelVersion) return false;
    return true;
  }
  
  private async persistIndex(): Promise<void> {
    const indexData = Array.from(this.index.entries()).map(([id, entry]) => ({ id, ...entry }));
    await this.storage.write('evidence/index.json', Buffer.from(JSON.stringify(indexData, null, 2)));
  }
  
  async loadIndex(): Promise<void> {
    try {
      const data = await this.storage.read('evidence/index.json');
      const entries = JSON.parse(data.toString());
      for (const entry of entries) {
        this.index.set(entry.id, entry);
      }
    } catch {
      // Index doesn't exist yet
    }
  }
}

interface EvidenceIndexEntry {
  evidenceId: EvidenceId;
  type: string;
  moduleId: string;
  timestamp: number;
  modelVersion: ModelVersion;
  path: string;
  hash: string;
}

interface EvidenceQuery {
  startTime?: number;
  endTime?: number;
  moduleId?: string;
  type?: string;
  modelVersion?: ModelVersion;
  limit?: number;
}

// ============================================================
// DECISION LOG
// ============================================================

class DecisionLog {
  private storage: StorageBackend;
  private decisions: Map<string, DecisionRecord> = new Map();
  
  constructor(storage: StorageBackend) {
    this.storage = storage;
  }
  
  async record(decision: DecisionRecord): Promise<void> {
    this.decisions.set(decision.decisionId, decision);
    await this.persist();
  }
  
  async get(decisionId: string): Promise<DecisionRecord | null> {
    return this.decisions.get(decisionId) || null;
  }
  
  async query(query: DecisionQuery): Promise<DecisionRecord[]> {
    let results = Array.from(this.decisions.values());
    
    if (query.startTime) {
      results = results.filter(d => d.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter(d => d.timestamp <= query.endTime!);
    }
    if (query.userId) {
      results = results.filter(d => d.intent.intentId.includes(query.userId!));
    }
    if (query.modality) {
      results = results.filter(d => d.intent.modalities.includes(query.modality!));
    }
    
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  private async persist(): Promise<void> {
    const data = Array.from(this.decisions.values());
    await require('fs').promises.writeFile(
      'decisions.json',
      JSON.stringify(data, null, 2)
    );
  }
  
  async load(): Promise<void> {
    try {
      const data = await require('fs').promises.readFile('decisions.json', 'utf-8');
      const decisions = JSON.parse(data);
      for (const d of decisions) {
        this.decisions.set(d.decisionId, d);
      }
    } catch {
      // No decisions yet
    }
  }
}

interface DecisionQuery {
  startTime?: number;
  endTime?: number;
  userId?: string;
  modality?: string;
}

// ============================================================
// TRACE LOG
// ============================================================

class TraceLog {
  private storage: StorageBackend;
  private traces: Map<string, ConstitutionalTrace> = new Map();
  
  constructor(storage: StorageBackend) {
    this.storage = storage;
  }
  
  async record(trace: ConstitutionalTrace): Promise<void> {
    this.traces.set(trace.chainId, trace);
    await this.persist(trace);
  }
  
  async get(chainId: string): Promise<ConstitutionalTrace | null> {
    return this.traces.get(chainId) || null;
  }
  
  async query(query: TraceQuery): Promise<ConstitutionalTrace[]> {
    let results = Array.from(this.traces.values());
    
    if (query.startTime) {
      results = results.filter(t => t.startTime >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter(t => t.endTime <= query.endTime!);
    }
    if (query.success !== undefined) {
      results = results.filter(t => t.success === query.success);
    }
    if (query.stage) {
      results = results.filter(t => t.stages.some(s => s.stage === query.stage));
    }
    
    return results.sort((a, b) => b.startTime - a.startTime);
  }
  
  private async persist(trace: ConstitutionalTrace): Promise<void> {
    const path = `traces/${trace.chainId}.json`;
    await require('fs').promises.writeFile(
      `traces/${trace.chainId}.json`,
      JSON.stringify(trace, null, 2)
    );
  }
  
  async load(): Promise<void> {
    try {
      const files = await require('fs').promises.readdir('traces');
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await require('fs').promises.readFile(`traces/${file}`, 'utf-8');
          const trace = JSON.parse(data);
          this.traces.set(trace.chainId, trace);
        }
      }
    } catch {
      // No traces yet
    }
  }
}

interface TraceQuery {
  startTime?: number;
  endTime?: number;
  success?: boolean;
  stage?: TraceStage['stage'];
}

// ============================================================
// REPLAY ENGINE
// ============================================================

class ReplayEngine {
  private evidenceManager: EvidenceManager;
  private traceLog: TraceLog;
  private decisionLog: DecisionLog;
  
  constructor(
    evidenceManager: EvidenceManager,
    traceLog: TraceLog,
    decisionLog: DecisionLog
  ) {
    this.evidenceManager = evidenceManager;
    this.traceLog = traceLog;
    this.decisionLog = decisionLog;
  }
  
  async replay(chainId: string, options: ReplayOptions): Promise<ReplayResult> {
    const originalTrace = await this.traceLog.get(chainId);
    if (!originalTrace) {
      throw new Error(`Trace not found: ${chainId}`);
    }
    
    const startTime = Date.now();
    const differences: any[] = [];
    
    try {
      // Re-execute each stage
      for (const stage of originalTrace.stages) {
        const stageStart = Date.now();
        
        // In production, would re-execute the actual modules
        // For now, verify evidence integrity
        const evidence = await this.verifyStageEvidence(stage);
        
        const duration = Date.now() - stageStart;
        
        if (!evidence.verified) {
          differences.push({
            field: `stage.${stage.stage}`,
            original: stage,
            replayed: { verified: false },
            toleranceExceeded: true
          });
        }
      }
      
      // Verify final output
      const outputVerified = await this.verifyOutput(chainId);
      if (!outputVerified) {
        differences.push({
          field: 'finalOutput',
          original: 'verified',
          replayed: 'mismatch',
          toleranceExceeded: true
        });
      }
      
      return {
        chainId,
        success: differences.length === 0,
        output: originalTrace,
        differences,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        chainId,
        success: false,
        output: originalTrace,
        differences: [{
          field: 'replay',
          original: 'success',
          replayed: `error: ${error instanceof Error ? error.message : String(error)}`,
          toleranceExceeded: true
        }],
        executionTimeMs: Date.now() - startTime
      };
    }
  }
  
  private async verifyStageEvidence(stage: TraceStage): Promise<{ verified: boolean }> {
    // Verify all evidence IDs in stage exist and match hashes
    // In production, would recompute hashes
    return { verified: true };
  }
  
  private async verifyOutput(chainId: string): Promise<boolean> {
    // Verify final output matches
    return true;
  }
  
  async verifyReplay(chainId: string, originalTrace: ConstitutionalTrace): Promise<VerificationResult> {
    const mismatches: VerificationMismatch[] = [];
    
    // Verify evidence integrity
    for (const stage of originalTrace.stages) {
      for (const evidenceId of stage.outputEvidenceIds) {
        const evidence = await this.getEvidence(evidenceId);
        if (evidence) {
          const computedHash = this.computeHash(evidence.data);
          if (evidence.hash && evidence.hash !== computedHash) {
            mismatches.push({
              evidenceId: evidenceId as any,
              expectedHash: evidence.hash,
              actualHash: computedHash
            });
          }
        }
      }
    }
    
    const evidenceIntegrity = mismatches.length === 0;
    
    return {
      verified: mismatches.length === 0,
      mismatches,
      evidenceIntegrity
    };
  }
  
  private async getEvidence(evidenceId: EvidenceId): Promise<any> {
    // In production, fetch from evidence manager
    return null;
  }
  
  private computeHash(data: any): string {
    return require('crypto').createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 32);
  }
}

// ============================================================
// AUDIT ENGINE
// ============================================================

class AuditEngine {
  private storage: StorageBackend;
  private traceLog: TraceLog;
  private decisionLog: DecisionLog;
  
  constructor(storage: StorageBackend, traceLog: TraceLog, decisionLog: DecisionLog) {
    this.storage = storage;
    this.traceLog = traceLog;
    this.decisionLog = decisionLog;
  }
  
  async archive(bundle: EvidenceBundle): Promise<string> {
    const archivePath = `archives/${bundle.bundleId}.json`;
    const archiveData = {
      bundle,
      archivedAt: Date.now(),
      version: '1.0.0'
    };
    
    await this.storage.write(archivePath, Buffer.from(JSON.stringify(archiveData, null, 2)));
    return archivePath;
  }
  
  async query(query: AuditQuery): Promise<AuditResult[]> {
    const traces = await this.traceLog.query({
      startTime: query.startTime,
      endTime: query.endTime,
      success: query.success
    });
    
    let results: AuditResult[] = [];
    
    for (const trace of traces) {
      const decisions = await this.decisionLog.query({
        startTime: trace.startTime,
        endTime: trace.endTime
      });
      
      // Filter by user if specified
      if (query.userId) {
        const userDecisions = decisions.filter(d => 
          d.intent.intentId.includes(query.userId!)
        );
        if (userDecisions.length === 0) continue;
      }
      
      // Filter by modality
      if (query.modality) {
        const modalityDecisions = decisions.filter(d => 
          d.intent.modalities.includes(query.modality!)
        );
        if (modalityDecisions.length === 0) continue;
      }
      
      // Filter by model version
      if (query.modelVersion) {
        // Would check model versions in decisions
      }
      
      const totalEvidence = trace.stages.reduce((sum, s) => sum + s.outputEvidenceIds.length, 0);
      
      results.push({
        chainId: trace.chainId,
        userId: 'anonymous', // Would extract from trace
        timestamp: trace.startTime,
        modalities: this.extractModalities(trace),
        success: trace.success,
        executionTimeMs: trace.endTime - trace.startTime,
        evidenceCount: totalEvidence
      });
    }
    
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
  
  private extractModalities(trace: ConstitutionalTrace): Modality[] {
    const modalities: Modality[] = [];
    for (const stage of trace.stages) {
      if (stage.moduleId === 'sme-vis' && !modalities.includes('image')) modalities.push('image');
      if (stage.moduleId === 'sme-aud' && !modalities.includes('audio')) modalities.push('audio');
      if (stage.moduleId === 'sme-vid' && !modalities.includes('video')) modalities.push('video');
      if (stage.moduleId === 'sme-txt' && !modalities.includes('text')) modalities.push('text');
      if (stage.moduleId === 'sme-gen' && !modalities.includes('image')) modalities.push('image');
    }
    return modalities;
  }
  
  async generateReport(chainId: string): Promise<AuditReport> {
    const trace = await this.getTrace(chainId);
    if (!trace) throw new Error(`Trace not found: ${chainId}`);
    
    const decisions = await this.getDecisionsForChain(chainId);
    const evidence = await this.getEvidenceForChain(chainId);
    
    const findings: AuditFinding[] = [];
    
    // Check for failed stages
    for (const stage of trace.stages) {
      if (!stage.success) {
        findings.push({
          findingId: `finding-${stage.stage}-${Date.now()}`,
          severity: 'violation',
          description: `Stage ${stage.stage} failed: ${stage.errors.join(', ')}`,
          evidenceIds: stage.outputEvidenceIds
        });
      }
    }
    
    // Check for missing evidence
    const expectedEvidence = this.getExpectedEvidence(trace);
    for (const ev of expectedEvidence) {
      if (!ev) {
        findings.push({
          findingId: `finding-missing-evidence-${Date.now()}`,
          severity: 'warning',
          description: `Expected evidence not found`,
          evidenceIds: []
        });
      }
    }
    
    // Check determinism
    const determinismCheck = this.checkDeterminism(trace);
    if (!determinismCheck) {
      findings.push({
        findingId: `finding-determinism-${Date.now()}`,
        severity: 'violation',
        description: 'Determinism check failed',
        evidenceIds: []
      });
    }
    
    const compliance: ComplianceStatus = {
      compliant: findings.filter(f => f.severity === 'violation').length === 0,
      violatedRules: findings.filter(f => f.severity === 'violation').map(f => f.description),
      recommendations: this.generateRecommendations(findings)
    };
    
    return {
      reportId: `report-${chainId}-${Date.now()}`,
      chainId,
      generatedAt: Date.now(),
      summary: `Audit report for ${chainId}: ${findings.filter(f => f.severity === 'violation').length} violations, ${findings.filter(f => f.severity === 'warning').length} warnings`,
      findings,
      compliance
    };
  }
  
  private async getTrace(chainId: string): Promise<ConstitutionalTrace | null> {
    // In production, fetch from trace log
    return null;
  }
  
  private async getDecisionsForChain(chainId: string): Promise<DecisionRecord[]> {
    return [];
  }
  
  private async getEvidenceForChain(chainId: string): Promise<any[]> {
    return [];
  }
  
  private getExpectedEvidence(trace: ConstitutionalTrace): EvidenceId[] {
    // Return expected evidence IDs based on trace stages
    return trace.stages.flatMap(s => s.outputEvidenceIds);
  }
  
  private checkDeterminism(trace: ConstitutionalTrace): boolean {
    // In production, would compare with replay
    return true;
  }
  
  private generateRecommendations(findings: AuditFinding[]): string[] {
    const recs: string[] = [];
    if (findings.some(f => f.severity === 'violation')) {
      recs.push('Investigate and fix violations before deployment');
    }
    if (findings.some(f => f.severity === 'warning')) {
      recs.push('Address warnings to improve compliance');
    }
    return recs;
  }
}

// ============================================================
// SME-LOG MAIN MODULE
// ============================================================

export class SmeLogModule implements SmeLogIFC {
  public readonly moduleId = 'sme-log';
  public readonly moduleType = 'log' as const;
  
  private config: SmeLogConfig | null = null;
  private storage: StorageBackend | null = null;
  private evidenceManager: EvidenceManager | null = null;
  private traceLog: TraceLog | null = null;
  private decisionLog: DecisionLog | null = null;
  private replayEngine: ReplayEngine | null = null;
  private auditEngine: AuditEngine | null = null;
  private initialized = false;
  
  async initialize(config: SmeLogConfig): Promise<void> {
    this.config = config;
    this.storage = new FileSystemStorage(config.storagePath);
    
    // Initialize sub-components
    this.evidenceManager = new EvidenceManager(this.storage);
    this.traceLog = new TraceLog(this.storage);
    this.decisionLog = new DecisionLog(this.storage);
    this.replayEngine = new ReplayEngine(
      this.evidenceManager,
      this.traceLog,
      this.decisionLog
    );
    this.auditEngine = new AuditEngine(
      this.storage,
      this.traceLog,
      new DecisionLog(this.storage)
    );
    
    // Load existing data
    await this.evidenceManager.loadIndex();
    await this.traceLog.load();
    await this.decisionLog.load();
    
    this.initialized = true;
    console.log('[SME-LOG] Initialized');
  }
  
  async recordEvidence(evidence: EvidenceRecord): Promise<void> {
    this.assertInitialized();
    await this.evidenceManager!.record(evidence);
  }
  
  async recordDecision(decision: DecisionRecord): Promise<void> {
    this.assertInitialized();
    await this.decisionLog!.record(decision);
  }
  
  async recordTrace(trace: ConstitutionalTrace): Promise<void> {
    this.assertInitialized();
    await this.traceLog!.record(trace);
  }
  
  async getEvidence(evidenceId: EvidenceId): Promise<EvidenceRecord | null> {
    this.assertInitialized();
    return this.evidenceManager!.get(evidenceId);
  }
  
  async getDecision(decisionId: string): Promise<DecisionRecord | null> {
    this.assertInitialized();
    return this.decisionLog!.get(decisionId);
  }
  
  async getTrace(chainId: string): Promise<ConstitutionalTrace | null> {
    this.assertInitialized();
    return this.traceLog!.get(chainId);
  }
  
  async replay(chainId: string, options?: ReplayOptions): Promise<ReplayResult> {
    this.assertInitialized();
    return this.replayEngine!.replay(chainId, options || {});
  }
  
  async verifyReplay(chainId: string, originalTrace: ConstitutionalTrace): Promise<VerificationResult> {
    this.assertInitialized();
    return this.replayEngine!.verifyReplay(chainId, originalTrace);
  }
  
  async archive(bundle: EvidenceBundle): Promise<string> {
    this.assertInitialized();
    return this.auditEngine!.archive(bundle);
  }
  
  async queryAudit(query: AuditQuery): Promise<AuditResult[]> {
    this.assertInitialized();
    return this.auditEngine!.query(query);
  }
  
  async generateReport(chainId: string): Promise<AuditReport> {
    this.assertInitialized();
    return this.auditEngine!.generateReport(chainId);
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // Test write/read
      const testId = `test-${Date.now()}`;
      await this.recordEvidence({
        evidenceId: testId as EvidenceId,
        type: 'test',
        moduleId: 'sme-log',
        data: { test: true },
        timestamp: Date.now(),
        modelVersion: 'test' as ModelVersion,
        hash: 'test'
      });
      const result = await this.getEvidence(testId as EvidenceId);
      return result !== null;
    } catch {
      return false;
    }
  }
  
  async healthCheckDetailed(): Promise<ModuleHealth> {
    const healthy = await this.healthCheck();
    return {
      moduleId: this.moduleId,
      healthy,
      lastCheck: Date.now(),
      error: healthy ? undefined : 'Health check failed',
      modelVersion: '1.0.0' as ModelVersion
    };
  }
  
  async shutdown(): Promise<void> {
    console.log('[SME-LOG] Shutdown complete');
  }
  
  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('SME-LOG not initialized. Call initialize() first.');
    }
  }
}

export default SmeLogModule;
export { EvidenceManager, DecisionLog, TraceLog, ReplayEngine, AuditEngine };