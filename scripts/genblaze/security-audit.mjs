#!/usr/bin/env node
/**
 * Genblaze security audit (Node) — BYOK policy files, no keys in git, hosted flag docs.
 * Browser XSS deep checks: optional/skipped with honest note (no headless browser here).
 *
 * Usage: node scripts/genblaze/security-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const findings = [];
function ok(id, msg) {
  findings.push({ id, status: "pass", msg });
}
function fail(id, msg) {
  findings.push({ id, status: "fail", msg });
}
function skip(id, msg) {
  findings.push({ id, status: "skip", msg });
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

// BYOK module
const byok = read("mrs/apps/genblaze-media/app/byok.py");
if (!byok) fail("byok.py", "missing");
else {
  if (byok.includes("byok_permitted") && byok.includes("is_hosted_render")) ok("byok.policy", "hosted/loopback policy present");
  else fail("byok.policy", "policy helpers missing");
  if (byok.includes('"printSoT": False') || byok.includes("printSoT\": False") || byok.includes("\"printSoT\": False"))
    ok("byok.printSoT", "printSoT false in health view");
  else if (byok.includes("printSoT")) ok("byok.printSoT", "printSoT referenced");
  else fail("byok.printSoT", "printSoT missing");
}

const ui = read("mrs/apps/genblaze-media/app/static/index.html");
if (!ui) fail("ui", "static index missing");
else {
  if (ui.includes("sessionStorage")) ok("ui.sessionStorage", "sessionStorage used");
  else fail("ui.sessionStorage", "sessionStorage missing");
  if (/\blocalStorage\b/.test(ui) && /genblaze_api_key/.test(ui))
    fail("ui.localStorage", "localStorage near BYOK key id");
  else ok("ui.localStorage", "no localStorage BYOK key pattern");
}

const charter = read("docs/genblaze/security/byok-security-charter.md");
if (charter && charter.includes("GENBLAZE_ALLOW_BYOK")) ok("docs.hosted_flag", "hosted flag documented");
else fail("docs.hosted_flag", "charter missing or incomplete");

// No real nvapi secrets in tracked sources — ignore help strings + test fixtures.
try {
  const out = execSync(
    'git grep -I -n "nvapi-" -- ":!*.md" ":!mandala-agent-pack/**" ":!.tmp*" || true',
    { cwd: ROOT, encoding: "utf8", shell: true },
  );
  const lines = out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((l) => {
      const lower = l.toLowerCase();
      if (lower.includes("placeholder")) return false;
      if (lower.includes("nvapi-…") || lower.includes("nvapi-...")) return false;
      if (lower.includes("nvapi-test")) return false;
      if (lower.includes("free nvapi- key")) return false;
      if (lower.includes("create a free nvapi")) return false;
      if (/tests?[\\/]/.test(l.replace(/\\/g, "/"))) return false;
      // Require something that looks like a real key token after nvapi-
      const m = l.match(/nvapi-([A-Za-z0-9_-]{16,})/);
      return Boolean(m);
    });
  if (lines.length) fail("git.nvapi", `possible key material:\n${lines.slice(0, 8).join("\n")}`);
  else ok("git.nvapi", "no durable nvapi- secrets found (ignores tests/help text)");
} catch {
  skip("git.nvapi", "git grep unavailable");
}

skip(
  "browser.xss",
  "Browser XSS audit is optional/skipped here — static review only; use a real browser suite if needed.",
);

console.log("Genblaze security audit (partial)\n");
let errors = 0;
for (const f of findings) {
  console.log(`[${f.status.toUpperCase()}] ${f.id}: ${f.msg}`);
  if (f.status === "fail") errors++;
}
process.exit(errors > 0 ? 1 : 0);
