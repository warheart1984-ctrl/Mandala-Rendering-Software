import { createHash } from "node:crypto";
import { computeErrorBound, withinTolerance } from "./MathValidity.js";

export const CERTIFICATION_STATUSES = Object.freeze({
  DRAFT: "draft",
  VALIDATED: "validated",
  REPLAY_VERIFIED: "replay_verified",
  AUDITED: "audited",
});

export const AUTHORITIES = Object.freeze({
  METRIC_ENGINE: "metric_engine",
  TENSOR_ENGINE: "tensor_engine",
  KINEMATICS_ENGINE: "kinematics_engine",
  DYNAMICS_ENGINE: "dynamics_engine",
  FIELD_ENGINE: "field_engine",
  FLUID_ENGINE: "fluid_engine",
  CURVATURE_ENGINE: "curvature_engine",
  PROJECTION_ENGINE: "projection_engine",
  RENDERER: "renderer",
});

export class CertifiedTensor {
  constructor(tensor, governance = {}) {
    this.tensor = tensor;
    this.authority = governance.authority || AUTHORITIES.TENSOR_ENGINE;
    this.validation = governance.validation || { passed: false, checks: [], errorBound: { max: 0, sources: [] } };
    this.decision = governance.decision || { made: false, reason: "" };
    this.evidence = governance.evidence || [];
    this.verification = governance.verification || { hash: null, replayable: false };
    this.replay = governance.replay || { token: null, seed: null, deterministic: false };
    this.audit = governance.audit || { reference: null, timestamp: null };
    this.certificationStatus = governance.certificationStatus || CERTIFICATION_STATUSES.DRAFT;
    this.timestamp = governance.timestamp || Date.now();
    this.certificationId = governance.certificationId || this._generateCertificationId();
  }

  _generateCertificationId() {
    const base = `${this.authority}-${this.tensor.rank}-${this.timestamp}`;
    return createHash("sha256").update(base).digest("hex").slice(0, 16);
  }

  static certify(tensor, authority, validationChecks = [], evidence = []) {
    const passed = validationChecks.every(c => c.passed);
    const errorBound = computeErrorBound(validationChecks);
    return new CertifiedTensor(tensor, {
      authority,
      validation: { passed, checks: validationChecks, errorBound },
      decision: { made: passed, reason: passed ? "All checks passed" : "Validation failed" },
      evidence,
      verification: { hash: CertifiedTensor._hashTensor(tensor), replayable: true },
      replay: { token: null, seed: null, deterministic: passed },
      certificationStatus: passed ? CERTIFICATION_STATUSES.VALIDATED : CERTIFICATION_STATUSES.DRAFT,
    });
  }

  static _hashTensor(tensor) {
    const data = tensor.toArray ? tensor.toArray() : tensor.components;
    return createHash("sha256").update(Buffer.from(new Float64Array(data).buffer)).digest("hex");
  }

  addEvidence(evidence) {
    this.evidence.push({ ...evidence, timestamp: Date.now() });
    return this;
  }

  setVerification(hash, replayable = true) {
    this.verification = { hash, replayable };
    return this;
  }

  setReplay(token, seed, deterministic) {
    this.replay = { token, seed, deterministic };
    return this;
  }

  setAudit(reference) {
    this.audit = { reference, timestamp: Date.now() };
    return this;
  }

  promote(status) {
    const order = [CERTIFICATION_STATUSES.DRAFT, CERTIFICATION_STATUSES.VALIDATED, CERTIFICATION_STATUSES.REPLAY_VERIFIED, CERTIFICATION_STATUSES.AUDITED];
    const currentIdx = order.indexOf(this.certificationStatus);
    const newIdx = order.indexOf(status);
    if (newIdx > currentIdx) {
      this.certificationStatus = status;
    }
    return this;
  }

  isValid() {
    return this.validation.passed && this.certificationStatus !== CERTIFICATION_STATUSES.DRAFT;
  }

  isWithinTolerance(tolerance) {
    return withinTolerance(this.validation.errorBound, tolerance);
  }

  errorBound() {
    return this.validation.errorBound;
  }

  toJSON() {
    return {
      certificationId: this.certificationId,
      tensor: this.tensor.toJSON(),
      authority: this.authority,
      validation: this.validation,
      decision: this.decision,
      evidenceCount: this.evidence.length,
      verification: this.verification,
      replay: this.replay,
      audit: this.audit,
      certificationStatus: this.certificationStatus,
      timestamp: this.timestamp,
    };
  }

  toProvenanceRecord() {
    return {
      certificationId: this.certificationId,
      tensorRank: this.tensor.rank,
      authority: this.authority,
      validationPassed: this.validation.passed,
      errorBound: this.validation.errorBound,
      verificationHash: this.verification.hash,
      replayToken: this.replay.token,
      auditReference: this.audit.reference,
      timestamp: this.timestamp,
    };
  }
}

export function certifyTensor(tensor, authority, checks, evidence) {
  return CertifiedTensor.certify(tensor, authority, checks, evidence);
}

export function createCertificationId(authority, rank, timestamp) {
  return createHash("sha256").update(`${authority}-${rank}-${timestamp}`).digest("hex").slice(0, 16);
}