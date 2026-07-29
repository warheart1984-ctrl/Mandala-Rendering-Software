/**
 * Pure path helpers for CSSV ledger files (browser-safe — no Node imports).
 */

const CSSV_ROOT = "../../cssv";

function baseDirFromImportMetaUrl(url) {
  let path = url.startsWith("file://") ? url.slice(7) : url;
  // file:///G:/repo/... → G:/repo/...
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep encoded path */
  }
  const slash = path.lastIndexOf("/");
  const back = path.lastIndexOf("\\");
  const sep = Math.max(slash, back);
  return sep >= 0 ? path.substring(0, sep) : path;
}

function baseDir() {
  if (typeof __dirname !== "undefined") return __dirname;
  if (typeof import.meta?.url === "string") {
    return baseDirFromImportMetaUrl(import.meta.url);
  }
  return ".";
}

export function ledgerPaths(root) {
  const r =
    root ??
    (baseDir() + "/" + CSSV_ROOT)
      .replace(/[/\\]engine[/\\]cssv[/\\][^/\\]*[/\\]?/, "/cssv")
      .replace(/[/\\]+/g, "/");
  return {
    root: r,
    artifacts: r + "/artifacts.json",
    transitions: r + "/transitions.ndjson",
    frames: r + "/frames.ndjson",
  };
}
