#!/usr/bin/env node
/**
 * SDK example: Story Forge → AAIS → Chamber → Mandala → Painter → Mythar → Movie Lane.
 * Delegates to run-e2e so there is one integration path.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runE2E } from "../run-e2e.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const outDir = join(__dirname, "../../../../output/mandala-engine-e2e");
const result = await runE2E({ outDir, tEnd: 8 });
console.log("sdk example", {
  png: result.pngPath,
  wav: result.wavPath,
  mp4: result.mp4Path,
  receipt: result.receiptPath,
  illegalRejected: result.illegalRejected,
});
