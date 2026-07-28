/**
 * CSSV ledger loader — host-agnostic read/write of artifacts + NDJSON streams.
 *
 * Node-only functions use dynamic import() for node:fs / node:readline so
 * the module can be imported safely in browser contexts.  The synchronous
 * ledgerPaths() helper does not require Node modules (pure string ops).
 */

const CSSV_ROOT = "../../cssv";

function baseDir() {
  if (typeof __dirname !== "undefined") return __dirname;
  if (typeof import.meta?.url === "string") {
    const url = import.meta.url;
    const path = url.startsWith("file://") ? url.slice(7) : url;
    return path.substring(0, path.lastIndexOf("/"));
  }
  return ".";
}

export function ledgerPaths(root) {
  const r = root ?? (baseDir() + "/" + CSSV_ROOT).replace(/\/engine\/cssv\/.*/, "/cssv").replace(/\/+/g, "/");
  return {
    root: r,
    artifacts: r + "/artifacts.json",
    transitions: r + "/transitions.ndjson",
    frames: r + "/frames.ndjson",
  };
}

export async function ensureLedgerInitialized(root) {
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
  const fs = await import("node:fs");
  const p = path ?? ledgerPaths().artifacts;
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return Array.isArray(raw) ? raw : raw.artifacts ?? [];
}

export async function loadNdjson(path) {
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
      console.warn(
        `[CSSV] Skipping malformed NDJSON line in ${path}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return rows;
}

export async function loadLedger(root) {
  const paths = await ensureLedgerInitialized(root);
  const [artifacts, transitions, frames] = await Promise.all([
    loadArtifacts(paths.artifacts),
    loadNdjson(paths.transitions),
    loadNdjson(paths.frames),
  ]);
  return { artifacts, transitions, frames, paths };
}

export async function appendNdjson(path, record) {
  const fs = await import("node:fs");
  const { dirname } = await import("node:path");
  await ensureLedgerInitialized(dirname(path));
  fs.appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function appendNdjsonBatch(path, records) {
  if (!records?.length) return;
  const fs = await import("node:fs");
  const { dirname } = await import("node:path");
  await ensureLedgerInitialized(dirname(path));
  const chunk = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.appendFileSync(path, chunk, "utf8");
}

export async function saveArtifacts(path, artifacts) {
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
