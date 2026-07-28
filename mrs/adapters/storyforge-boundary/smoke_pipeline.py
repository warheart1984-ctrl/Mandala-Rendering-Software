#!/usr/bin/env python3
"""Smoke: RenderRequest → execute scene-spec → PNG under output/.

Writes:
  output/storyforge-pipeline-smoke.png (or copy from artifact)
  output/storyforge-pipeline-smoke.result.json

Exit 0 on ok + PNG; non-zero on failure. Documents Docker Desktop blockers
in stderr if node/scripts missing.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

_DIR = Path(__file__).resolve().parent
if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from paths import default_output_dir  # noqa: E402
from route import route_render_request  # noqa: E402

FIXTURE = _DIR / "fixtures" / "sample-render-request-executable.json"


def main() -> int:
    out = default_output_dir()
    out.mkdir(parents=True, exist_ok=True)
    if not FIXTURE.is_file():
        sys.stderr.write(f"missing fixture: {FIXTURE}\n")
        return 1

    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = route_render_request(raw, execute=True, out_dir=out)

    result_path = out / "storyforge-pipeline-smoke.result.json"
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if result.get("status") != "ok":
        sys.stderr.write(
            f"smoke failed: {result.get('status')} "
            f"{result.get('error')}\n"
            "If Docker Desktop is down, Dockerfile still COPYs adapters; "
            "run this smoke on the host with Node 18+.\n"
        )
        return 1

    arts = result.get("artifacts") or []
    png_art = next((a for a in arts if a.get("role") == "beauty-png"), None)
    if not png_art or not png_art.get("uri"):
        sys.stderr.write("smoke ok but no beauty-png artifact\n")
        return 1

    src = Path(png_art["uri"])
    dest = out / "storyforge-pipeline-smoke.png"
    if src.is_file():
        shutil.copy2(src, dest)
    else:
        sys.stderr.write(f"PNG missing at {src}\n")
        return 1

    sys.stdout.write(
        json.dumps(
            {
                "ok": True,
                "png": str(dest.as_posix()),
                "sha256": png_art.get("sha256"),
                "result": str(result_path.as_posix()),
            },
            indent=2,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
