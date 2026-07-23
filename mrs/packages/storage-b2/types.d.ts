/**
 * Type declarations for @mrs/storage-b2
 */

import type { S3Client, PutObjectCommandInput } from "@aws-sdk/client-s3";

export interface B2Config {
  keyId: string;
  applicationKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
}

export function isB2Configured(env?: NodeJS.ProcessEnv): boolean;
export function resolveEndpoint(region: string, explicit?: string): string;
export function loadB2Config(env?: NodeJS.ProcessEnv): B2Config;

export function createB2Client(config?: B2Config): {
  client: S3Client;
  config: B2Config;
};

export function putObject(params: {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType?: string;
  acl?: "private" | "public-read";
  client?: S3Client;
  config?: B2Config;
}): Promise<unknown>;

export function getObject(params: {
  key: string;
  client?: S3Client;
  config?: B2Config;
}): Promise<unknown>;

export function listObjects(params?: {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
  client?: S3Client;
  config?: B2Config;
}): Promise<unknown>;

export function deleteObject(params: {
  key: string;
  client?: S3Client;
  config?: B2Config;
}): Promise<unknown>;

export function createSignedUrl(params: {
  operation?: "get" | "put";
  key: string;
  expiresIn?: number;
  contentType?: string;
  client?: S3Client;
  config?: B2Config;
}): Promise<string>;

export function uploadArtifactIfConfigured(params: {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType?: string;
  config?: B2Config;
}): Promise<{
  status: "uploaded" | "skipped" | "error";
  key?: string;
  detail?: string;
}>;
