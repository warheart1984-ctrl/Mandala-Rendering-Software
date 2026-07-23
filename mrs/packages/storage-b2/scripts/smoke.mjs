#!/usr/bin/env node
/**
 * Smoke test: skips when B2 env unset (CI-safe).
 * When configured, lists up to 5 objects in the bucket.
 */
import { isB2Configured, listObjects, loadB2Config } from "../src/index.js";

async function main() {
  if (!isB2Configured()) {
    console.log("skipped: B2 not configured");
    process.exit(0);
  }

  const config = loadB2Config();
  console.log(
    `B2 smoke: listing s3://${config.bucket} via ${config.endpoint} (region=${config.region})`
  );

  const result = await listObjects({ maxKeys: 5, config });
  const keys = (result.Contents ?? []).map((o) => o.Key);
  console.log(`ok: ${keys.length} object(s)${keys.length ? `: ${keys.join(", ")}` : ""}`);
}

main().catch((err) => {
  console.error("B2 smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
