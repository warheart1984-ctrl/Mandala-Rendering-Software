/**
 * SME Contracts - Constitutional Interfaces for Sovereign Multimodal Engine
 * Version: 1.0.0
 * 
 * These define the contracts between modules and the constitutional runtime.
 * No module may bypass SME-Core; all data flows through governed interfaces.
 */

// ============================================================
// COMMON TYPES
// ============================================================

/** Unique identifier for evidence traceability */
export type EvidenceId = string & { readonly __brand: unique symbol };

/** Model version identifier */
export type ModelVersion = string & { readonly __brand: unique symbol };

/** Constitutional authority grant */
export interface AuthorityGrant {
  grantId: string;
  requester: string;
  permittedModalities: Modality[];
  constraints: AuthorityConstraints;
  expiresAt: number; // Unix timestamp
  signature: string; // Cryptographic signature
}

/** Authority constraints */
export interface AuthorityConstraints {
  maxTokens?: number;
  maxResolution?: { width: number; height: number };
  maxDurationSec?: number;
  allowedModels?: string[];
  safetyLevel: 'strict' | 'standard' | 'permissive';
  resourceBudget?: ResourceBudget;
}

/** Resource budget for execution */
export interface ResourceBudget {
  maxCpuPercent?: number;
  maxMemoryMb?: number;
  maxDurationMs?: number;
  allowGpuOffload?: boolean;
}

/** Modality types */
export type Modality = 'text' | 'image' | 'audio' | 'video';

/** Constitutional decision record */
export interface DecisionRecord {
  decisionId: string;
  timestamp: number;
  intent: UserIntent;
  authorityGrant: AuthorityGrant;
  validationResult: ValidationResult;
  reasoningTrace: ReasoningTrace;
  outputs: ModuleOutput[];
  evidenceIds: EvidenceId[];
  signature: string;
}

/** Validation result */
export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  warnings: string[];
}

/** Individual validation check */
export interface ValidationCheck {
  checkId: string;
  name: string;
  passed: boolean;
  details?: string;
}

/** Reasoning trace from SME-TXT */
export interface ReasoningTrace {
  steps: ReasoningStep[];
  modelVersion: ModelVersion;
  seed: number;
}

/** Reasoning step */
export interface ReasoningStep {
  stepId: string;
  description: string;
  inputRefs: EvidenceId[];
  outputRefs: EvidenceId[];
  confidence: number;
}

/** User intent structure */
export interface UserIntent {
  intentId: string;
  modalities: Modality[];
  goal: string;
  constraints: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

/** Module output */
export interface ModuleOutput {
  moduleId: string;
  modality: Modality;
  data: unknown;
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  timestamp: number;
}

/** Constitutional chain state */
export interface ConstitutionalChainState {
  chainId: string;
  stage: 'authority' | 'validation' | 'fusion' | 'decision' | 'evidence' | 'verification' | 'replay' | 'audit' | 'complete' | 'failed';
  currentModule?: string;
  completedStages: string[];
  errors: string[];
}

// ============================================================
// MODULE INTERFACES (IFC)
// ============================================================

/** SME-TXT: Text Reasoning Core */
export interface SmeTxtIFC {
  /** Initialize with model path and config */
  initialize(config: SmeTxtConfig): Promise<void>;
  
  /** Process text prompt with optional multimodal embeddings */
  process(input: SmeTxtInput): Promise<SmeTxtOutput>;
  
  /** Generate text continuation */
  generate(input: SmeTxtGenerateInput): Promise<SmeTxtGenerateOutput>;
  
  /** Get model info */
  getModelInfo(): SmeModelInfo;
  
