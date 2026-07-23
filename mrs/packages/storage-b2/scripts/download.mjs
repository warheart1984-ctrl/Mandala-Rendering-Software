#!/usr/bin/env node
/**
 * Download an object: node scripts/download.mjs <objectKey> <localPath>
 */
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { getObject, loadB2Config } from "../src/index.js";

const key = process.argv[2];
const localPath = process.argv[3];

async function main() {
  if (!key || !localPath) {
    console.error("Usage: node scripts/download.mjs <objectKey> <localPath>");
    process.exit(2);
  }

  const config = loadB2Config();
  const result = await getObject({ key, config });
  if (!result.Body) {
    throw new Error("Empty body");
  }
  await pipeline(result.Body, fs.createWriteStream(localPath));
  console.log(`downloaded s3://${config.bucket}/${key} → ${localPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
