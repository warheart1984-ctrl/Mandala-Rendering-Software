/**
 * Gateway Audit Record — Canonical evidence produced by the MCP Gateway for every tool invocation.
 *
 * This makes the gateway a governed capability with its own evidence chain:
 * Intent → Tool Invocation → Engine Receipt → Evidence Bundle → Gateway Audit Record → Promotion Packet
 *
 * Status: declared (implemented in mcp-handler); live evidence proven after deploy.
 */

export interface GatewayAuditRecord {
  /** Unique audit record ID: gaud-<sha256(toolName:requestId:timestamp)[:16]> */
  auditId: string;
  /** MCP protocol version used */
  protocolVersion: string;
  /** Tool that was invoked */
  toolName: string;
  /** MCP request ID from the client */
  requestId: string | null;
  /** Correlation ID linking to engine receipt */
  correlationId: string;
  /** Timestamp of gateway receipt (ISO 8601) */
  gatewayReceivedAt: string;
  /** Timestamp of gateway response (ISO 8601) */
  gatewayRespondedAt: string;
  /** Total gateway latency in milliseconds */
  gatewayLatencyMs: number;
  /** Authentication context (sanitized) */
  authContext: {
    method: 'api-key' | 'none';
    principalId: string;
    stage: string;
  };
  /** Input validation result */
  validation: {
    schemaValid: boolean;
    schemaVersion: string;
    errors?: string[];
  };
  /** Engine interaction */
  engineInteraction: {
    /** Engine endpoint called */
    endpoint: string;
    /** Engine request ID (if returned) */
    engineRequestId?: string;
    /** Engine response status */
    engineStatus: number;
    /** Engine latency in milliseconds */
    engineLatencyMs: number;
    /** Engine receipt reference (renderId, sceneId, etc.) */
    engineReceiptRef?: string;
    /** Evidence bundle reference (S3 key) */
    evidenceBundleRef?: string;
  };
  /** Outcome classification */
  outcome: 'success' | 'validation_error' | 'engine_error' | 'gateway_error' | 'not_found';
  /** Failure class for observability (when outcome != success) */
  failureClass?: 'schema_validation' | 'engine_unreachable' | 'engine_error' | 'not_found' | 'internal';
  /** Structured error (when outcome != success) */
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  /** Artifact references for promotion packet */
  artifacts: {
    /** S3 key for this audit record */
    auditRecordKey: string;
    /** S3 key for engine receipt (if available) */
    engineReceiptKey?: string;
    /** S3 key for evidence bundle (if available) */
    evidenceBundleKey?: string;
  };
  /** Gateway runtime fingerprint */
  gatewayFingerprint: {
    version: string;
    runtime: string;
    region: string;
  };
}

/** Minimal reference for linking in promotion packets */
export interface GatewayAuditRef {
  auditId: string;
  auditRecordKey: string;
  toolName: string;
  correlationId: string;
  outcome: GatewayAuditRecord['outcome'];
  gatewayLatencyMs: number;
  engineLatencyMs: number;
  timestamp: string;
}

/** Schema version for validation tracking */
export const GATEWAY_AUDIT_SCHEMA_VERSION = '1.0.0';

/** Generate audit ID from deterministic inputs */
export function generateAuditId(toolName: string, requestId: string | null, timestamp: string): string {
  const crypto = require('crypto');
  const input = `${toolName}:${requestId ?? 'no-request-id'}:${timestamp}`;
  return `gaud-${crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)}`;
}

/** Generate correlation ID for linking gateway → engine → evidence */
export function generateCorrelationId(): string {
  const crypto = require('crypto');
  return `corr-${crypto.randomBytes(16).toString('hex')}`;
}

/** S3 key for audit record */
export function auditRecordKey(auditId: string, toolName: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `gateway-audits/${yyyy}/${mm}/${dd}/${toolName}/${auditId}.json`;
}