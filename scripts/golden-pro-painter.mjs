#!/usr/bin/env node
/**
 * Deprecated local alias for scripts/golden-painter.mjs.
 *
 * Pro gate is optional / deprecated for local open runs.
 * Prefer:  node scripts/golden-painter.mjs
 *
 * Future SaaS: MANDALA_BILLING_ENFORCE=1 still requires dual pro+uncensored keys.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runGoldenPainter,
  runGoldenProPainter,
  SALT_MAP_THEME,
} from "./golden-painter.mjs";

export { runGoldenPainter, runGoldenProPainter, SALT_MAP_THEME };

const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname;

function parseArgs(argv = process.argv.slice(2)) {
  return {
    withE2e: argv.includes("--with-e2e"),
    allowCpu: argv.includes("--allow-cpu"),
    edge: Number(process.env.AI_PAINTER_SIZE) || 64,
    theme: (() => {
      const i = argv.indexOf("--theme");
      return i >= 0 && argv[i + 1] ? argv[i + 1] : SALT_MAP_THEME;
    })(),
  };
}

const isMain =
  process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("golden-pro-painter.mjs");

if (isMain) {
  console.warn(
    "[golden-pro-painter] pro gate optional / deprecated for local — prefer: node scripts/golden-painter.mjs",
  );
  const args = parseArgs();
  runGoldenPainter({
    ...args,
    outDir: join(dirname(fileURLToPath(import.meta.url)), "../output/mandala-painter-open"),
  })
    .then((r) => {
      console.log("Golden pro painter OK (open local wrapper)");
      console.log(`  frame:   ${r.framePath}`);
      console.log(`  receipt: ${r.receiptPath}`);
      console.log(
        `  tier=${r.receipt.tier} uncensored=${r.receipt.uncensored} backend=${r.receipt.backend} model=${r.receipt.model} via=${r.receipt.via}`,
      );
      console.log(`  sha256=${r.receipt.sha256}`);
      if (r.receipt.note) console.log(`  note: ${r.receipt.note}`);
      if (r.e2e) console.log(`  e2e overlay: ${r.e2e.outDir}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Golden pro painter failed: ${err.message}`);
      if (err.receiptPath) console.error(`  receipt: ${err.receiptPath}`);
      process.exit(err.exitCode || 1);
    });
}
