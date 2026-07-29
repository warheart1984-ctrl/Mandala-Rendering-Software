#!/usr/bin/env python3
"""IDAC route gate — Operational Evidence probe (exit 0 when routes non-404)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.idac.ops_gate import route_gate, service_health


def main() -> int:
    parser = argparse.ArgumentParser(description="IDAC Director route gate")
    parser.add_argument("--director", default="http://127.0.0.1:8791")
    parser.add_argument("--genblaze", default="http://127.0.0.1:8787")
    args = parser.parse_args()

    gb_ok, gb_svc = service_health(args.genblaze)
    dr_ok, dr_svc = service_health(args.director)
    report = {
        "genblaze": {"reachable": gb_ok, "service": gb_svc},
        "director": {"reachable": dr_ok, "service": dr_svc},
        "route_gate": route_gate(args.director),
    }
    print(json.dumps(report, indent=2))
    if not dr_ok:
        return 2
    return 0 if report["route_gate"]["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
