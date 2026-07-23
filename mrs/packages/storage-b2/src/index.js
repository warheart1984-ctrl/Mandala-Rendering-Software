/**
 * @mrs/storage-b2 — Backblaze B2 S3-compatible storage scaffold.
 *
 * Drive-G-1: declared / operator-configured asset store path.
 * Does not claim cloud rendering marketplace or hosted render farm.
 */

export {
  isB2Configured,
  loadB2Config,
  resolveEndpoint,
} from "./config.js";

export { createB2Client } from "./client.js";

export {
  putObject,
  getObject,
  listObjects,
  deleteObject,
  createSignedUrl,
  uploadArtifactIfConfigured,
} from "./ops.js";
