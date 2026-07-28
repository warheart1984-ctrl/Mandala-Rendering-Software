#!/usr/bin/env python3
"""CLI: RenderRequest + PrintRequest → digital print (beauty + evidence).

Usage:
  python run_print.py --request fixtures/sample-render-request-cinematic-scene.json \\
      --out-dir ../../../../output/cecp-digital-print --dry-run

  python run_print.py -r request.json --print-request print.json --execute

Does not implement StoryForge Story→PromptSpec. Status: **partial** (HTTP host
discovers this script by printer/ layout, not by adapter name).
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

from printer.errors import PrintError  # noqa: E402
from printer.pipeline import run_digital_print  # noqa: E402
from printer.print_request import normalize_print_request  # noqa: E402
from printer.sovereignty import check_render_request_surfaces  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="MRS Digital Printer CLI")
    p.add_argument("--request", "-r", required=True, help="RenderRequest JSON path")
    p.add_argument(
        "--print-request",
        default=None,
        help="Optional PrintRequest JSON (quality profile / knobs)",
    )
    p.add_argument("--out-dir", required=True, help="Output directory for beauty/evidence")
    p.add_argument(
        "--result",
        default=None,
        help="Write print result JSON to this path (default: <out-dir>/print-result.json)",
    )
    p.add_argument(
        "--execute",
        action="store_true",
        help="Run deep print (Node). Default without flag: dry-run unless --dry-run omitted and EXECUTE=1",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Sovereignty + evidence only (no Node execute)",
    )
    p.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate surfaces only; write validate-result.json",
    )
    args = p.parse_args(argv)

    rr = json.loads(Path(args.request).read_text(encoding="utf-8"))
    print_raw = None
    if args.print_request:
        print_raw = json.loads(Path(args.print_request).read_text(encoding="utf-8"))
    print_req = normalize_print_request(print_raw)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    if args.validate_only:
        try:
            state = check_render_request_surfaces(rr)
            payload = {
                "ok": True,
                "violations": [],
                "printState": state.value,
                "printRequest": print_req,
            }
            code = 0
        except PrintError as exc:
            payload = {
                "ok": False,
                "violations": [exc.to_dict()],
                "printState": exc.state.value,
            }
            code = 2
        result_path = Path(args.result) if args.result else out / "validate-result.json"
        result_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return code

    execute = bool(args.execute) and not args.dry_run
    if execute and "MRS_PRINT_TIMEOUT_SECONDS" not in os.environ:
        # Prefer print-specific timeout; fall back to render timeout if set.
        if "MRS_RENDER_TIMEOUT_SECONDS" in os.environ:
            os.environ["MRS_PRINT_TIMEOUT_SECONDS"] = os.environ["MRS_RENDER_TIMEOUT_SECONDS"]
        else:
            os.environ.setdefault("MRS_PRINT_TIMEOUT_SECONDS", "900")
        # Deep execute path still reads MRS_RENDER_TIMEOUT_SECONDS today.
        os.environ.setdefault(
            "MRS_RENDER_TIMEOUT_SECONDS",
            os.environ["MRS_PRINT_TIMEOUT_SECONDS"],
        )

    try:
        result = run_digital_print(
            rr,
            out_dir=out,
            print_request=print_req,
            execute=execute,
        )
        code = 0
    except PrintError as exc:
        result = {"status": "error", "printState": exc.state.value, "error": exc.to_dict()}
        code = 2

    result_path = Path(args.result) if args.result else out / "print-result.json"
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