  /** Health check */
  healthCheck(): Promise<boolean>;
}

export interface SmeTxtConfig {
  modelPath: string;
  contextLength: number;
  quantization: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'INT8';
  threads: number;
  gpuLayers?: number;
  seed: number;
  constitutionalContext?: string;
}

export interface SmeTxtInput {
  prompt: string;
  embeddings?: MultimodalEmbeddings;
  authorityGrant: AuthorityGrant;
  seed?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface SmeTxtGenerateInput {
  prompt: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  stopSequences?: string[];
  seed?: number;
}

export interface SmeTxtOutput {
  text: string;
  reasoningTrace: ReasoningTrace;
  decisionRecord: DecisionRecord;
  evidenceId: EvidenceId;
  tokensUsed: number;
}

export interface SmeTxtGenerateOutput {
  text: string;
  tokensGenerated: number;
  finishReason: 'stop' | 'length' | 'eos';
}

/** SME-VIS: Vision Module */
export interface SmeVisIFC {
  initialize(config: SmeVisConfig): Promise<void>;
  encode(input: SmeVisInput): Promise<SmeVisOutput>;
  encodeBatch(inputs: SmeVisInput[]): Promise<SmeVisOutput[]>;
  getModelInfo(): SmeModelInfo;
  healthCheck(): Promise<boolean>;
}

export interface SmeVisConfig {
  modelPath: string;
  modelType: 'mobilevit' | 'efficientnet' | 'vit-tiny' | 'vit-small' | 'resnet-pruned';
  inputSize: { width: number; height: number };
  quantization: 'INT8' | 'FP16' | 'FP32';
  device: 'cpu' | 'cuda' | 'directml';
}

export interface SmeVisInput {
  imageData: Buffer | Uint8Array; // PNG/JPEG/WebP bytes
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  authorityGrant: AuthorityGrant;
  extractFeatures?: boolean;
}

export interface SmeVisOutput {
  embedding: Float32Array; // Fixed-length embedding
  features?: VisionFeatures;
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  preprocessing: PreprocessingInfo;
}

export interface VisionFeatures {
  objects: DetectedObject[];
  scenes: SceneLabel[];
  attributes: AttributeLabel[];
  colors: ColorPalette;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, w, h normalized
}

export interface SceneLabel {
  label: string;
  confidence: number;
}

export interface AttributeLabel {
  label: string;
  confidence: number;
}

export interface ColorPalette {
  dominant: string[];
  accent: string[];
}

export interface PreprocessingInfo {
  originalSize: { width: number; height: number };
  resizedSize: { width: number; height: number };
  normalization: string;
}

/** SME-AUD: Audio Module */
export interface SmeAudIFC {
  initialize(config: SmeAudConfig): Promise<void>;
  transcribe(input: SmeAudInput): Promise<SmeAudOutput>;
  classify(input: SmeAudInput): Promise<SmeAudClassifyOutput>;
  getModelInfo(): SmeModelInfo;
  healthCheck(): Promise<boolean>;
}

export interface SmeAudConfig {
  modelPath: string;
  modelType: 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'whisper-medium' | 'faster-whisper';
  language?: string;
  quantization: 'INT8' | 'FP16' | 'FP32';
  device: 'cpu' | 'cuda' | 'directml';
  computeType?: 'int8' | 'float16' | 'float32';
}

export interface SmeAudInput {
  audioData: Buffer; // WAV/MP3/OGG bytes
  mimeType: 'audio/wav' | 'audio/mp3' | 'audio/ogg';
  authorityGrant: AuthorityGrant;
  options?: TranscribeOptions;
}

export interface TranscribeOptions {
  language?: string;
  task?: 'transcribe' | 'translate';
  wordTimestamps?: boolean;
  vadFilter?: boolean;
}

export interface SmeAudOutput {
  transcript: string;
  segments: TranscriptSegment[];
  embedding: Float32Array;
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  durationSec: number;
}

export interface TranscriptSegment {
  id: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
  confidence: number;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SmeAudClassifyOutput {
  labels: AudioLabel[];
  embedding: Float32Array;
  evidenceId: EvidenceId;
}

export interface AudioLabel {
  label: string;
  confidence: number;
}

/** SME-VID: Video Module */
export interface SmeVidIFC {
  initialize(config: SmeVidConfig): Promise<void>;
  analyze(input: SmeVidInput): Promise<SmeVidOutput>;
  getModelInfo(): SmeModelInfo;
  healthCheck(): Promise<boolean>;
}

export interface SmeVidConfig {
  modelPath: string;
  frameSampler: 'uniform' | 'keyframe' | 'scene-change' | 'adaptive';
  maxFrames: number;
  frameEmbedder: SmeVisIFC; // Reuses vision encoder
  temporalAggregator: 'mean' | 'attention' | 'rnn' | 'transformer-tiny';
  quantization: 'INT8' | 'FP16' | 'FP32';
  device: 'cpu' | 'cuda' | 'directml';
}

export interface SmeVidInput {
  videoData: Buffer; // MP4/WebM bytes
  mimeType: 'video/mp4' | 'video/webm';
  authorityGrant: AuthorityGrant;
  options?: VideoAnalyzeOptions;
}

export interface VideoAnalyzeOptions {
  maxDurationSec?: number;
  sampleRateFps?: number;
  detectScenes?: boolean;
  detectActions?: boolean;
}

export interface SmeVidOutput {
  globalEmbedding: Float32Array;
  frameEmbeddings: Float32Array[]; // Per-frame or per-segment
  timestamps: number[]; // Corresponding timestamps
  events?: VideoEvent[];
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  durationSec: number;
  framesAnalyzed: number;
}

export interface VideoEvent {
  type: 'scene_change' | 'action' | 'object_appear' | 'object_disappear';
  startTime: number;
  endTime: number;
  description: string;
  confidence: number;
  frameIndices: number[];
}

/** SME-GEN: Generative Media Module */
export interface SmeGenIFC {
  initialize(config: SmeGenConfig): Promise<void>;
  generateImage(input: SmeGenImageInput): Promise<SmeGenImageOutput>;
  generateAudio(input: SmeGenAudioInput): Promise<SmeGenAudioOutput>;
  generateVideo(input: SmeGenVideoInput): Promise<SmeGenVideoOutput>;
  getModelInfo(): SmeModelInfo;
  healthCheck(): Promise<boolean>;
}

export interface SmeGenConfig {
  imageModelPath?: string;
  audioModelPath?: string;
  videoModelPath?: string;
  offloadEndpoint?: string; // For GPU offload
  offloadAuth?: string;
  maxResolution: { width: number; height: number };
  maxDurationSec: number;
  safetyFilters: SafetyFilter[];
}

export interface SmeGenImageInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed?: number;
  authorityGrant: AuthorityGrant;
  controlNet?: ControlNetInput;
}

export interface ControlNetInput {
  type: 'canny' | 'depth' | 'pose' | 'seg';
  imageData: Buffer;
  strength: number;
}

export interface SmeGenImageOutput {
  imageData: Buffer; // PNG bytes
  mimeType: 'image/png';
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  parameters: ImageGenParameters;
}

export interface ImageGenParameters {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  model: string;
}

export interface SmeGenAudioInput {
  text: string;
  voice?: string;
  speed?: number;
  authorityGrant: AuthorityGrant;
}

export interface SmeGenAudioOutput {
  audioData: Buffer; // WAV/MP3 bytes
  mimeType: 'audio/wav' | 'audio/mp3';
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  durationSec: number;
}

export interface SmeGenVideoInput {
  prompt: string;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  authorityGrant: AuthorityGrant;
  imageSequence?: Buffer[]; // Optional: generate from images
}

export interface SmeGenVideoOutput {
  videoData: Buffer; // MP4 bytes
  mimeType: 'video/mp4';
  evidenceId: EvidenceId;
  modelVersion: ModelVersion;
  durationSec: number;
  parameters: VideoGenParameters;
}

export interface VideoGenParameters {
  prompt: string;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  seed: number;
  model: string;
}

/** SME-CORE: Orchestration & Constitutional Runtime */
export interface SmeCoreIFC {
  initialize(config: SmeCoreConfig): Promise<void>;
  execute(input: SmeCoreInput): Promise<SmeCoreOutput>;
  getChainState(chainId: string): Promise<ConstitutionalChainState>;
  registerModule(moduleId: string, module: SmeModule): void;
  unregisterModule(moduleId: string): void;
  healthCheck(): Promise<SmeHealthStatus>;
}

export interface SmeCoreConfig {
  authorityEngine: SmeAuthEngine;
  validationEngine: SmeValEngine;
  fusionEngine: SmeFuseEngine;
  decisionEngine: SmeDecEngine;
  evidenceEngine: SmeEvrEngine;
  auditEngine: SmeAuditEngine;
  modules: Map<string, SmeModule>;
  constitutionalRules: ConstitutionalRule[];
  resourceLimits: ResourceLimits;
}

export interface SmeCoreInput {
  intent: UserIntent;
  rawMedia: RawMediaMap;
  authorityContext?: AuthorityContext;
}

export interface RawMediaMap {
  text?: string;
  images?: Buffer[];
  audio?: Buffer[];
  video?: Buffer[];
}

export interface AuthorityContext {
  userId: string;
  role: string;
  permissions: string[];
}

export interface SmeCoreOutput {
  chainId: string;
  response: GovernedResponse;
  constitutionalTrace: ConstitutionalTrace;
  evidenceBundle: EvidenceBundle;
}

export interface GovernedResponse {
  text?: string;
  images?: Buffer[];
  audio?: Buffer[];
  video?: Buffer[];
  metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  decisionRecord: DecisionRecord;
  evidenceIds: EvidenceId[];
  modelVersions: Map<string, ModelVersion>;
  executionTimeMs: number;
  resourceUsage: ResourceUsage;
}

export interface ConstitutionalTrace {
  chainId: string;
  stages: TraceStage[];
  startTime: number;
  endTime: number;
  success: boolean;
}

export interface TraceStage {
  stage: ConstitutionalChainState['stage'];
  moduleId: string;
  inputEvidenceIds: EvidenceId[];
  outputEvidenceIds: EvidenceId[];
  durationMs: number;
  success: boolean;
  errors: string[];
}

export interface EvidenceBundle {
  bundleId: string;
  evidence: Map<EvidenceId, EvidenceRecord>;
  decisionRecords: DecisionRecord[];
  provenance: ProvenanceRecord;
}

export interface EvidenceRecord {
  evidenceId: EvidenceId;
  type: 'input' | 'embedding' | 'reasoning' | 'decision' | 'generation' | 'validation';
  moduleId: string;
  data: unknown;
  timestamp: number;
  modelVersion: ModelVersion;
  hash: string; // Content hash for integrity
}

export interface ProvenanceRecord {
  userId: string;
  requestId: string;
  timestamp: number;
  modelVersions: Map<string, ModelVersion>;
  configHash: string;
}

export interface ResourceUsage {
  cpuMs: number;
  peakMemoryMb: number;
  gpuMs?: number;
  networkMs?: number;
}

export interface ResourceLimits {
  maxConcurrentChains: number;
  maxCpuPercent: number;
  maxMemoryMb: number;
  defaultTimeoutMs: number;
}

export interface ConstitutionalRule {
  ruleId: string;
  name: string;
  modality: Modality | 'all';
  condition: (input: SmeCoreInput) => boolean;
  action: 'allow' | 'deny' | 'require_approval' | 'transform';
  priority: number;
}

/** SME-LOG: Evidence, Replay, Audit */
export interface SmeLogIFC {
  initialize(config: SmeLogConfig): Promise<void>;
  recordEvidence(evidence: EvidenceRecord): Promise<void>;
  recordDecision(decision: DecisionRecord): Promise<void>;
  recordTrace(trace: ConstitutionalTrace): Promise<void>;
  getEvidence(evidenceId: EvidenceId): Promise<EvidenceRecord | null>;
  getDecision(decisionId: string): Promise<DecisionRecord | null>;
  getTrace(chainId: string): Promise<ConstitutionalTrace | null>;
  replay(chainId: string, options?: ReplayOptions): Promise<ReplayResult>;
  verifyReplay(chainId: string, originalTrace: ConstitutionalTrace): Promise<VerificationResult>;
  archive(chainId: string): Promise<string>; // Returns archive path
  queryAudit(query: AuditQuery): Promise<AuditResult[]>;
  healthCheck(): Promise<boolean>;
}

export interface SmeLogConfig {
  storagePath: string;
  retentionDays: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  maxBundleSizeMb: number;
}

export interface ReplayOptions {
  seed?: number;
  overrideModelVersions?: Map<string, ModelVersion>;
  skipGeneration?: boolean;
  strictMode?: boolean;
}

export interface ReplayResult {
  chainId: string;
  success: boolean;
  output: SmeCoreOutput;
  differences: ReplayDifference[];
  executionTimeMs: number;
}

export interface ReplayDifference {
  field: string;
  original: unknown;
  replayed: unknown;
  toleranceExceeded: boolean;
}

export interface VerificationResult {
  verified: boolean;
  mismatches: VerificationMismatch[];
  evidenceIntegrity: boolean;
}

export interface VerificationMismatch {
  evidenceId: EvidenceId;
  expectedHash: string;
  actualHash: string;
}

export interface AuditQuery {
  startTime?: number;
  endTime?: number;
  userId?: string;
  modality?: Modality;
  modelVersion?: ModelVersion;
  success?: boolean;
  limit?: number;
}

export interface AuditResult {
  chainId: string;
  userId: string;
  timestamp: number;
  modalities: Modality[];
  success: boolean;
  executionTimeMs: number;
  evidenceCount: number;
}

/** Module health status */
export interface SmeHealthStatus {
  healthy: boolean;
  modules: Map<string, ModuleHealth>;
  resourceUsage: ResourceUsage;
  uptimeMs: number;
}

export interface ModuleHealth {
  moduleId: string;
  healthy: boolean;
  lastCheck: number;
  error?: string;
  modelVersion?: ModelVersion;
}

/** Common model info */
export interface SmeModelInfo {
  moduleId: string;
  modelName: string;
  modelVersion: ModelVersion;
  framework: 'llama.cpp' | 'onnx' | 'pytorch' | 'tensorflow' | 'whisper.cpp' | 'custom';
  frameworkVersion: string;
  parameters: number;
  quantization: string;
  device: string;
  capabilities: string[];
  loaded: boolean;
  loadTimeMs?: number;
}

/** Multimodal embeddings container */
export interface MultimodalEmbeddings {
  text?: Float32Array;
  vision?: Float32Array;
  audio?: Float32Array;
  video?: Float32Array;
  fused?: Float32Array;
  metadata: EmbeddingMetadata;
}

export interface EmbeddingMetadata {
  modelVersions: Map<string, ModelVersion>;
  dimensions: Map<string, number>;
  timestamp: number;
}

/** Safety filter */
export interface SafetyFilter {
  filterId: string;
  name: string;
  modality: Modality;
  check: (data: unknown) => Promise<SafetyCheckResult>;
}

export interface SafetyCheckResult {
  safe: boolean;
  violations: SafetyViolation[];
}

export interface SafetyViolation {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
}

/** SME Module base interface */
export interface SmeModule {
  moduleId: string;
  moduleType: 'txt' | 'vis' | 'aud' | 'vid' | 'gen' | 'core' | 'log';
  initialize(config: unknown): Promise<void>;
  healthCheck(): Promise<ModuleHealth>;
  shutdown(): Promise<void>;
}

/** Engines */
export interface SmeAuthEngine {
  evaluate(request: AuthorityRequest): Promise<AuthorityGrant>;
  revoke(grantId: string): Promise<void>;
  validate(grant: AuthorityGrant): Promise<boolean>;
}

export interface AuthorityRequest {
  userId: string;
  intent: UserIntent;
  context: AuthorityContext;
}

export interface SmeValEngine {
  validate(input: SmeCoreInput, grant: AuthorityGrant): Promise<ValidationResult>;
  registerValidator(modality: Modality, validator: Validator): void;
}

export interface Validator {
  checkId: string;
  name: string;
  check: (input: unknown) => Promise<ValidationCheck>;
}

export interface SmeFuseEngine {
  fuse(embeddings: MultimodalEmbeddings, context: string): Promise<Float32Array>;
  registerFusionStrategy(name: string, strategy: FusionStrategy): void;
}

export interface FusionStrategy {
  name: string;
  fuse: (embeddings: MultimodalEmbeddings) => Promise<Float32Array>;
}

export interface SmeDecEngine {
  decide(input: DecisionInput): Promise<DecisionOutput>;
}

export interface DecisionInput {
  intent: UserIntent;
  fusedEmbedding: Float32Array;
  authorityGrant: AuthorityGrant;
  validationResult: ValidationResult;
  context: string;
}

export interface DecisionOutput {
  decisionRecord: DecisionRecord;
  actions: DecisionAction[];
}

export interface DecisionAction {
  actionId: string;
  type: 'generate_text' | 'generate_image' | 'generate_audio' | 'generate_video' | 'query_knowledge' | 'notify';
  moduleId: string;
  parameters: Record<string, unknown>;
  priority: number;
  dependsOn?: string[];
}

export interface SmeEvrEngine {
  collect(evidence: EvidenceRecord): Promise<void>;
  finalize(chainId: string): Promise<EvidenceBundle>;
  verify(bundle: EvidenceBundle): Promise<boolean>;
}

export interface SmeAuditEngine {
  archive(bundle: EvidenceBundle): Promise<string>;
  query(query: AuditQuery): Promise<AuditResult[]>;
  generateReport(chainId: string): Promise<AuditReport>;
}

export interface AuditReport {
  reportId: string;
  chainId: string;
  generatedAt: number;
  summary: string;
  findings: AuditFinding[];
  compliance: ComplianceStatus;
}

export interface AuditFinding {
  findingId: string;
  severity: 'info' | 'warning' | 'violation';
  description: string;
  evidenceIds: EvidenceId[];
}

export interface ComplianceStatus {
  compliant: boolean;
  violatedRules: string[];
  recommendations: string[];
}

export default {
  // Type exports for reference
};