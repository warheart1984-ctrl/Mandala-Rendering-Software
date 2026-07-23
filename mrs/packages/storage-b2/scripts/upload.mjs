#!/usr/bin/env node
/**
 * Upload a local file: node scripts/upload.mjs <localPath> <objectKey>
 */
import fs from "node:fs";
import path from "node:path";
import { loadB2Config, putObject } from "../src/index.js";

const localPath = process.argv[2];
const key = process.argv[3];

async function main() {
  if (!localPath || !key) {
    console.error("Usage: node scripts/upload.mjs <localPath> <objectKey>");
    process.exit(2);
  }
  if (!fs.existsSync(localPath)) {
    console.error(`File not found: ${localPath}`);
    process.exit(1);
  }

  const config = loadB2Config();
  const body = fs.createReadStream(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".json"
        ? "application/json"
        : ext === ".glb"
          ? "model/gltf-binary"
          : "application/octet-stream";

  await putObject({ key, body, contentType, config });
  console.log(`uploaded s3://${config.bucket}/${key}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
