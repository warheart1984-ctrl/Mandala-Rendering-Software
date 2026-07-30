/**
 * PGDS v1.0 — Photoreal Governance Dashboard API (partial).
 * Node http only — no Express dependency.
 */

import {
  createServer,
} from "node:http";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";

function loadJsonSafe(p) {
  try {
    if (!p || !existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function listRunDirs(baseDir) {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir)
    .map((d) => join(baseDir, d))
    .filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .filter(
      (p) =>
        existsSync(join(p, "fpec.json")) ||
        existsSync(join(p, "cel.json")) ||
        existsSync(join(p, "pep.json")) ||
        existsSync(join(p, "verification-trail.json")),
    );
}

function summarizeRun(runDir) {
  const id = basename(runDir);
  const cel = loadJsonSafe(join(runDir, "cel.json")) || {};
  const cpcs = loadJsonSafe(join(runDir, "cpcs.json")) || {};
  const fpec = loadJsonSafe(join(runDir, "fpec.json")) || {};
  const pep = loadJsonSafe(join(runDir, "pep.json"));
  const spr = loadJsonSafe(join(runDir, "spr.json"));
  const pepCompleteness =
    cel.completeness?.pep ??
    (cel.entries || []).find((e) => e.kind === "pep")?.completeness ??
    pep?.completeness?.score ??
    fpec.scores?.pep ??
    null;
  const sprCompleteness =
    cel.completeness?.spr ??
    (cel.entries || []).find((e) => e.kind === "spr")?.completeness ??
    spr?.completeness?.score ??
    fpec.scores?.spr ??
    null;
  return {
    runId: cel.runId || id,
    rendererId:
      cel.rendererId ||
      pep?.authorityRecord?.renderer?.name ||
      "unknown",
    pepCompleteness,
    sprCompleteness,
    eligibilityScore: fpec.eligibilityScore ?? null,
    governanceDecision: fpec.governanceDecision ?? cel.governanceDecision ?? null,
    certified: cpcs.certified ?? false,
    certificationLevel: cpcs.certificationLevel ?? "NONE",
    auditVerdict:
      cpcs.auditVerdict ||
      loadJsonSafe(join(runDir, "cat-phr.json"))?.verdict ||
      null,
  };
}

function detailRun(runDir) {
  return {
    runId: basename(runDir),
    runDir,
    cel: loadJsonSafe(join(runDir, "cel.json")),
    cpcs: loadJsonSafe(join(runDir, "cpcs.json")),
    fpec: loadJsonSafe(join(runDir, "fpec.json")),
    dre: loadJsonSafe(join(runDir, "rdc.json")),
    audit: loadJsonSafe(join(runDir, "cat-phr.json")),
    checklist: loadJsonSafe(join(runDir, "photoreal-checklist-t01-t13.json")),
    pep: loadJsonSafe(join(runDir, "pep.json")),
    spr: loadJsonSafe(join(runDir, "spr.json")),
  };
}

function htmlIndex(runs) {
  const rows = runs
    .map(
      (r) => `<tr>
  <td><a href="/api/run/${encodeURIComponent(r.runId)}">${escapeHtml(r.runId)}</a></td>
  <td>${escapeHtml(String(r.rendererId))}</td>
  <td>${fmt(r.pepCompleteness)}</td>
  <td>${fmt(r.sprCompleteness)}</td>
  <td>${fmt(r.eligibilityScore)}</td>
  <td>${r.certified ? "yes" : "no"}</td>
  <td>${escapeHtml(String(r.certificationLevel))}</td>
  <td>${escapeHtml(String(r.auditVerdict ?? ""))}</td>
</tr>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>PGDS — Photoreal Governance Dashboard</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 2rem; background: #f7f4ef; color: #1a1a1a; }
    h1 { font-weight: 600; letter-spacing: 0.02em; }
    p { max-width: 40rem; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
    th, td { border-bottom: 1px solid #cfc8bc; padding: 0.5rem 0.65rem; text-align: left; font-size: 0.95rem; }
    th { font-variant: small-caps; letter-spacing: 0.04em; }
    a { color: #0b3d4a; }
    code { background: #ebe6dc; padding: 0.1rem 0.3rem; }
  </style>
</head>
<body>
  <h1>Photoreal Governance Dashboard</h1>
  <p>PGDS v1.0 (partial). JSON: <code>/api/runs</code>, <code>/api/run/:id</code>. Certification stays honest — no auto Phase 4 Full Photoreal.</p>
  <table>
    <thead>
      <tr>
        <th>run</th><th>renderer</th><th>pep</th><th>spr</th><th>fpec</th>
        <th>certified</th><th>level</th><th>audit</th>
      </tr>
    </thead>
    <tbody>
${rows || "<tr><td colspan=8>No runs found</td></tr>"}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  return typeof n === "number" ? n.toFixed(4) : "—";
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

/**
 * @param {string} baseDir directory containing run folders
 * @param {number} [port=4000]
 * @returns {{ server: import('node:http').Server, baseDir: string, port: number, url: string }}
 */
export function createDashboardServer(baseDir, port = 4000) {
  const root = resolve(baseDir || "");
  if (!root || !existsSync(root)) {
    throw new Error(`PGDS baseDir missing: ${baseDir}`);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathName = url.pathname;

    if (req.method === "GET" && pathName === "/api/runs") {
      const runs = listRunDirs(root).map(summarizeRun);
      return sendJson(res, 200, { runs, baseDir: root });
    }

    const runMatch = pathName.match(/^\/api\/run\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const id = decodeURIComponent(runMatch[1]);
      const runDir = join(root, id);
      if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
        return sendJson(res, 404, { error: "run not found", runId: id });
      }
      return sendJson(res, 200, detailRun(runDir));
    }

    if (req.method === "GET" && (pathName === "/" || pathName === "/index.html")) {
      const runs = listRunDirs(root).map(summarizeRun);
      return sendHtml(res, 200, htmlIndex(runs));
    }

    sendJson(res, 404, { error: "not found", path: pathName });
  });

  server.listen(port, "127.0.0.1");

  return {
    server,
    baseDir: root,
    port,
    url: `http://127.0.0.1:${port}/`,
  };
}
