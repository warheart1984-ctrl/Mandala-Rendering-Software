# @mrs/storage-b2

Thin **Backblaze B2** client using the **S3-Compatible API** and AWS SDK v3 (`@aws-sdk/client-s3`).

| Field | Value |
| --- | --- |
| Status (Drive-G-1) | **Declared / operator-configured** |
| Not claimed | Cloud rendering marketplace, hosted farm, or “cloud rendering complete” |
| Auth | Application Key ID + application key (AWS Signature Version 4) |
| Endpoint | `https://s3.<region>.backblazeb2.com` |

## Install (workspace)

From `mrs/`:

```bash
pnpm install
```

Or from this package directory:

```bash
npm install
```

## Env vars

Copy placeholders from repo root [`.env.example`](../../../.env.example) or [`config/b2.example.json`](../../../config/b2.example.json).

| Variable | Role |
| --- | --- |
| `B2_KEY_ID` | Application Key ID (Access Key) |
| `B2_APPLICATION_KEY` | Application key (Secret Key) |
| `B2_BUCKET` | Bucket name |
| `B2_REGION` | e.g. `us-west-004` |
| `B2_ENDPOINT` | Optional; defaults to `https://s3.${B2_REGION}.backblazeb2.com` |
| `B2_FORCE_PATH_STYLE` | Default `true`; set `false` to try virtual-hosted style |

Aliases: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are accepted if `B2_*` credentials are unset.

**Do not use the master application key** with the S3-Compatible API — create a non-master application key scoped to the bucket.

## API

```js
import {
  isB2Configured,
  putObject,
  getObject,
  listObjects,
  deleteObject,
  createSignedUrl,
  uploadArtifactIfConfigured,
} from "@mrs/storage-b2";
```

`uploadArtifactIfConfigured` returns `{ status: "skipped", detail: "skipped: B2 not configured" }` when env is unset — safe for optional gallery/export hooks.

## Scripts

```bash
npm run smoke      # skips if env unset
npm run list       # listObjects
npm run upload -- ./out/frame.png renders/frame.png
npm run download -- renders/frame.png ./frame.png
```

From repo root: `npm run b2:smoke`, `npm run b2:list`, etc.

## Docs

Operator guide: [`docs/ops/BACKBLAZE_B2_S3.md`](../../../docs/ops/BACKBLAZE_B2_S3.md).
