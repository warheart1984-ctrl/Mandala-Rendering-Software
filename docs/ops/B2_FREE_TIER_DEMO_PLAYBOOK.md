# B2 free-tier demo playbook (Class C triage)

| Field | Value |
| --- | --- |
| Status (Drive-G-1) | **Operator runbook** — cites Backblaze docs + this repo’s Genblaze health path |
| Audience | Mandala / Genblaze operators on Backblaze B2 **free allotments / data caps** |
| Not claimed | Exact dollar pricing beyond what Backblaze publishes; “unlimited free forever” |

**Evidence snapshot (operator console, same calendar day as triage):** Daily Storage and Download under allotment; Class B low; **Class C already over the console’s daily max** (example: 2,580 / 2,500). Storage/download were not the blocker — **list/management-style API calls were**.

---

## What Class B vs Class C mean (Backblaze)

Cite: [B2 transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing), [Data caps and alerts](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts).

| Class | Backblaze summary | S3-compatible examples (from Backblaze pricing page) |
| --- | --- | --- |
| **A** | Uploads / writes | `PutObject`, `DeleteObject`, multipart upload APIs |
| **B** | Downloads / object reads | `GetObject`, **`HeadObject`** |
| **C** | Listing + bucket/key management | **`ListObjects` / `ListObjectsV2`**, **`HeadBucket`**, `ListBuckets`, copy/ACL helpers; native `b2_list_file_*`, `b2_authorize_account`, … |

**Operator caution:** do **not** treat `HeadObject` as Class C — Backblaze lists it under **Class B**. What burns **Class C** in practice here is **listing** and **bucket-level** probes (`ListObjects*`, `HeadBucket`, console/CLI `ls` loops), not downloading a JPEG once.

**Caps / reset (documented):** Backblaze states usage counters for data caps **reset daily at 12:00 AM GMT**. Confirm the live counter reset in **your** B2 Caps & Alerts UI before spending live generates — do not assume local timezone midnight.

**Pricing wording:** Backblaze’s transaction page labels Class A/B/C as free for listed call types in the developer table; free allotments and **operator-set data caps** (e.g. “2,500 max per day” in the caps UI) are what block $0 accounts. Prefer the **console counters** over memorized dollar rates.

---

## What burns Class C in *this* stack

Paths verified in `mrs/apps/genblaze-media` (code evidence):

| Burner | Mechanism | Class |
| --- | --- | --- |
| **`GET /health` B2 probe** | `probe_b2()` → `backend.list(prefix=…, max_keys=5)` → **ListObjects** | **C** |
| **Render `healthCheckPath: /health`** | Free web service repeatedly hits `/health` (see `render.yaml`) | **C** when probe enabled |
| **Dashboard UI load** | `index.html` `fetch("/health")` on every page open | **C** when probe enabled |
| **`npm run b2:list` / AWS CLI `s3 ls` / B2 console browse refresh** | List APIs | **C** |
| **Genblaze transfer path** | Uploads are Class **A** (free per Backblaze upload note); lazy **`HeadBucket`** preflight is Class **C** if not skipped — this app sets `preflight=False` and marks region verified when `B2_REGION` is set | **C** only if HeadBucket still runs |
| **Live `POST /api/generate`** | PutObject (A) + later GetObject/presigned download (B); quality-check download is Get/Head-class **B**, not list **C** | Prefer **one** warm generate, then reuse |
| **Repeated generates / blank reject cleanup** | Extra Put + best-effort Delete (A) — usually not Class C, but wastes NVIDIA quota and time | Avoid spam |

**Code gate (this change):** env **`B2_PROBE_ON_HEALTH`** — default **off** (`0` / unset). When off, `/health` still reports `b2_configured`, bucket, region, NVIDIA flags, and sets `b2_probe_skipped: true` **without** calling ListObjects. Set `B2_PROBE_ON_HEALTH=1` only while debugging credentials.

---

## YouTube demo day checklist

### Before recording (today / overnight)

1. **Stop spending Class C now** if the console already shows over the daily max.
2. Deploy or set **`B2_PROBE_ON_HEALTH=0`** on Render (blueprint default after this PR) and locally.
3. Prefer **local dry-run**, **already-generated stills**, or a **screen recording of cached assets** over live Generate spam.
4. If you need one live shot: wait until Class C counters **reset** (Backblaze: **12:00 AM GMT**; **confirm in B2 console**), then do **one warm generate early**, save the presigned URL / download the file locally, and **reuse that media** for the rest of the video.
5. Close the B2 web console; do not refresh object listings in a loop.
6. Do not run `aws s3 ls`, `npm run b2:list`, or `b2 ls` “just to check.”

### During recording

| Do | Don’t |
| --- | --- |
| Show UI + pre-cached / local stills | Mash Generate repeatedly |
| Hit `/health` only if needed (probe off → no list) | Leave Render hammering probe-on health overnight |
| Reuse one presigned GET / local file | Open B2 console and refresh folders |
| Narrate provenance / SHA-256 from a prior run | Spam CLI list / smoke scripts mid-take |
| Keep Class B downloads minimal but they are **not** today’s Class C fire | Assume HeadObject is Class C |

### After Class C resets (confirm in console)

1. One credential sanity check if needed: temporary `B2_PROBE_ON_HEALTH=1`, single `/health`, then set back to `0`.
2. One `POST /api/generate` (or UI Generate once).
3. Download / screenshot / record from that asset; turn off further live B2 list activity.

---

## Should you avoid ALL live B2 until counters reset?

**Avoid Class C activity until reset** — yes: no list probes, no console browse loops, no CLI `ls`, keep `B2_PROBE_ON_HEALTH=0`.

**Avoid all B2 entirely?** Prefer yes for a $0 account that is already over the Class C cap UI limit: even uploads (Class A) may still involve session/auth or accidental lists depending on tooling. Safest demo path is **local / pre-cached media**. After reset, **one** generate + reuse is the max-bang plan — not continuous live traffic.

---

## Operator env (demo-safe)

```bash
B2_PROBE_ON_HEALTH=0
# Optional offline UI/API smoke without NVIDIA/B2:
# GENBLAZE_DRY_RUN=1
```

Render: set the same env var (see `mrs/apps/genblaze-media/render.yaml`). Redeploy after changing it.

---

## Cross-links

- Operator B2 setup: [`BACKBLAZE_B2_S3.md`](./BACKBLAZE_B2_S3.md)
- App README: [`mrs/apps/genblaze-media/README.md`](../../mrs/apps/genblaze-media/README.md)
- Health probe implementation: `mrs/apps/genblaze-media/app/main.py`, `pipeline.probe_b2`
- Backblaze: [transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing), [data caps](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts)
