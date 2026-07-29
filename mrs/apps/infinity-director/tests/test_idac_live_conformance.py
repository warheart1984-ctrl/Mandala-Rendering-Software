"""L1 live dispatch — Operational + Verification Evidence (optional)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import pytest

DIRECTOR = os.getenv("IDAC_LIVE_DIRECTOR_BASE", "http://127.0.0.1:8791").rstrip("/")
GENBLAZE = os.getenv("IDAC_LIVE_GENBLAZE_BASE", "http://127.0.0.1:8787").rstrip("/")
LIVE = os.getenv("IDAC_LIVE_GENBLAZE", "").strip().lower() in {"1", "true", "yes"}
AUTO = os.getenv("IDAC_LIVE_AUTO", "").strip().lower() in {"1", "true", "yes"}


def _reachable(url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/health", timeout=5):
            return True
    except OSError:
        return False


def _live_enabled() -> bool:
    if LIVE:
        return True
    if os.getenv("IDAC_LIVE_GENBLAZE", "").strip().lower() in {"0", "false", "no"}:
        return False
    return AUTO and _reachable(GENBLAZE) and _reachable(DIRECTOR)


@pytest.mark.skipif(not _live_enabled(), reason="Set IDAC_LIVE_GENBLAZE=1 or IDAC_LIVE_AUTO=1 with services up")
class TestLiveDispatchL1:
    def test_direct_atcm_live_dispatch(self):
        if not _reachable(GENBLAZE):
            pytest.skip("Genblaze down — cannot produce live dispatch Operational Evidence")
        if not _reachable(DIRECTOR):
            pytest.skip("Director down — cannot produce live dispatch Operational Evidence")

        body = {
            "prompt": "empty sky wall flat mesh structure",
            "speed_profile": "atcm",
            "mode": "engine3d_still",
        }
        req = urllib.request.Request(
            f"{DIRECTOR}/api/direct",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            pytest.fail(f"live dispatch failed: HTTP {exc.code}")

        assert payload.get("lane") == "engine3d_still"
        assert (payload.get("idac") or {}).get("validation", {}).get("verdict") == "pass"
        run_id = ((payload.get("result") or {}).get("structure") or {}).get("run_id")
        assert run_id, "expected Genblaze run_id in live Operational Evidence"
