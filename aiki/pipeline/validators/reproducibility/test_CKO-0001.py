"""CKO-0001 reproducibility validator. Status: skeleton.

Until archive hashes exist, reports NOT FROZEN and exits 0 after structure checks.
When frozen, verifies required hash files exist (semantic MVP — not bitwise media).
"""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
# .../aiki/pipeline/validators/reproducibility/test_CKO-0001.py → parents[3] == aiki/
_AIKI = _HERE.parents[3]
_REPO = _AIKI.parent
for p in (_REPO, _AIKI):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def main() -> int:
    from pipeline.core.cko_validate import validate_cko_dict
    from pipeline.core.paths import PIPELINE_CONFIG, archive_dir, cko_path
    from pipeline.core.simple_yaml import load_mapping

    cko_id = "CKO-0001"
    path = cko_path(cko_id)
    print(f"[RBC-0001] validating {cko_id}")
    if not path.exists():
        print(f"FAIL: missing {path}")
        return 1

    data = load_mapping(path)
    errors = validate_cko_dict(data)
    if errors:
        print("FAIL: CKO schema errors:")
        for e in errors:
            print(f"  - {e}")
        return 1

    if not PIPELINE_CONFIG.exists():
        print(f"FAIL: missing pipeline config {PIPELINE_CONFIG}")
        return 1

    archive = archive_dir(cko_id)
    required_when_frozen = [
        "cko.hash",
        "script.hash",
        "narration.hash",
        "visuals.hash",
        "video.hash",
        "pipeline-version.txt",
    ]
    present = [n for n in required_when_frozen if (archive / n).exists()]
    missing = [n for n in required_when_frozen if n not in present]

    if missing:
        print("STATUS: NOT FROZEN (RBC-0001 not yet enforced)")
        print(f"  archive missing: {', '.join(missing)}")
        print("  structure checks: PASS")
        return 0

    print("STATUS: FROZEN — hash artifacts present")
    print("  semantic reproducibility gate: PASS (hash files present)")
    print("  note: bitwise media comparison is out of scope for MVP")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
