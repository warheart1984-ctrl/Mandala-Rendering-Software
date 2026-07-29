/**
 * Node-only CSSV ledger persistence (dynamic node:fs / node:readline).
 * Browser hosts must not import this module — use CssvRegistry with persist:false
 * and exportLedgerDownload / syncToServer instead of loadLedger().
 */

import { ledgerPaths } from "./ledgerPaths.js";
import { logStructured } from "../logging/injectableLogger.js";

export function isNodeLedgerHost() {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    typeof process.versions.node === "string"
  );
}

function assertNodeLedgerHost(fnName) {
  if (!isNodeLedgerHost()) {
    throw new Error(
      `[CSSV] ${fnName} requires a Node.js host. In the browser use CssvRegistry.exportLedgerDownload() or syncToServer().`,
    );
  }
}

export async function ensureLedgerInitialized(root) {
  assertNodeLedgerHost("ensureLedgerInitialized");
  const fs = await import("node:fs");
  const paths = ledgerPaths(root);
  if (!fs.existsSync(paths.root)) fs.mkdirSync(paths.root, { recursive: true });
  if (!fs.existsSync(paths.artifacts)) {
    fs.writeFileSync(paths.artifacts, "[]\n", "utf8");
  }
  for (const p of [paths.transitions, paths.frames]) {
    if (!fs.existsSync(p)) fs.writeFileSync(p, "", "utf8");
  }
  return paths;
}

export async function loadArtifacts(path) {
  assertNodeLedgerHost("loadArtifacts");
  const fs = await import("node:fs");
  const p = path ?? ledgerPaths().artifacts;
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return Array.isArray(raw) ? raw : raw.artifacts ?? [];
}

export async function loadNdjson(path) {
  assertNodeLedgerHost("loadNdjson");
  const fs = await import("node:fs");
  const readline = await import("node:readline");
  if (!fs.existsSync(path)) return [];
  const stream = fs.createReadStream(path, "utf8");
  const rl = readline.createInterface({ input: stream });
  const rows = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (err) {
      logStructured("warn", "cssv.ledger", "Skipping malformed NDJSON line", {
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return rows;
}

export async function loadLedger(root) {
  assertNodeLedgerHost("loadLedger");
  const paths = await ensureLedgerInitialized(root);
  const [artifacts, transitions, frames] = await Promise.all([
    loadArtifacts(paths.artifacts),
    loadNdjson(paths.transitions),
    loadNdjson(paths.frames),
  ]);
  return { artifacts, transitions, frames, paths };
}

export async function appendNdjson(path, record) {
  assertNodeLedgerHost("appendNdjson");
  const fs = await import("node:fs");
  const { dirname } = await import("node:path");
  await ensureLedgerInitialized(dirname(path));
  fs.appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function appendNdjsonBatch(path, records) {
  if (!records?.length) return;
  assertNodeLedgerHost("appendNdjsonBatch");
  const fs = await import("node:fs");
  const { dirname } = await import("node:path");
  await ensureLedgerInitialized(dirname(path));
  const chunk = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.appendFileSync(path, chunk, "utf8");
}

export async function saveArtifacts(path, artifacts) {
  assertNodeLedgerHost("saveArtifacts");
  const fs = await import("node:fs");
  const { dirname } = await import("node:path");
  await ensureLedgerInitialized(dirname(path));
  fs.writeFileSync(path, JSON.stringify(artifacts, null, 2), "utf8");
}

export async function mergeArtifacts(path, incoming) {
  const existing = await loadArtifacts(path);
  for (const record of incoming) {
    const idx = existing.findIndex((a) => a.id === record.id);
    if (idx >= 0) existing[idx] = record;
    else existing.push(record);
  }
  await saveArtifacts(path, existing);
  return existing.length;
}
