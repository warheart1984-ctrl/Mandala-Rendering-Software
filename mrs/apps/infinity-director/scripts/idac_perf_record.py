#!/usr/bin/env python3
"""Multi-sample IDAC Performance Evidence recorder (wall-clock only)."""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def _post(base: str, path: str, body: dict, timeout: float) -> tuple[float, int]:
    started = time.perf_counter()
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp.read()
            return time.perf_counter() - started, resp.status
    except urllib.error.HTTPError as e:
        return time.perf_counter() - started, e.code


def _summarize(samples: list[float]) -> dict:
    if not samples:
        return {}
    ordered = sorted(samples)
    n = len(ordered)

    def pct(p: float) -> float:
        idx = min(n - 1, max(0, int(round(p * (n - 1)))))
        return ordered[idx]

    return {
        "n": n,
        "min": round(ordered[0], 4),
        "median": round(statistics.median(ordered), 4),
        "max": round(ordered[-1], 4),
        "p50": round(pct(0.50), 4),
        "p95": round(pct(0.95), 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--director", default=os.getenv("IDAC_PERF_DIRECTOR_BASE", "http://127.0.0.1:8791"))
    parser.add_argument("--samples", type=int, default=int(os.getenv("IDAC_PERF_SAMPLES", "5")))
    parser.add_argument(
        "--out",
        default=os.getenv(
            "IDAC_PERF_OUT",
            "docs/governance/cecp/trails/idac-stack-2026-07/cycle6-performance-samples.jsonl",
        ),
    )
    args = parser.parse_args()
    if args.samples < 1:
        print("samples must be >= 1", file=sys.stderr)
        return 2

    meta = {
        "evidence_class": "Performance",
        "cycle": "6",
        "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "director_base": args.director,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "note": "Wall-clock only; not ATCM work-unit speedup; not certification",
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    plan_times: list[float] = []
    direct_times: list[float] = []
    with out_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"kind": "run_meta", **meta}) + "\n")
        for i in range(args.samples):
            elapsed, status = _post(
                args.director,
                "/api/atcm/plan",
                {"width": 256, "height": 256, "prompt": "empty sky wall flat", "include_tiles": False},
                timeout=60.0,
            )
            if status != 200:
                print(f"atcm/plan sample {i} HTTP {status}", file=sys.stderr)
                return 1
            plan_times.append(elapsed)
            row = {
                **meta,
                "operation": "POST /api/atcm/plan",
                "sample_index": i,
                "wall_clock_seconds": round(elapsed, 4),
            }
            handle.write(json.dumps(row) + "\n")

        for i in range(args.samples):
            elapsed, status = _post(
                args.director,
                "/api/direct",
                {
                    "prompt": "empty sky wall flat mesh structure",
                    "speed_profile": "atcm",
                    "mode": "engine3d_still",
                },
                timeout=180.0,
            )
            if status != 200:
                print(f"direct atcm sample {i} HTTP {status}", file=sys.stderr)
                return 1
            direct_times.append(elapsed)
            row = {
                **meta,
                "operation": "POST /api/direct speed_profile=atcm",
                "sample_index": i,
                "wall_clock_seconds": round(elapsed, 4),
            }
            handle.write(json.dumps(row) + "\n")

        summary = {
            "kind": "run_summary",
            **meta,
            "atcm_plan": _summarize(plan_times),
            "direct_atcm": _summarize(direct_times),
        }
        handle.write(json.dumps(summary) + "\n")
        print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
