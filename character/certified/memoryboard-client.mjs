/**
 * Thin client for the Jarvis Continuity Ledger (jarvis-memoryboard, FastAPI).
 *
 * IMPORTANT — real routes (see jarvis-memoryboard/app/main.py):
 *   POST   /api/jarvis/memory        create   (NOT /api/jarvis/memory/store)
 *   GET    /api/jarvis/memory/{id}   read
 *   GET    /api/jarvis/memory        list (with_provenance)
 * The MemoryCreate body requires: content, source_agent, session_id, type,
 * confidence, evidence[], status, subject, tags[] (see app/models.py).
 *
 * STATUS: partial — write/read of the certified hash-chain is exercised end to
 * end; conflict/replay endpoints are used read-only for verification.
 */
const DEFAULT_BASE = process.env.JARVIS_MEMORYBOARD_URL || "http://localhost:8001";

/** POST a Continuity Ledger record. Returns the created record (with id). */
export async function createMemory(record, { baseUrl = DEFAULT_BASE } = {}) {
  const res = await fetch(`${baseUrl}/api/jarvis/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`memoryboard POST failed ${res.status}: ${text}`);
  }
  const body = await res.json();
  return body.memory;
}

/** GET a single record by id (includes selection provenance envelope). */
export async function getMemory(id, { baseUrl = DEFAULT_BASE } = {}) {
  const res = await fetch(`${baseUrl}/api/jarvis/memory/${id}`);
  if (!res.ok) throw new Error(`memoryboard GET ${id} failed ${res.status}`);
  return res.json();
}

/** GET a filtered list (query/subject) — used to prove lineage after writes. */
export async function listMemories(params = {}, { baseUrl = DEFAULT_BASE } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) qs.set(k, String(v));
  }
  const res = await fetch(`${baseUrl}/api/jarvis/memory?${qs.toString()}`);
  if (!res.ok) throw new Error(`memoryboard list failed ${res.status}`);
  return res.json();
}

/** Cheap health probe so the harness can degrade honestly when the ledger is down. */
export async function isHealthy({ baseUrl = DEFAULT_BASE } = {}) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export { DEFAULT_BASE as MEMORYBOARD_BASE };
