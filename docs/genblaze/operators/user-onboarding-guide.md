# Genblaze User Onboarding Guide

**Artifact:** \docs/genblaze/operators/user-onboarding-guide.md\  
**Status:** Operational · **partial** UI labels match the static SPA  
**Host UI:** \mrs/apps/genblaze-media/app/static/index.html\ (not React)  
**BYOK charter:** \docs/genblaze/security/byok-security-charter.md\  
**Trail:** \docs/governance/cecp/trails/genblaze-byok-session-2026-07/
## Welcome to Genblaze

Genblaze is a local-first creative engine that connects your machine to NIM/FLUX models for stills, lookdev, face creation, and SceneSpec generation — while keeping secrets local and preserving RT4D constitutional print sovereignty.

This guide walks new users through setup, BYOK, model selection, generation, and safe usage.

## Step 1 — Launch Genblaze

Open Genblaze locally (recommended) or through a hosted deployment (BYOK disabled unless \GENBLAZE_ALLOW_BYOK=1\).

Local typical URL: \http://127.0.0.1:8787/\ (see app README).

## Step 2 — Open Settings · Local BYOK

On the static SPA, scroll to **Settings · Local BYOK** (\#byok-settings\).

You should see:

- API Key (local-only)
- Model ID (override)
- Model catalog (datalist / marketplace section)
- BYOK diagnostics
- Compliance badge (honest capability disclosure from \/health\)

## Step 3 — Enter Your API Key

Paste your NIM/FLUX API key into the password field and **Save to session**.

Your key:

- Lives only in the browser tab (\sessionStorage\)
- Is sent only as request headers to the Genblaze process when you generate
- Must never enter logs, disk, B2, Git, or Digital Printer evidence SoT
- Disappears when the tab closes

This is the constitutional BYOK guarantee (see charter + trail).

## Step 4 — Choose a Model

Select or type a model id (examples):

- \lack-forest-labs/flux.1-schnell- \lack-forest-labs/flux.1-dev- \lack-forest-labs/flux.1-pro
Paid/NIM access depends on **your** key. Model override is session-only (\X-Genblaze-Model\).

## Step 5 — Generate

Use **Stills · NIM FLUX or RT4D**. Scope for BYOK: **stills + assist** (not video/polish).

## Step 6 — Read diagnostics honestly

\/health.byok\ reports permitted flag, hosted detection, and \printSoT: false\.  
Capability Registry Browser lists backends from \/health\ — labels are disclosure, not a claim that every backend is live on this deploy.

## Safety

- Prefer loopback Genblaze
- Hosted BYOK requires operator flag and accepts XSS risk
- NIM/FLUX beauty is **assist-only** — never print SoT
- CPU RT4D / Digital Printer remain sovereign print paths

## Related

- Operator handbook: \docs/genblaze/operators/operator-handbook.md- Operator training: \docs/genblaze/operators/operator-training-manual.md