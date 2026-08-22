/**
 * Filesystem sandbox: chamber tape paths must resolve under repo output/.
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./core.js";

export const OUTPUT_ROOT = path.resolve(REPO_ROOT, "output");

/**
 * Resolve a user path under output/. Throws if outside sandbox.
 */
export function resolveUnderOutput(userPath: string): string {
  if (!userPath || typeof userPath !== "string") {
    throw new Error("path is required");
  }
  if (userPath.includes("\0")) {
    throw new Error("invalid path");
  }
  const trimmed = userPath.trim();
  // Allow repo-relative "output/..." or absolute under OUTPUT_ROOT
  let candidate: string;
  if (path.isAbsolute(trimmed)) {
    candidate = path.resolve(trimmed);
  } else if (trimmed === "output" || trimmed.startsWith(`output${path.sep}`) || trimmed.startsWith("output/")) {
    candidate = path.resolve(REPO_ROOT, trimmed);
  } else {
    candidate = path.resolve(OUTPUT_ROOT, trimmed);
  }
  const rel = path.relative(OUTPUT_ROOT, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(
      `path must be under ${OUTPUT_ROOT} (got ${candidate})`
    );
  }
  if (!fs.existsSync(candidate)) {
    throw new Error(`file not found under output/: ${rel}`);
  }
  const st = fs.statSync(candidate);
  if (!st.isFile()) {
    throw new Error(`not a file: ${rel}`);
  }
  return candidate;
}
