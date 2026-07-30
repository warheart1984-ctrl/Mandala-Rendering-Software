#!/usr/bin/env python3
"""AIKI CLI — scaffold helpers. Status: skeleton.

Usage (from repo root):
  python aiki/pipeline/cli.py new-cko --series "Research Decoded" --title "Example"
  python aiki/pipeline/cli.py replay CKO-0001
  python aiki/pipeline/cli.py test-reproducibility --cko CKO-0001
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_AIKI = Path(__file__).resolve().parents[1]
_REPO = _AIKI.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))
if str(_AIKI) not in sys.path:
    sys.path.insert(0, str(_AIKI))


def _slugify(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "topic"


def cmd_new_cko(args: argparse.Namespace) -> int:
    from pipeline.core.paths import KNOWLEDGE_OBJECTS

    slug = args.slug or _slugify(args.title)
    # Allocate next draft id if not provided
    cko_id = args.id
    if not cko_id:
        existing = list(KNOWLEDGE_OBJECTS.glob("CKO-*.yaml"))
        nums = []
        for p in existing:
            m = re.match(r"CKO-(\d+)", p.stem)
            if m and "MATH" not in p.stem:
                nums.append(int(m.group(1)))
        nxt = (max(nums) + 1) if nums else 1
        cko_id = f"CKO-{nxt:04d}"

    dest = KNOWLEDGE_OBJECTS / f"{cko_id}.yaml"
    if dest.exists() and not args.force:
        print(f"Refusing to overwrite {dest} (use --force)")
        return 1

    body = f"""id: aiki:cko/{cko_id}
cko_id: {cko_id}
series: "{args.series}"
title: "{args.title}"
slug: {slug}
tags: []
evergreen: true
difficulty: intermediate
pedagogy:
  learning_objectives:
    - "TODO: learning objective"
  key_questions:
    - "TODO: key question"
  narrative_arc:
    hook: "TODO: hook"
    sections:
      - id: context
        label: "Context"
formats:
  primary:
    - youtube-video
status:
  lifecycle: draft
  owner: Dar-z
  last_updated: "2026-07-29"
  frozen: false
"""
    dest.write_text(body, encoding="utf-8")
    print(f"Created {dest.relative_to(_REPO)}")
    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    from pipeline.replay.reconstruct import replay_checklist

    result = replay_checklist(args.cko_id)
    print(json.dumps(result, indent=2))
    return 0


def cmd_test_reproducibility(args: argparse.Namespace) -> int:
    if args.cko != "CKO-0001":
        print(f"Only CKO-0001 is wired in v0.1 (got {args.cko})")
        return 1
    import runpy

    path = _AIKI / "pipeline" / "validators" / "reproducibility" / "test_CKO-0001.py"
    ns = runpy.run_path(str(path))
    return int(ns["main"]())


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="aiki", description="AIKI pipeline CLI (skeleton)")
    sub = p.add_subparsers(dest="command", required=True)

    n = sub.add_parser("new-cko", help="Scaffold a new CKO YAML")
    n.add_argument("--series", required=True)
    n.add_argument("--title", required=True)
    n.add_argument("--slug", default=None)
    n.add_argument("--id", default=None, help="CKO id e.g. CKO-0002")
    n.add_argument("--force", action="store_true")
    n.set_defaults(func=cmd_new_cko)

    r = sub.add_parser("replay", help="Semantic replay checklist")
    r.add_argument("cko_id")
    r.set_defaults(func=cmd_replay)

    t = sub.add_parser("test-reproducibility", help="RBC-0001 gate (skeleton)")
    t.add_argument("--cko", required=True)
    t.set_defaults(func=cmd_test_reproducibility)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
