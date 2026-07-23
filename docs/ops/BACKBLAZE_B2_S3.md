# Backblaze B2 — S3-Compatible API (operator storage)

| Field | Value |
| --- | --- |
| Status (Drive-G-1) | **Declared / operator-configured** |
| Package | [`@mrs/storage-b2`](../../mrs/packages/storage-b2/) |
| Purpose | Optional object store for renders, gallery PNGs, world documents, evidence bundles |
| Not claimed | Cloud rendering marketplace, hosted render farm, or “cloud rendering complete” |

This repository ships a **client scaffold**. Operators create the Backblaze account, bucket, and application key, then fill local `.env` (never committed).

Official references:

- [Call the S3-Compatible API](https://www.backblaze.com/docs/cloud-storage-call-the-s3-compatible-api)
- [AWS SDK for JavaScript v3 + B2](https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-javascript-v3-with-backblaze-b2)

---

## Prerequisites

1. Backblaze account with **B2 Cloud Storage** enabled.
2. A **bucket** (note its **region**, e.g. `us-west-004`).
3. A **non-master application key** with access to that bucket.
4. Endpoint form: `https://s3.<region>.backblazeb2.com` (HTTPS only).

### Master key warning

The S3-Compatible API **cannot use the master application key**. Create an application key in the B2 console (scoped to the bucket / prefixes you need) and use that key ID + key.

---

## Authentication

| B2 concept | S3 / AWS SDK mapping |
| --- | --- |
| keyID | Access Key ID (`B2_KEY_ID` or `AWS_ACCESS_KEY_ID`) |
| applicationKey | Secret Access Key (`B2_APPLICATION_KEY` or `AWS_SECRET_ACCESS_KEY`) |

Requests use **AWS Signature Version 4**. The AWS SDK v3 client handles signing when credentials and region/endpoint are set.

---

## Differences from AWS S3 (operator-relevant)

| Topic | B2 S3-Compatible behavior (summary) |
| --- | --- |
| Endpoint | Region-specific `https://s3.<region>.backblazeb2.com` — not `s3.amazonaws.com` |
| HTTPS | Required; non-TLS connections are rejected |
| Versioning | Object versioning defaults / semantics can differ from AWS — check B2 console |
| ACL | Practical ACL surface is limited; treat **private** and **public-read** as the supported bucket/object ACL values in this scaffold |
| IAM roles | No AWS IAM role assumption — use application keys |
| Object tagging | Not available like AWS S3 object tagging |
| SSE-KMS | AWS SSE-KMS is not the B2 model — use B2/SSE options documented by Backblaze if needed |
| Path vs virtual-hosted | Both URL styles exist; this package defaults `forcePathStyle: true` for broad SDK compatibility |

Always verify against current Backblaze docs when enabling encryption, CORS, or lifecycle rules.

---

## How this repo uses B2

**Declared intent:** operators may store and fetch assets (local render outputs, gallery PNGs, WorldDocument JSON, evidence / inspector bundles) via S3-compatible clients.

| Path | Status |
| --- | --- |
| `@mrs/storage-b2` client + CLI scripts | **Present** (scaffold) |
| Automatic upload from every render | **Not wired** (optional helper only) |
| Gallery / `export_4d_scene` cloud publish | **Declared hook** — see below |
| Cloud rendering marketplace | **Not claimed** |

### Integration hooks (declared)

Optional helper:

```js
import { uploadArtifactIfConfigured } from "@mrs/storage-b2";

const result = await uploadArtifactIfConfigured({
  key: `gallery/${name}.png`,
  body: pngBuffer,
  contentType: "image/png",
});
// result.status: "uploaded" | "skipped" | "error"
```

Suggested call sites (when an operator chooses to wire them):

| Surface | Idea |
| --- | --- |
| `examples/gallery/generate.mjs` | After writing PNGs locally, optionally upload under `gallery/` |
| ChatGPT `export_4d_scene` (`mrs/apps/chatgpt-mrs/server/src/tools/export-asset.ts`) | After ExportManager writes glTF/PNG to temp, optionally upload under `exports/<sceneId>/` |
| Evidence bundles | Upload inspector / HCL artifacts under `evidence/` |

Until those call sites import the helper, uploads remain **manual** via CLI / AWS CLI.

---

## Setup checklist

- [ ] Create Backblaze account; enable B2
- [ ] Create bucket; record **region** and **bucket name**
- [ ] Create **non-master** application key (bucket-scoped)
- [ ] Copy [`.env.example`](../../.env.example) → `.env` (gitignored)
- [ ] Fill `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_REGION`
- [ ] Optionally set `B2_ENDPOINT=https://s3.<region>.backblazeb2.com`
- [ ] `cd mrs && pnpm install` (or `npm install` inside `mrs/packages/storage-b2`)
- [ ] `npm run b2:smoke` from repo root — expect list or configure credentials first
- [ ] Confirm bucket ACL policy matches your intent (`private` vs public-read for public assets)

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `B2_KEY_ID` | yes* | Application Key ID |
| `B2_APPLICATION_KEY` | yes* | Application key secret |
| `B2_BUCKET` | yes | Bucket name |
| `B2_REGION` | yes | e.g. `us-west-004` |
| `B2_ENDPOINT` | no | Defaults to `https://s3.${B2_REGION}.backblazeb2.com` |
| `B2_FORCE_PATH_STYLE` | no | Default `true` |
| `AWS_ACCESS_KEY_ID` | alias | Used if `B2_KEY_ID` unset |
| `AWS_SECRET_ACCESS_KEY` | alias | Used if `B2_APPLICATION_KEY` unset |

\* Or the AWS_* aliases.

Placeholder JSON: [`config/b2.example.json`](../../config/b2.example.json).

---

## Local test — AWS CLI

Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Configure credentials (profile or env) with the B2 key ID / application key.

```bash
# List buckets / objects (replace region)
aws s3 ls --endpoint-url https://s3.<region>.backblazeb2.com

aws s3 ls s3://YOUR_BUCKET --endpoint-url https://s3.<region>.backblazeb2.com

aws s3 cp ./local.png s3://YOUR_BUCKET/renders/local.png --endpoint-url https://s3.<region>.backblazeb2.com
```

Signature Version 4 is the default for modern AWS CLI against custom endpoints.

---

## Local test — npm scripts

From repository root (after installing package deps):

```bash
npm run b2:smoke
# → "skipped: B2 not configured" when .env unset (CI-safe)
# → lists objects when configured

npm run b2:list
npm run b2:upload -- ./path/to/file.png renders/file.png
npm run b2:download -- renders/file.png ./file.png
```

Package-local:

```bash
cd mrs/packages/storage-b2
npm run smoke
```

---

## Security

- Never commit application keys, master keys, or `.env`.
- `.gitignore` already ignores `.env` / `.env.*` (with `!.env.example` allowed).
- Prefer bucket-scoped keys with least privilege.
- HTTPS only for endpoints.

---

## Cross-links

- Start here: [`docs/START_HERE_MRS_30_MIN.md`](../START_HERE_MRS_30_MIN.md)
- Package README: [`mrs/packages/storage-b2/README.md`](../../mrs/packages/storage-b2/README.md)
- Root capability snapshot: [`README.md`](../../README.md)
