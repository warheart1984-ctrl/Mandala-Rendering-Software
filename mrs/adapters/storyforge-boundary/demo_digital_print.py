#!/usr/bin/env python3
"""Digital print demo — PrintRequest → beauty + evidence under output/cecp-digital-print.

Usage:
  python mrs/adapters/storyforge-boundary/demo_digital_print.py
  python mrs/adapters/storyforge-boundary/demo_digital_print.py --out-dir output/cecp-digital-print

Opt-in print quality (not draft CI). No SF Story→PromptSpec.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_DIR = Path(__file__).resolve().parent
if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from paths import default_output_dir  # noqa: E402
from printer.errors import PrintError  # noqa: E402
from printer.pipeline import run_digital_print  # noqa: E402
from printer.print_request import normalize_print_request  # noqa: E402

FIXTURE = _DIR / "fixtures" / "sample-render-request-cinematic-scene.json"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="MRS Digital Printer demo")
    p.add_argument(
        "--out-dir",
        default=None,
        help="Default: <repo>/output/cecp-digital-print",
    )
    p.add_argument("--width", type=int, default=512)
    p.add_argument("--height", type=int, default=512)
    p.add_argument("--samples", type=int, default=16, help="Print spp (opt-in; CI uses mocks)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--denoise", action="store_true", help="Record denoise request (partial)")
    p.add_argument("--dry-run", action="store_true", help="Sovereignty + evidence only")
    args = p.parse_args(argv)

    out = Path(args.out_dir) if args.out_dir else (default_output_dir() / "cecp-digital-print")
    out.mkdir(parents=True, exist_ok=True)

    if not FIXTURE.is_file():
        print(f"ERROR: missing fixture {FIXTURE}", file=sys.stderr)
        return 2

    rr = json.loads(FIXTURE.read_text(encoding="utf-8"))
    print_req = normalize_print_request(
        {
            "width": args.width,
            "height": args.height,
            "samples": args.samples,
            "seed": args.seed,
            "denoise": bool(args.denoise),
            "tone_mapper": "aces-lite",
            "adaptiveSampling": True,
            "aovs": ["beauty"],
        }
    )

    if not args.dry_run and "MRS_RENDER_TIMEOUT_SECONDS" not in os.environ:
        os.environ["MRS_RENDER_TIMEOUT_SECONDS"] = "900"

    try:
        result = run_digital_print(
            rr,
            out_dir=out,
            print_request=print_req,
            execute=not args.dry_run,
        )
    except PrintError as exc:
        err_path = out / "print-error.json"
        err_path.write_text(json.dumps(exc.to_dict(), indent=2) + "\n", encoding="utf-8")
        print(f"PRINT FAILED: {exc}")
        print(f"error: {err_path.resolve()}")
        return 1

    (out / "print-result.json").write_text(
        json.dumps(
            {
                "printState": result.get("printState"),
                "status": result.get("status"),
                "contract": result.get("contract"),
                "printStages": result.get("printStages"),
                "pngs": result.get("pngs"),
                "evidencePath": (result.get("evidence") or {}).get("evidencePath"),
                "beautySha256": (result.get("evidence") or {}).get("beautySha256"),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print("=== MRS Digital Print ===")
    print(f"printState: {result.get('printState')}")
    print(f"outDir: {out.resolve()}")
    print(f"contract: {result.get('contract')}")
    for path in result.get("pngs") or []:
        print(f"PNG: {path}")
    ev = result.get("evidence") or {}
    if ev.get("evidencePath"):
        print(f"evidence: {ev['evidencePath']}")
    if ev.get("beautySha256"):
        print(f"beautySha256: {ev['beautySha256']}")
    print("stages:", json.dumps(result.get("printStages") or ev.get("printStages"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
