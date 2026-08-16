"""CPC-v1.0 sweeper: scheduled constitutional pruning of adaptive substrate.

Declared scaffold. Reads a schedule file, scans volume roots, builds Substrate
Lifecycle Records (SLR), classifies tiers, and -- in apply mode only -- deletes
artifacts that satisfy all three CPC proofs. Never deletes in dry-run.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEME = "CPC-v1.0"

FAIL_LOUD = {
    "NO_SLR": "artifact has no Substrate Lifecycle Record",
    "LIVE_EVIDENCE_LINK": "artifact is still referenced by evidence/replay",
    "NO_JUSTIFICATION_PATH": "no surviving justification path found",
    "NO_REPLAYABLE_STATE": "no canonical replay chain covers this artifact",
    "UNSCHEDULED_PRUNE": "prune not driven by the scheduled job",
    "PRUNE_SIGNATURE_MISSING": "prune record has no signature",
}


@dataclass
class SLR:
    origin: str
    epoch: str
    use_count: int = 0
    evidence_link: bool = False
    mtime_unix: float = 0.0
    size: int = 0


@dataclass
class Candidate:
    path: Path
    volume: str
    slr: SLR
    tier: str
    refusals: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "volume": self.volume,
            "tier": self.tier,
            "slr": {
                "origin": self.slr.origin,
                "epoch": self.slr.epoch,
                "use_count": self.slr.use_count,
                "evidence_link": self.slr.evidence_link,
                "mtime_unix": self.slr.mtime_unix,
                "size": self.slr.size,
            },
            "refusals": self.refusals,
        }


def _now_unix() -> float:
    return datetime.now(timezone.utc).timestamp()


def _epoch_label(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m")


def _load_schedule(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"schedule not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        schedule = json.load(fh)
    if schedule.get("contract") != SCHEME:
        raise SystemExit(f"schedule is not a {SCHEME} schedule")
    return schedule


def _matches(rel_path: str, patterns: list[str], *, is_dir: bool = False) -> bool:
    for pattern in patterns:
        if fnmatch.fnmatch(rel_path, pattern) or fnmatch.fnmatch(rel_path, "**/" + pattern):
            return True
        # Directory candidates: __pycache__ / .pytest_cache / .cache match by
        # their name (the pattern has no slash and names the dir itself).
        if is_dir and "/" not in pattern and pattern in rel_path.split("/"):
            return True
    return False


def _slr_for(path: Path, repo_root: Path) -> SLR:
    """Build a substrate lifecycle record from filesystem evidence.

    declared: use-count is derived from mtime (last write) and, in later
    versions, from read-event logs. evidence_link is only set when a reference
    exists in an evidence/replay index (this scaffold scans text markers).
    """
    try:
        st = path.stat()
    except OSError:
        st = None
    mtime = st.st_mtime if st else 0.0
    size = st.st_size if st else 0
    origin = "unknown"
    try:
        rel = path.relative_to(repo_root)
        parts = [p for p in rel.parts if p]
        if len(parts) >= 2:
            origin = parts[-2]
    except ValueError:
        pass
    return SLR(
        origin=origin,
        epoch=_epoch_label(mtime),
        use_count=0,
        evidence_link=False,
        mtime_unix=mtime,
        size=size,
    )


def _classify(slr: SLR, schedule: dict[str, Any], now: float) -> tuple[str, list[str]]:
    windows = schedule.get("epoch_windows", {})
    hot_days = float(windows.get("hot_days", 7))
    warm_days = float(windows.get("warm_days", 30))
    days_old = (now - slr.mtime_unix) / 86400.0 if slr.mtime_unix else float("inf")

    if days_old <= hot_days:
        return "hot", []
    if days_old <= warm_days:
        return "warm", []

    refusals: list[str] = []
    if slr.evidence_link:
        refusals.append(FAIL_LOUD["LIVE_EVIDENCE_LINK"])
    # declared: without a real evidence/replay index, no justification path
    # exists yet, so anything cold is refused -- this is fail-loud by design.
    refusals.append(FAIL_LOUD["NO_JUSTIFICATION_PATH"])
    refusals.append(FAIL_LOUD["NO_REPLAYABLE_STATE"])
    return "cold", refusals


def _sign(record: dict[str, Any]) -> str:
    payload = json.dumps(record, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _summarize(
    candidates: list[Candidate], refused: list[dict[str, Any]], pruned: list[dict[str, Any]]
) -> dict[str, Any]:
    summary: dict[str, Any] = {"tiers": {}, "refusals": {}, "volumes": {}, "total_bytes": 0}
    for cand in candidates:
        summary["tiers"][cand.tier] = summary["tiers"].get(cand.tier, 0) + 1
        summary["volumes"][cand.volume] = summary["volumes"].get(cand.volume, 0) + 1
        summary["total_bytes"] += cand.slr.size
    for refusal in refused:
        for reason in refusal.get("refusals", []):
            summary["refusals"][reason] = summary["refusals"].get(reason, 0) + 1
    for record in pruned:
        summary["tiers"][record["tier"]] = summary["tiers"].get(record["tier"], 0) + 1
    return summary


def scan(
    repo_root: Path,
    schedule: dict[str, Any],
    *,
    limit: int | None = None,
) -> tuple[list[Candidate], list[dict[str, Any]]]:
    now = _now_unix()
    candidates: list[Candidate] = []
    errors: list[dict[str, Any]] = []
    count = 0
    exclude = set(schedule.get("exclude_dirs", []))

    def _excluded(rel: str) -> bool:
        parts = rel.replace(os.sep, "/").split("/")
        for part in parts:
            if part in exclude:
                return True
        joined = "/".join(parts)
        return any(joined.startswith(p.rstrip("/")) for p in exclude if "/" in p)

    for volume in schedule.get("volumes", []):
        roots = [r for r in volume.get("roots", []) if r]
        # Empty roots = repo-wide scan; patterns match anywhere.
        bases = [repo_root] if not roots else [repo_root / r for r in roots]
        for base in bases:
            if not base.exists():
                continue
            for dirpath, dirnames, filenames in os.walk(base):
                # Prune excluded subtrees so we never descend into node_modules
                # / .venv / cdk.out / onnxruntime trees at all.
                kept: list[str] = []
                for d in dirnames:
                    child = os.path.join(dirpath, d)
                    try:
                        rel = str(Path(child).relative_to(repo_root)).replace(os.sep, "/")
                    except ValueError:
                        rel = ""
                    if _excluded(rel):
                        continue
                    kept.append(d)
                dirnames[:] = kept

                def _rel(abspath: str) -> str:
                    try:
                        return str(Path(abspath).relative_to(repo_root)).replace(os.sep, "/")
                    except ValueError:
                        return ""

                for name in filenames:
                    path = Path(os.path.join(dirpath, name))
                    rel = _rel(str(path))
                    if _excluded(rel):
                        continue
                    if not _matches(rel, volume.get("patterns", []), is_dir=False):
                        continue
                    slr = _slr_for(path, repo_root)
                    tier, refusals = _classify(slr, schedule, now)
                    candidates.append(
                        Candidate(path=path, volume=volume.get("name", "?"), slr=slr, tier=tier, refusals=refusals)
                    )
                    count += 1
                    if limit is not None and count >= limit:
                        return candidates, errors

                for d in kept:
                    path = Path(os.path.join(dirpath, d))
                    rel = _rel(str(path))
                    if not _matches(rel, volume.get("patterns", []), is_dir=True):
                        continue
                    slr = _slr_for(path, repo_root)
                    slr.size = sum(
                        f.stat().st_size for f in path.rglob("*") if f.is_file()
                    ) if path.exists() else 0
                    tier, refusals = _classify(slr, schedule, now)
                    candidates.append(
                        Candidate(path=path, volume=volume.get("name", "?"), slr=slr, tier=tier, refusals=refusals)
                    )
                    count += 1
                    if limit is not None and count >= limit:
                        return candidates, errors
    return candidates, errors


def sweep(repo_root: Path, schedule_path: Path, *, dry_run: bool, limit: int | None, out_dir: Path | None) -> dict[str, Any]:
    schedule = _load_schedule(schedule_path)
    candidates, errors = scan(repo_root, schedule, limit=limit)

    pruned: list[dict[str, Any]] = []
    refused: list[dict[str, Any]] = []

    for cand in candidates:
        if cand.tier != "cold" or cand.refusals:
            refused.append(cand.to_dict())
            continue

        # No candidate reaches here in the declared scaffold (cold is always
        # refused until an evidence/replay index exists). The apply path is
        # therefore structurally safe today.
        record = {
            "scheme": SCHEME,
            "epoch": _epoch_label(_now_unix()),
            "path": str(cand.path),
            "volume": cand.volume,
            "origin": cand.slr.origin,
            "tier": cand.tier,
            "size": cand.slr.size,
            "evidence_of_non_use": {"use_count": 0, "mtime_unix": cand.slr.mtime_unix},
            "surviving_justification_path": [],
            "replayable_canonical_state": None,
            "signature": None,
        }
        if not dry_run:
            cand.path.unlink(missing_ok=True)
            record["signature"] = _sign(record)
        pruned.append(record)

    if not dry_run and out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "prune-records.json").write_text(
            json.dumps(pruned, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    return {
        "scheme": SCHEME,
        "dry_run": dry_run,
        "scanned": len(candidates),
        "refused": len(refused),
        "pruned": len(pruned),
        "errors": len(errors),
        "summary": _summarize(candidates, refused, pruned),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cpc-sweep", description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="repo root to sweep")
    parser.add_argument("--schedule", type=Path, default=Path("schedule.example.json"))
    parser.add_argument("--dry-run", action="store_true", help="scan and report only; touch nothing")
    parser.add_argument("--apply", action="store_true", help="delete lawful cold/dead artifacts (refused unless proofs exist)")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args(argv)

    result = sweep(
        repo_root=args.repo.resolve(),
        schedule_path=args.schedule.resolve(),
        dry_run=not args.apply,
        limit=args.limit,
        out_dir=args.out_dir,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
