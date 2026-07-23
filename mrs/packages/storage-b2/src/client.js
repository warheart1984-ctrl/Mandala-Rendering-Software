/**
 * S3Client factory for Backblaze B2 S3-Compatible API.
 * Uses AWS Signature Version 4 via @aws-sdk/client-s3.
 */

import { S3Client } from "@aws-sdk/client-s3";
import { loadB2Config } from "./config.js";

/**
 * @param {import("./config.js").B2Config} [config]
 * @returns {{ client: S3Client, config: import("./config.js").B2Config }}
 */
export function createB2Client(config) {
  const cfg = config ?? loadB2Config();

  if (!cfg.endpoint.startsWith("https://")) {
    throw new Error("B2 endpoint must be HTTPS");
  }

  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.keyId,
      secretAccessKey: cfg.applicationKey,
    },
  });

  return { client, config: cfg };
}
