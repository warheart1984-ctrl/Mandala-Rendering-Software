/**
 * apply-bilateral-png smoke — round-trip tiny PNG through BilateralDenoiser.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../render-still.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "apply-bilateral-png.mjs");

const w = 8;
const h = 8;
const rgba = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  rgba[i * 4] = (i * 17) % 256;
  rgba[i * 4 + 1] = (i * 31) % 256;
  rgba[i * 4 + 2] = (i * 47) % 256;
  rgba[i * 4 + 3] = 255;
}
const png = encodePNG(w, h, rgba);
const inp = path.join(tmpdir(), `mrs-bilat-in-${process.pid}.png`);
const out = path.join(tmpdir(), `mrs-bilat-out-${process.pid}.png`);
const prov = path.join(tmpdir(), `mrs-bilat-prov-${process.pid}.json`);
writeFileSync(inp, png);

const r = spawnSync(process.execPath, [script, "--input", inp, "--output", out, "--provenance", prov], {
  encoding: "utf8",
});
assert.equal(r.status, 0, r.stderr || r.stdout);
const meta = JSON.parse(readFileSync(prov, "utf8"));
assert.equal(meta.denoise, true);
assert.ok(meta.denoiseFilterHash);
assert.ok(readFileSync(out).length > 32);

const r2 = spawnSync(process.execPath, [script, "--input", inp, "--output", out, "--provenance", prov], {
  encoding: "utf8",
});
assert.equal(r2.status, 0);
const meta2 = JSON.parse(readFileSync(prov, "utf8"));
assert.equal(meta.denoiseFilterHash, meta2.denoiseFilterHash);
assert.equal(meta.sha256, meta2.sha256);

try {
  unlinkSync(inp);
  unlinkSync(out);
  unlinkSync(prov);
} catch {
  /* ignore */
}
console.log("apply-bilateral-png.test.js: PASS");
