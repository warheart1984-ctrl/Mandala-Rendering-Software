import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function patch(file, replacer) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.log(`[skip missing] ${file}`);
    return;
  }
  const src = fs.readFileSync(full, "utf8");
  const next = replacer(src);
  if (next === src) {
    console.log(`[ok] ${file}`);
    return;
  }
  if (dryRun) {
    console.log(`[dry-run would fix] ${file}`);
    return;
  }
  fs.writeFileSync(full, next, "utf8");
  console.log(`Auto-fixed: ${file}`);
}

console.log(
  dryRun
    ? "Mandala auto-fix (dry-run; pass --apply to write)."
    : "Mandala auto-fix APPLY mode.",
);

// Charter version fix (protected path — dry-run reports only unless --apply)
patch("engine/constitution/charter.js", (src) =>
  src.replace(/version:\s*".*?"/, `version: "1.0.0"`),
);

// Organ status fix
patch("engine/constitution/charter.js", (src) =>
  src
    .replace(/governanceKernel:\s*".*?"/, `governanceKernel: "enforced"`)
    .replace(/ckl:\s*".*?"/, `ckl: "enforced"`),
);

// CKL precedent filter fix
patch("engine/governance/ConstitutionalKnowledgeLayer.js", (src) =>
  src.replace(
    /p\.decision === false[^)]*\)/,
    `p.decision === false || p.decision === "deny"`,
  ),
);

// EnvironmentMapper WebGPU fix
patch("mrs/packages/renderer-core/src/gpu/EnvironmentMapper.js", (src) =>
  src.includes("GPUTextureUsage.COPY_DST")
    ? src
    : src.replace(/GPUBufferUsage\.COPY_DST/g, "GPUTextureUsage.COPY_DST"),
);

// GPUMeshRenderer storeOp fix
patch("mrs/packages/renderer-core/src/gpu/GPUMeshRenderer.js", (src) =>
  src.includes(`storeOp: "store"`)
    ? src
    : src.replace(/storeOp:\s*".*?"/g, `storeOp: "store"`),
);

// NVENCEncoder shell injection fix (stub)
patch("mrs/packages/renderer-core/src/encode/NVENCEncoder.js", (src) =>
  src.includes("exec(")
    ? src.replace(/exec\([^)]*\)/g, "/* exec removed for safety */")
    : src,
);

// BYOK — Genblaze media SoT (legacy genblaze/ path retired)
patch("mrs/apps/genblaze-media/app/static/index.html", (src) =>
  /localStorage\.setItem\(\s*BYOK_KEY/.test(src)
    ? src.replace(/localStorage\.setItem\(\s*BYOK_KEY[^)]*\)/g, "/* BYOK localStorage forbidden */")
    : src,
);

console.log("Mandala auto-fix complete.");
