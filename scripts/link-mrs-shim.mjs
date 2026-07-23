/**
 * OPTIONAL / LEGACY: recreate Windows junction 4d-renderer/src → mrs/packages/renderer-core/src.
 *
 * Not required for clones or CI. Root package.json exports and examples/scripts import
 * mrs/packages/renderer-core (or 4d-renderer package exports) directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "mrs", "packages", "renderer-core", "src");
const link = path.join(root, "4d-renderer", "src");

console.log(
  "link:mrs-shim is optional/legacy — prefer @mrs/renderer-core or mrs/packages/renderer-core/src imports.",
);

if (!fs.existsSync(target)) {
  console.error("Missing", target);
  process.exit(1);
}

if (fs.existsSync(link)) {
  const st = fs.lstatSync(link);
  if (st.isSymbolicLink() || (st.isDirectory() && fs.readdirSync(link).includes("index.js"))) {
    console.log("4d-renderer/src already present");
    process.exit(0);
  }
}

if (process.platform !== "win32") {
  console.log("Create a symlink manually (only if you need deep 4d-renderer/src paths):");
  console.log(`  ln -s ${target} ${link}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(link), { recursive: true });
const r = spawnSync("cmd", ["/c", "mklink", "/J", link, target], { encoding: "utf8" });
console.log(r.stdout || r.stderr || "done");
process.exit(r.status ?? 0);
