#!/usr/bin/env python3
"""Direct NVIDIA FLUX.1-schnell smoke (Python httpx). Never prints the API key."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[4]
load_dotenv(ROOT / ".env", override=True)

KEY = (
    os.getenv("NVIDIA_API_KEY")
    or os.getenv("NVIDIA_NIM_API_KEY")
    or os.getenv("NGC_API_KEY")
    or ""
).strip()
if not KEY:
    print("NVIDIA_API_KEY missing", file=sys.stderr)
    sys.exit(1)

URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell"
prompt = sys.argv[1] if len(sys.argv) > 1 else "a simple coffee shop interior"
payload = {
    "prompt": prompt,
    "width": 512,
    "height": 512,
    "seed": 0,  # NVIDIA sample leaves seed empty — that is invalid JSON
    "steps": 4,
}

try:
    r = httpx.post(
        URL,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=600.0,
    )
except httpx.TimeoutException as exc:
    print(f"flux_timeout {exc}", file=sys.stderr)
    sys.exit(1)

print("http", r.status_code)
if not r.is_success:
    print(r.text[:400], file=sys.stderr)
    sys.exit(1)

body = r.json()
print("flux_ok keys", ",".join(body.keys()))
img = body.get("image")
if isinstance(img, str):
    print("image_b64_len", len(img))
