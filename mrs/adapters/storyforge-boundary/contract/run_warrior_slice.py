#!/usr/bin/env python3
"""Run the warrior courtyard vertical slice (identity, not pretty frames).

  python mrs/adapters/storyforge-boundary/contract/run_warrior_slice.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_DIR = Path(__file__).resolve().parent
_ADAPTER = _DIR.parent
if str(_ADAPTER) not in sys.path:
    sys.path.insert(0, str(_ADAPTER))

from contract.audio import compare_score_identity
from contract.map_infinity import from_infinity_backend_build, to_mandala_production_request
from contract.vertical_slice import compare_identity, emit_shot_artifacts

FIXTURE = _DIR / "fixtures" / "infinity-backend-build-warrior-courtyard.json"


def main() -> int:
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    artifact = from_infinity_backend_build(raw)
    request = to_mandala_production_request(artifact)
    shots = emit_shot_artifacts(request)
    result = compare_identity(shots[0], shots[-1])
    score = compare_score_identity(shots[0], shots[-1])
    payload = {
        "schemaVersion": artifact["schemaVersion"],
        "productionId": artifact["productionId"],
        "shotCount": len(shots),
        "shotIds": [s["shotId"] for s in shots],
        "poses": [s["pose"]["id"] for s in shots],
        "identityCompare": result,
        "scoreIdentityCompare": score,
        "renderHashesDiffer": shots[0]["renderHash"] != shots[-1]["renderHash"],
        "audioPlanStatus": artifact["audioPlan"]["statusTag"],
        "audioMappingStatus": artifact["audioPlan"]["mappingStatusTag"],
        "success": result["equal"] and score["equal"] and score["cuesEvolved"] and len(shots) >= 5,
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
