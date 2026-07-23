/**
 * Thin object operations against a B2 bucket via S3-compatible API.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createB2Client } from "./client.js";

/**
 * @param {import("@aws-sdk/client-s3").S3Client} [client]
 * @param {import("./config.js").B2Config} [config]
 */
function resolve(client, config) {
  if (client && config) return { client, config };
  return createB2Client(config);
}

/**
 * @param {object} params
 * @param {string} params.key
 * @param {import("@aws-sdk/client-s3").PutObjectCommandInput["Body"]} params.body
 * @param {string} [params.contentType]
 * @param {string} [params.acl] private | public-read only (bucket-level ACL semantics)
 * @param {import("@aws-sdk/client-s3").S3Client} [params.client]
 * @param {import("./config.js").B2Config} [params.config]
 */
export async function putObject({
  key,
  body,
  contentType,
  acl,
  client,
  config,
}) {
  const resolved = resolve(client, config);
  if (acl && acl !== "private" && acl !== "public-read") {
    throw new Error('B2 ACL supported values: "private" | "public-read" only');
  }
  const input = {
    Bucket: resolved.config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  };
  if (acl) {
    input.ACL = acl;
  }
  return resolved.client.send(new PutObjectCommand(input));
}

/**
 * @param {object} params
 * @param {string} params.key
 * @param {import("@aws-sdk/client-s3").S3Client} [params.client]
 * @param {import("./config.js").B2Config} [params.config]
 */
export async function getObject({ key, client, config }) {
  const resolved = resolve(client, config);
  return resolved.client.send(
    new GetObjectCommand({
      Bucket: resolved.config.bucket,
      Key: key,
    })
  );
}

/**
 * @param {object} [params]
 * @param {string} [params.prefix]
 * @param {number} [params.maxKeys]
 * @param {string} [params.continuationToken]
 * @param {import("@aws-sdk/client-s3").S3Client} [params.client]
 * @param {import("./config.js").B2Config} [params.config]
 */
export async function listObjects({
  prefix,
  maxKeys = 100,
  continuationToken,
  client,
  config,
} = {}) {
  const resolved = resolve(client, config);
  return resolved.client.send(
    new ListObjectsV2Command({
      Bucket: resolved.config.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    })
  );
}

/**
 * @param {object} params
 * @param {string} params.key
 * @param {import("@aws-sdk/client-s3").S3Client} [params.client]
 * @param {import("./config.js").B2Config} [params.config]
 */
export async function deleteObject({ key, client, config }) {
  const resolved = resolve(client, config);
  return resolved.client.send(
    new DeleteObjectCommand({
      Bucket: resolved.config.bucket,
      Key: key,
    })
  );
}

/**
 * Presigned GET/PUT URL (optional helper).
 * @param {object} params
 * @param {"get"|"put"} [params.operation]
 * @param {string} params.key
 * @param {number} [params.expiresIn]
 * @param {string} [params.contentType]
 * @param {import("@aws-sdk/client-s3").S3Client} [params.client]
 * @param {import("./config.js").B2Config} [params.config]
 */
export async function createSignedUrl({
  operation = "get",
  key,
  expiresIn = 3600,
  contentType,
  client,
  config,
}) {
  const resolved = resolve(client, config);
  const command =
    operation === "put"
      ? new PutObjectCommand({
          Bucket: resolved.config.bucket,
          Key: key,
          ContentType: contentType,
        })
      : new GetObjectCommand({
          Bucket: resolved.config.bucket,
          Key: key,
        });
  return getSignedUrl(resolved.client, command, { expiresIn });
}

/**
 * Optional upload helper for gallery / export / evidence artifacts.
 * No-ops with a skip reason when B2 env is unset (safe for CI / local default).
 *
 * Status: declared hook — callers must not treat success as “cloud rendering complete.”
 *
 * @param {object} params
 * @param {string} params.key
 * @param {import("@aws-sdk/client-s3").PutObjectCommandInput["Body"]} params.body
 * @param {string} [params.contentType]
 * @param {import("./config.js").B2Config} [params.config]
 * @returns {Promise<{ status: "uploaded"|"skipped"|"error"; key?: string; detail?: string }>}
 */
export async function uploadArtifactIfConfigured({
  key,
  body,
  contentType,
  config,
}) {
  const { isB2Configured, loadB2Config } = await import("./config.js");
  if (!isB2Configured() && !config) {
    return {
      status: "skipped",
      detail: "skipped: B2 not configured",
    };
  }
  try {
    const cfg = config ?? loadB2Config();
    await putObject({ key, body, contentType, config: cfg });
    return { status: "uploaded", key };
  } catch (err) {
    return {
      status: "error",
      key,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
