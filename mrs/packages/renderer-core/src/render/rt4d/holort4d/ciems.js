/**
 * CIEMS attach for HoloRT4D passes. Trail: Authority → Validation → Decision →
 * Evidence → Verification → Replay → Audit. CSE/chamber helpers injected — constitution unread-only.
 *
 * Enforced here: no accumulation without pixelId + opticalLength (see gate.js).
 * Evidence hashes of TileHeaders + complexField: enforced when those buffers exist.
 * Jarvis Memoryboard POST: skip once if down (partial).
 */

import { createHash } from "node:crypto";
import { rejectUnreadyPaths } from "./gate.js";
import { perceptualFeatures } from "./snapshot.js";

export const CIEMS_STATUS = Object.freeze({
  trail: "partial",
  evidenceHash: "enforced",
  orchestrationGate: "enforced",
  memoryboard: "partial",
  note: "Hashes of TileHeaders + complexField. CSE/CIEMSGovernanceValidator attach if injected. Constitution files untouched.",
});

export const CIEMS_TRAIL_STAGES = Object.freeze([
  "authority",
  "validation",
  "decision",
  "evidence",
  "verification",
  "replay",
  "audit",
]);

const CHAMBER_CIEMS = new URL(
  "../../../../../../../mandala/engine/chamber/ciems-validator.mjs",
  import.meta.url,
);

export function hashBytes(bytes, label = "") {
  const h = createHash("sha256");
  if (label) h.update(label);
  h.update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return h.digest("hex");
}

export function hashTileHeaders(headers) {
  const buf = new ArrayBuffer(headers.length * 8);
  const view = new DataView(buf);
  headers.forEach((hdr, i) => {
    view.setUint32(i * 8, Number(hdr.offset ?? 0) >>> 0, true);
    view.setUint32(i * 8 + 4, Number(hdr.count ?? 0) >>> 0, true);
  });
  return hashBytes(new Uint8Array(buf), "TileHeaders");
}

export function hashComplexField(field) {
  const buf = new Float32Array(field.length * 2);
  for (let i = 0; i < field.length; i++) {
    buf[i * 2] = Number(field[i]?.real ?? 0);
    buf[i * 2 + 1] = Number(field[i]?.imag ?? 0);
  }
  return hashBytes(new Uint8Array(buf.buffer), "complexField");
}

export async function loadChamberCiemsValidator() {
  try {
    return await import(CHAMBER_CIEMS.href);
  } catch {
    return null;
  }
}

function evidenceFrom(headers, field) {
  return {
    tileHeadersHash: headers.length ? hashTileHeaders(headers) : null,
    complexFieldHash: field.length ? hashComplexField(field) : null,
  };
}

/**
 * Attach the CIEMS trail to a pass record. Missing path evidence rejects (gate).
 */
export function attachCiemsTrail(pass, opts = {}) {
  rejectUnreadyPaths(opts.paths ?? pass.paths ?? []);
  const headers = opts.headers ?? pass.headers ?? [];
  const field = opts.field ?? pass.field ?? [];
  const evidence = evidenceFrom(headers, field);
  if (opts.requireEvidence !== false && !evidence.tileHeadersHash && !evidence.complexFieldHash) {
    throw new Error("CIEMS: reject-without-evidence (TileHeaders + complexField hashes missing)");
  }

  const cse = opts.cse;
  const validator = opts.validator ?? cse;
  let validation = cse?.validate?.(pass, evidence) ?? { status: "partial", ok: true, evidence };
  if (typeof validator?.processFrame === "function") {
    const scores = opts.governance ?? { intent: 1, evidence: 1, conformance: 1, stewardship: 1 };
    const frame = validator.processFrame(opts.frameNum ?? 0, scores);
    validation = { status: "partial", ok: frame.passed, violations: frame.violations, evidence, via: "CIEMSGovernanceValidator" };
  }

  const trail = {
    authority: cse?.authority ?? { status: "declared", actor: "holort4d" },
    validation,
    decision: cse?.decide?.(pass, evidence) ?? { status: "partial", allow: validation.ok !== false },
    evidence,
    verification: cse?.verify?.(evidence) ?? { status: "partial", hashes: evidence },
    replay: cse?.replay ?? { status: "declared", note: "replay from TileHeaders + complexField hashes" },
    audit: cse?.audit ?? { status: "declared", pass: pass.name ?? "holort4d" },
  };
  return {
    ...pass,
    ciems: trail,
    status: CIEMS_STATUS.trail,
  };
}

function snapshotDecisionBody(snapshot, evidence) {
  const features =
    snapshot?.perceptualFeatures ??
    (snapshot && typeof snapshot.length === "number" ? perceptualFeatures(snapshot) : {});
  return {
    level: snapshot?.level ?? snapshot?.id ?? "CPO",
    hash: evidence?.complexFieldHash ?? evidence?.tileHeadersHash ?? null,
    perceptualFeatures: features,
  };
}

/**
 * Optional Memoryboard POST. If Jarvis is down, skip once — never required.
 */
export async function postCiemsMemory(trail, opts = {}) {
  const url = opts.url ?? process.env.JARVIS_MEMORYBOARD_URL ?? "http://127.0.0.1:8001";
  const body = snapshotDecisionBody(opts.snapshot, trail?.ciems?.evidence ?? trail?.evidence);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 1500);
  try {
    const hashes = trail?.ciems?.evidence ?? trail?.evidence ?? {};
    const evidenceLinks = [];
    if (hashes.complexFieldHash) {
      evidenceLinks.push({ kind: "hash", ref: `sha256:${hashes.complexFieldHash}`, note: "complexField" });
    }
    if (hashes.tileHeadersHash) {
      evidenceLinks.push({ kind: "hash", ref: `sha256:${hashes.tileHeadersHash}`, note: "TileHeaders" });
    }
    const res = await fetch(`${url.replace(/\/$/, "")}/api/jarvis/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        content: JSON.stringify(body),
        source_agent: "cursor-grok-4.6",
        session_id: opts.session_id ?? "holort4d-ciems-2026-08-22",
        type: "decision",
        confidence: 0.8,
        status: opts.status ?? "draft",
        subject: "holort4d-ciems",
        tags: ["holort4d", "ciems", String(body.level ?? "CPO")],
        evidence: evidenceLinks,
      }),
    });
    return { posted: res.ok, status: res.status, skipped: false, body };
  } catch {
    return { posted: false, skipped: true, status: "partial", reason: "memoryboard-unreachable", body };
  } finally {
    clearTimeout(t);
  }
}
