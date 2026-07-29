"""IDAC Performance Evidence harness (multi-sample optional)."""

from __future__ import annotations

import json
import os
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

DIRECTOR_BASE = os.getenv("IDAC_PERF_DIRECTOR_BASE", "http://127.0.0.1:8791").rstrip("/")
RECORD = os.getenv("IDAC_PERF_RECORD", "").strip().lower() in {"1", "true", "yes"}
SLO_CHECK = os.getenv("IDAC_PERF_SLO", "").strip().lower() in {"1", "true", "yes"}
PERF_OUT = (os.getenv("IDAC_PERF_OUT") or "").strip()
SAMPLES = max(1, int(os.getenv("IDAC_PERF_SAMPLES", "5") or "5"))

# Provisional local reference bar (Cycle 7) — not a product SLO claim
PROVISIONAL_PLAN_P95_SECONDS = float(os.getenv("IDAC_PERF_PLAN_P95_MAX", "1.0") or "1.0")
PROVISIONAL_DIRECT_P95_SECONDS = float(os.getenv("IDAC_PERF_DIRECT_P95_MAX", "30.0") or "30.0")
CYCLE_TAG = os.getenv("IDAC_PERF_CYCLE", "7")


def _genblaze_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/health", timeout=4):
            return True
    except OSError:
        return False


def _post(path: str, body: dict, timeout: float = 180.0) -> tuple[float, int, bytes]:
    started = time.perf_counter()
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{DIRECTOR_BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            elapsed = time.perf_counter() - started
            return elapsed, resp.status, payload
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - started
        return elapsed, e.code, e.read()


def _summarize(samples: list[float]) -> dict:
    ordered = sorted(samples)
    n = len(ordered)

    def pct(p: float) -> float:
        idx = min(n - 1, max(0, int(round(p * (n - 1)))))
        return round(ordered[idx], 4)

    return {
        "n": n,
        "min": round(ordered[0], 4),
        "median": round(statistics.median(ordered), 4),
        "max": round(ordered[-1], 4),
        "p50": pct(0.50),
        "p95": pct(0.95),
    }


def _emit(sample: dict) -> None:
    line = json.dumps(sample, ensure_ascii=False)
    print(line)
    if PERF_OUT:
        out = Path(PERF_OUT)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


@pytest.mark.skipif(not RECORD, reason="Set IDAC_PERF_RECORD=1 to collect Performance Evidence")
@pytest.mark.skipif(not _genblaze_up(), reason="Genblaze :8787 not reachable")
class TestPerformanceEvidenceL3:
    def test_atcm_plan_multi_sample(self):
        times: list[float] = []
        for i in range(SAMPLES):
            elapsed, status, _ = _post(
                "/api/atcm/plan",
                {"width": 256, "height": 256, "prompt": "empty sky wall flat", "include_tiles": False},
                timeout=60.0,
            )
            assert status == 200
            times.append(elapsed)
            _emit(
                {
                    "evidence_class": "Performance",
                    "cycle": CYCLE_TAG,
                    "operation": "POST /api/atcm/plan",
                    "sample_index": i,
                    "wall_clock_seconds": round(elapsed, 4),
                    "director_base": DIRECTOR_BASE,
                },
            )
        summary = {"kind": "summary", "operation": "POST /api/atcm/plan", "stats": _summarize(times)}
        _emit(summary)
        print(json.dumps(summary, indent=2))

    def test_direct_atcm_multi_sample(self):
        times: list[float] = []
        for i in range(SAMPLES):
            elapsed, status, payload = _post(
                "/api/direct",
                {
                    "prompt": "empty sky wall flat mesh structure",
                    "speed_profile": "atcm",
                    "mode": "engine3d_still",
                },
                timeout=180.0,
            )
            assert status == 200
            times.append(elapsed)
            body = json.loads(payload.decode())
            _emit(
                {
                    "evidence_class": "Performance",
                    "cycle": CYCLE_TAG,
                    "operation": "POST /api/direct speed_profile=atcm",
                    "sample_index": i,
                    "wall_clock_seconds": round(elapsed, 4),
                    "idac_verdict": ((body.get("idac") or {}).get("validation") or {}).get("verdict"),
                },
            )
        summary = {"kind": "summary", "operation": "POST /api/direct speed_profile=atcm", "stats": _summarize(times)}
        _emit(summary)
        print(json.dumps(summary, indent=2))


@pytest.mark.skipif(not SLO_CHECK, reason="Set IDAC_PERF_SLO=1 for provisional Performance bar (optional CI)")
@pytest.mark.skipif(not _genblaze_up(), reason="Genblaze :8787 not reachable")
class TestPerformanceProvisionalSLO:
    """C-10 soft thresholds — may flake on cold spin-up; document in trail."""

    def test_atcm_plan_provisional_p95(self):
        times: list[float] = []
        for _ in range(SAMPLES):
            elapsed, status, _ = _post(
                "/api/atcm/plan",
                {"width": 256, "height": 256, "prompt": "empty sky wall flat", "include_tiles": False},
                timeout=60.0,
            )
            assert status == 200
            times.append(elapsed)
        stats = _summarize(times)
        assert stats["p95"] <= PROVISIONAL_PLAN_P95_SECONDS, stats

    def test_direct_atcm_provisional_p95(self):
        times: list[float] = []
        for _ in range(SAMPLES):
            elapsed, status, _ = _post(
                "/api/direct",
                {
                    "prompt": "empty sky wall flat mesh structure",
                    "speed_profile": "atcm",
                    "mode": "engine3d_still",
                },
                timeout=180.0,
            )
            assert status == 200
            times.append(elapsed)
        stats = _summarize(times)
        assert stats["p95"] <= PROVISIONAL_DIRECT_P95_SECONDS, stats


@pytest.mark.xfail(reason="Performance Evidence: no measured speedup bar — W-TILE-FAITHFUL")
class TestPerformanceDeclaredGaps:
    def test_no_estimated_speedup_as_performance_evidence(self):
        pytest.fail("Use harness wall-clock only; ATCM work_model is not Performance Evidence")


class TestConformanceDeclaredGaps:
    def test_mrs_ckl_still_out_of_scope(self):
        """IDAC-local charter gate clears Director scope; MRS CKL waiver W-CKL-CHARTER-MRS remains."""
        from app.idac.core.charter_gate import charter_gate_status

        status = charter_gate_status()
        assert status["loaded"] is True
        assert status["mrs_ckl_binding"] == "out_of_scope"
