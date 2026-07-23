#!/usr/bin/env node
/**
 * List objects: node scripts/list.mjs [prefix]
 */
import { listObjects, loadB2Config } from "../src/index.js";

const prefix = process.argv[2];

async function main() {
  const config = loadB2Config();
  const result = await listObjects({ prefix, maxKeys: 100, config });
  const contents = result.Contents ?? [];
  if (contents.length === 0) {
    console.log("(empty)");
    return;
  }
  for (const obj of contents) {
    console.log(`${obj.Size ?? 0}\t${obj.Key}`);
  }
  if (result.IsTruncated) {
    console.log("… truncated (pass a narrower prefix or raise MaxKeys in code)");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
