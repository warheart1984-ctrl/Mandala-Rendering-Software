"""CPC-v1.0 verifier: audit that every prune in an epoch carries its three proofs.

Declared scaffold. Reads a prune-records.json (or verifies a single record) and
reports per-record: evidence of non-use, surviving justification path,
replayable canonical state, and a valid signature.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

SCHEME = "CPC-v1.0"

PROOFS = [
    "evidence_of_non_use",
    "surviving_justification_path",
    "replayable_canonical_state",
]


def _sign(record: dict[str, Any]) -> str:
    payload = {k: v for k, v in record.items() if k != "signature"}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def verify_record(record: dict[str, Any]) -> dict[str, Any]:
    report: dict[str, Any] = {
        "path": record.get("path"),
        "tier": record.get("tier"),
        "ok": True,
        "proofs": {},
    }
    for proof in PROOFS:
        present = proof in record and record[proof] not in (None, [], {})
        report["proofs"][proof] = present
        if not present:
            report["ok"] = False

    sig = record.get("signature")
    expected = _sign(record)
    report["signature_valid"] = bool(sig) and sig == expected
    if not report["signature_valid"]:
        report["ok"] = False
    return report


def verify_file(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        records = data.get("records", [data])
    elif isinstance(data, list):
        records = data
    else:
        raise SystemExit(f"unsupported prune-record shape in {path}")

    reports = [verify_record(r) for r in records]
    return {
        "scheme": SCHEME,
        "source": str(path),
        "records": len(reports),
        "ok": all(r["ok"] for r in reports),
        "reports": reports,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cpc-verify", description=__doc__)
    parser.add_argument("prune_file", type=Path, help="prune-records.json to audit")
    args = parser.parse_args(argv)

    result = verify_file(args.prune_file)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
