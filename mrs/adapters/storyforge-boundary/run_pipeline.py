#!/usr/bin/env python3
"""CLI: RenderRequest JSON → MRS route → RenderResult (optional PNG).

Usage:
  python run_pipeline.py --request fixtures/sample-render-request.json \\
      --execute --out-dir ../../../../output

  MRS_RENDER_REQUEST_EXECUTE=1 python run_pipeline.py -r request.json

Does not implement StoryForge Story→PromptSpec. Status: **partial**.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_DIR = Path(__file__).resolve().parent
if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from route import route_render_request  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="StoryForge Runtime crossing: RenderRequest → RenderResult"
    )
    p.add_argument(
        "--request",
        "-r",
        required=True,
        help="Path to RenderRequest JSON",
    )
    p.add_argument(
        "--execute",
        action="store_true",
        help="Run deep MRS Node paths (PNG). Default: echo/skeleton only",
    )
    p.add_argument(
        "--out-dir",
        default=None,
        help="Output directory for PNG/artifacts (default: repo output/)",
    )
    p.add_argument(
        "--result",
        default=None,
        help="Write RenderResult JSON to this path (default: stdout only)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print RenderResult JSON to stdout",
    )
    args = p.parse_args(argv)

    raw = json.loads(Path(args.request).read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir) if args.out_dir else None
    result = route_render_request(
        raw,
        execute=True if args.execute else None,
        out_dir=out_dir,
    )

    text = json.dumps(result, indent=2) + "\n"
    if args.result:
        Path(args.result).parent.mkdir(parents=True, exist_ok=True)
        Path(args.result).write_text(text, encoding="utf-8")
    if args.json or not args.result:
        sys.stdout.write(text)

    if result.get("status") == "ok":
        return 0
    if result.get("status") == "refused":
        return 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
