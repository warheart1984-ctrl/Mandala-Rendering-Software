/**
 * CSSV registry — browser + Node hosts register artifacts, transitions, frames.
 * Canonical constitutional ledger API (JS).
 */

import {
  appendNdjson,
  ledgerPaths,
  loadArtifacts,
  saveArtifacts,
} from "./ledger.js";

export class BrowserCssvHost {
  constructor() {
    this.hostId = "browser";
    this.hostVersion = "1.0";
  }
}

/**
 * In-memory registry with optional Node persistence to cssv/ ledger files.
 */
export class CssvRegistry {
  /**
   * @param {{ host?: BrowserCssvHost, persist?: boolean, root?: string }} opts
   */
  constructor(opts = {}) {
    this.host = opts.host ?? new BrowserCssvHost();
    this.persist = opts.persist ?? false;
    this.root = opts.root;
    this.paths = ledgerPaths(this.root);
    this.artifacts = [];
    this.transitions = [];
    this.frames = [];
    this._frameIndex = 0;
    this._stateId = "state-0000";
  }

  registerArtifact(artifact) {
    const record = {
      type: "artifact",
      id: artifact.id,
      artifactType: artifact.artifactType ?? artifact.type,
      host: artifact.hostId ?? this.host.hostId,
      timestamp: Date.now() / 1000,
      payload: {
        dto: artifact.dto ?? "unknown",
        data: artifact.payload ?? artifact.data ?? {},
      },
    };
    this.artifacts.push(record);
    if (this.persist) this._persistArtifact(record);
    return record;
  }

  registerTransition(transition) {
    const record = {
      type: "transition",
      id: transition.id ?? `tx-${this.transitions.length + 1}`,
      from: transition.fromStateId ?? this._stateId,
      to: transition.toStateId ?? `state-${this.transitions.length + 1}`,
      intent: transition.intent ?? {},
      authority: transition.authority ?? this.host.hostId,
      evidence: normalizeEvidence(transition.evidence),
      decision: transition.decision ?? { allowed: true, reasons: [] },
      host: transition.hostId ?? this.host.hostId,
      timestamp: transition.timeSeconds ?? Date.now() / 1000,
    };
    this._stateId = record.to;
    this.transitions.push(record);
    if (this.persist) appendNdjson(this.paths.transitions, record).catch(() => {});
    return record;
  }

  registerFrame(frame) {
    const record = {
      type: "frame",
      intent: frame.intentId ?? frame.intent ?? null,
      timeline: frame.timelineId ?? frame.timeline ?? null,
      world: frame.worldId ?? frame.world ?? null,
      host: frame.hostId ?? this.host.hostId,
      timestamp: frame.timeSeconds ?? Date.now() / 1000,
      params: frame.parameters ?? frame.params ?? {},
      frameIndex: this._frameIndex++,
    };
    this.frames.push(record);
    if (this.persist) appendNdjson(this.paths.frames, record).catch(() => {});
    return record;
  }

  exportSnapshot() {
    return {
      artifacts: this.artifacts.slice(),
      transitions: this.transitions.slice(),
      frames: this.frames.slice(),
    };
  }

  /**
   * Export ledger snapshot for host download.
   * Browser hosts should call downloadBlob / save dialog — this method no longer touches `document`.
   * @returns {{ filename: string, snapshot: object, json: string, bytes: number }}
   */
  exportLedgerDownload(filename = "cssv-ledger") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${filename}-${stamp}.json`;
    const snapshot = this.exportSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    return { filename: name, snapshot, json, bytes: json.length };
  }

  /**
   * @deprecated Prefer exportLedgerDownload + host downloadBlob. Kept as alias for browser callers.
   */
  downloadLedger(filename = "cssv-ledger") {
    const pack = this.exportLedgerDownload(filename);
    if (typeof this.host?.downloadTextFile === "function") {
      this.host.downloadTextFile(pack.filename, pack.json);
      return { filename: pack.filename, bytes: pack.bytes };
    }
    // No DOM here — return pack for the caller (js/app.js) to download.
    return pack;
  }

  /**
   * POST session snapshot to CSSV server (e.g. http://localhost:3000/ingest).
   * @returns {Promise<{ ok: boolean, ingested?: object, error?: string }>}
   */
  async syncToServer(ingestUrl) {
    if (!ingestUrl) return { ok: false, error: "No ingest URL" };
    const snapshot = this.exportSnapshot();
    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? res.statusText };
      return { ok: true, ingested: data.ingested };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async _persistArtifact(record) {
    const existing = await loadArtifacts(this.paths.artifacts);
    const idx = existing.findIndex((a) => a.id === record.id);
    if (idx >= 0) existing[idx] = record;
    else existing.push(record);
    await saveArtifacts(this.paths.artifacts, existing);
  }
}

function normalizeEvidence(evidence) {
  if (!evidence) return [];
  if (Array.isArray(evidence)) return evidence;
  if (Array.isArray(evidence.evidenceIds)) return evidence.evidenceIds;
  if (Array.isArray(evidence.items))
    return evidence.items.map((i) => i.id).filter(Boolean);
  if (evidence.id) return [evidence.id];
  return [];
}
