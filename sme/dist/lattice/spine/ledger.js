/**
 * Continuity Ledger Protocol (CLP) + Replay & Audit Contract (RAC).
 * Events are append-only; replay reconstructs ordered history.
 *
 * Provides:
 *   - ContinuityLedger (in-memory)
 *   - DurableContinuityLedger (SQLite WAL + Merkle sealing + periodic anchors)
 *
 * Ported from @sovereign-x/constitutional-compute (src/ledger.js, src/ledger.durable.js) to CJS.
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

class ContinuityLedger {
  constructor() {
    this.events = new Map();
    this.order = [];
    this.seq = 0;
  }

  size() { return this.order.length; }

  get(id) { return this.events.get(id) || null; }

  tip() {
    if (!this.order.length) { return null; }
    return this.events.get(this.order[this.order.length - 1]) || null;
  }

  append(input) {
    this.seq += 1;
    const id = `evt-${String(this.seq).padStart(6, '0')}`;
    const event = {
      id,
      authoritySignature: input.authoritySignature,
      dispatch: Object.freeze({ ...input.dispatch }),
      validation: Object.freeze({ ...input.validation }),
      sequence: this.seq,
      parentId: input.parentId ?? null,
      continuityDelta: input.continuityDelta ?? 1,
      status: input.status || 'committed',
      result: input.result,
      reflection: input.reflection ? Object.freeze({ ...input.reflection }) : undefined,
    };
    Object.freeze(event);
    this.events.set(id, event);
    this.order.push(id);
    return event;
  }

  replay() { return this.order.map((id) => this.events.get(id)); }

  auditRecord(id) {
    const e = this.get(id);
    if (!e) { return null; }
    return {
      Ai: e.authoritySignature,
      Di: e.dispatch,
      Vi: e.validation,
      Ti: e.sequence,
      dI: e.continuityDelta,
      status: e.status,
      parentId: e.parentId,
    };
  }
}

function eventLeafHash(event) {
  const canonical = {
    id: event.id,
    sequence: event.sequence,
    authoritySignature: event.authoritySignature,
    dispatch: event.dispatch,
    validation: event.validation,
    parentId: event.parentId,
    continuityDelta: event.continuityDelta,
    status: event.status,
    result: event.result,
    reflection: event.reflection,
  };
  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return createHash('sha256').update(json).digest('hex');
}

function merkleRoot(leaves) {
  if (!leaves.length) { return '0'.repeat(64); }
  let layer = [...leaves];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : left;
      next.push(createHash('sha256').update(left + right).digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}

function computeAnchor(merkleRootHash, prevAnchorHash, height, timestamp) {
  return createHash('sha256').update(merkleRootHash + prevAnchorHash + height + timestamp).digest('hex');
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL UNIQUE,
  authority_signature TEXT NOT NULL,
  dispatch_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  parent_id TEXT,
  continuity_delta INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'committed',
  result_json TEXT,
  reflection_json TEXT,
  merkle_root TEXT,
  anchor_hash TEXT,
  anchor_height INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
CREATE INDEX IF NOT EXISTS idx_events_parent ON events(parent_id);

CREATE TABLE IF NOT EXISTS merkle_leaves (
  event_id TEXT PRIMARY KEY,
  leaf_hash TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE,
  FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merkle_root TEXT NOT NULL,
  anchor_hash TEXT NOT NULL,
  height INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
`;

class DurableContinuityLedger {
  constructor(opts = {}) {
    this.anchorInterval = opts.anchorInterval ?? 100;
    this.dbPath = opts.inMemory ? ':memory:' : (opts.dbPath ?? path.join(process.cwd(), '.sx-ledger', 'continuity.db'));
    this.db = null;
    this.backend = null;
    this.durable = false;
    this.seq = 0;
    this.lastAnchor = null;
    this._initDb();
  }

  _initDb() {
    let Database = null;
    try {
      Database = require('better-sqlite3');
    } catch (err) {
      Database = null;
    }
    if (Database) {
      try {
        this._initSqlite(Database);
        return;
      } catch (err) {
        this.db = null;
        this._initMemory();
      }
    } else {
      this._initMemory();
    }
  }

  _initSqlite(Database) {
    const dir = path.dirname(this.dbPath);
    if (this.dbPath !== ':memory:' && !fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    this.db = new Database(this.dbPath);
    this.db.exec(SCHEMA);
    this._stmtInsertEvent = this.db.prepare(`
      INSERT INTO events (id, sequence, authority_signature, dispatch_json, validation_json,
        parent_id, continuity_delta, status, result_json, reflection_json, merkle_root, anchor_hash, anchor_height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this._stmtInsertLeaf = this.db.prepare('INSERT INTO merkle_leaves (event_id, leaf_hash, position) VALUES (?, ?, ?)');
    this._stmtInsertAnchor = this.db.prepare('INSERT INTO anchors (merkle_root, anchor_hash, height, event_count, timestamp) VALUES (?, ?, ?, ?, ?)');
    this._stmtGetEvent = this.db.prepare('SELECT * FROM events WHERE id = ?');
    this._stmtGetLeaves = this.db.prepare('SELECT leaf_hash FROM merkle_leaves ORDER BY position');
    this._stmtGetLastAnchor = this.db.prepare('SELECT * FROM anchors ORDER BY height DESC LIMIT 1');
    this._stmtCountEvents = this.db.prepare('SELECT COUNT(*) as c FROM events');
    this._stmtGetAllEvents = this.db.prepare('SELECT * FROM events ORDER BY sequence');
    this._stmtGetAllAnchors = this.db.prepare('SELECT * FROM anchors ORDER BY height');
    const row = this._stmtCountEvents.get();
    this.seq = row?.c ?? 0;
    this.lastAnchor = this._stmtGetLastAnchor.get() ?? null;
    this.durable = true;
    this.backend = this;
  }

  _initMemory() {
    this._memEvents = new Map();
    this._memOrder = [];
    this._memLeaves = [];
    this._memAnchors = [];
    this.seq = 0;
    this.lastAnchor = null;
    this.durable = false;
    this.backend = this;
  }

  _nextEventId() {
    return `evt-${String(this.seq + 1).padStart(6, '0')}`;
  }

  _buildEvent(input, id) {
    return Object.freeze({
      id,
      authoritySignature: input.authoritySignature,
      dispatch: Object.freeze({ ...input.dispatch }),
      validation: Object.freeze({ ...input.validation }),
      sequence: this.seq,
      parentId: input.parentId ?? null,
      continuityDelta: input.continuityDelta ?? 1,
      status: input.status || 'committed',
      result: input.result,
      reflection: input.reflection ? Object.freeze({ ...input.reflection }) : undefined,
    });
  }

  _advanceAnchor(leaves) {
    const root = merkleRoot(leaves);
    let anchorHash = this.lastAnchor?.anchor_hash ?? '0'.repeat(64);
    let anchorHeight = this.lastAnchor?.height ?? 0;
    if (this.seq % this.anchorInterval === 0) {
      const anchorTimestamp = Date.now();
      anchorHeight += 1;
      anchorHash = computeAnchor(root, anchorHash, anchorHeight, anchorTimestamp);
      this.lastAnchor = { merkle_root: root, anchor_hash: anchorHash, height: anchorHeight, event_count: this.seq, timestamp: anchorTimestamp };
    }
    return { root, anchorHash, anchorHeight };
  }

  size() { return this.seq; }

  get(id) {
    if (this.durable) {
      const row = this._stmtGetEvent.get(id);
      if (!row) { return null; }
      return this._rowToEvent(row);
    }
    return this._memEvents.get(id) || null;
  }

  tip() {
    if (!this.seq) { return null; }
    return this.get(`evt-${String(this.seq).padStart(6, '0')}`);
  }

  append(input) {
    this.seq += 1;
    const id = this._nextEventId();
    const event = this._buildEvent(input, id);
    const leafHash = eventLeafHash(event);

    if (this.durable) {
      const leaves = this._stmtGetLeaves.all().map((r) => r.leaf_hash);
      leaves.push(leafHash);
      const { root, anchorHash, anchorHeight } = this._advanceAnchor(leaves);
      this._stmtInsertEvent.run(
        id, this.seq, event.authoritySignature,
        JSON.stringify(event.dispatch), JSON.stringify(event.validation),
        event.parentId, event.continuityDelta, event.status,
        event.result ? JSON.stringify(event.result) : null,
        event.reflection ? JSON.stringify(event.reflection) : null,
        root, anchorHash, anchorHeight,
      );
      this._stmtInsertLeaf.run(id, leafHash, this.seq - 1);
      return { ...event, merkleRoot: root, anchorHash, anchorHeight };
    }

    this._memEvents.set(id, event);
    this._memOrder.push(id);
    this._memLeaves.push(leafHash);
    const prevAnchorHeight = this.lastAnchor?.height ?? 0;
    const { root, anchorHash, anchorHeight } = this._advanceAnchor(this._memLeaves);
    if (anchorHeight > prevAnchorHeight) {
      this._memAnchors.push({ merkle_root: root, anchor_hash: anchorHash, height: anchorHeight, event_count: this.seq, timestamp: this.lastAnchor.timestamp });
    }
    return { ...event, merkleRoot: root, anchorHash, anchorHeight };
  }

  replay() {
    if (this.durable) {
      const rows = this._stmtGetAllEvents.all();
      return rows.map((r) => this._rowToEvent(r));
    }
    return this._memOrder.map((id) => this._memEvents.get(id));
  }

  auditRecord(id) {
    const e = this.get(id);
    if (!e) { return null; }
    return {
      Ai: e.authoritySignature,
      Di: e.dispatch,
      Vi: e.validation,
      Ti: e.sequence,
      dI: e.continuityDelta,
      status: e.status,
      parentId: e.parentId,
      merkleRoot: e.merkleRoot,
      anchorHash: e.anchorHash,
      anchorHeight: e.anchorHeight,
    };
  }

  verifyInclusion(eventId) {
    const event = this.get(eventId);
    if (!event) { return { ok: false, proof: [], root: '', reason: 'event not found' }; }
    const leaves = this.durable
      ? this._stmtGetLeaves.all().map((r) => r.leaf_hash)
      : [...this._memLeaves];
    const targetIndex = event.sequence - 1;
    const proof = [];
    let index = targetIndex;
    let layer = [...leaves];

    while (layer.length > 1) {
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;
      const sibling = siblingIndex < layer.length ? layer[siblingIndex] : layer[index];
      proof.push({ position: isRight ? 'left' : 'right', hash: sibling });
      index = Math.floor(index / 2);
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = i + 1 < layer.length ? layer[i + 1] : left;
        next.push(createHash('sha256').update(left + right).digest('hex'));
      }
      layer = next;
    }

    const computedRoot = layer[0];
    const latestEvent = this.tip();
    const storedRoot = latestEvent?.merkleRoot ?? computedRoot;

    return {
      ok: computedRoot === storedRoot,
      proof: proof.map((p) => p.hash),
      root: computedRoot,
      anchor: this.lastAnchor ? { hash: this.lastAnchor.anchor_hash, height: this.lastAnchor.height } : undefined,
    };
  }

  verifyAnchors() {
    let anchors;
    if (this.durable) {
      anchors = this._stmtGetAllAnchors.all();
    } else {
      anchors = [...this._memAnchors];
    }
    if (!anchors.length) { return { ok: true, anchors: [] }; }
    let prevHash = '0'.repeat(64);
    for (const a of anchors) {
      const expected = computeAnchor(a.merkle_root, prevHash, a.height, a.timestamp);
      if (a.anchor_hash !== expected) {
        return { ok: false, anchors, reason: `anchor mismatch at height ${a.height}` };
      }
      prevHash = a.anchor_hash;
    }
    return { ok: true, anchors };
  }

  close() { if (this.db) { this.db.close(); this.db = null; } }

  _rowToEvent(row) {
    return {
      id: row.id,
      authoritySignature: row.authority_signature,
      dispatch: JSON.parse(row.dispatch_json),
      validation: JSON.parse(row.validation_json),
      sequence: row.sequence,
      parentId: row.parent_id,
      continuityDelta: row.continuity_delta,
      status: row.status,
      result: row.result_json ? JSON.parse(row.result_json) : undefined,
      reflection: row.reflection_json ? JSON.parse(row.reflection_json) : undefined,
      merkleRoot: row.merkle_root,
      anchorHash: row.anchor_hash,
      anchorHeight: row.anchor_height,
    };
  }
}

module.exports = {
  ContinuityLedger,
  DurableContinuityLedger,
  eventLeafHash,
  merkleRoot,
  computeAnchor,
};
