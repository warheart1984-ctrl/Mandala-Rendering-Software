"""Replay checklist for a CKO. Status: skeleton (semantic reconstruction)."""
from __future__ import annotations

from pipeline.core.paths import AIKI_ROOT, CONTENT_SCRIPTS, REPO_ROOT, archive_dir, cko_path


def _rel(path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def replay_checklist(cko_id: str) -> dict:
    """Return reconstruction checklist; does not regenerate media."""
    cko = cko_path(cko_id)
    scripts = CONTENT_SCRIPTS / cko_id
    archive = archive_dir(cko_id)
    expected = [
        ("cko", cko),
        ("outline", scripts / "outline.md"),
        ("script", scripts / "script.md"),
        ("visual_plan", scripts / "visual-plan.yaml"),
        ("archive_dir", archive),
        ("expected_artifacts_doc", archive / "EXPECTED_ARTIFACTS.md"),
    ]
    items = [
        {"name": name, "path": _rel(path), "exists": path.exists()}
        for name, path in expected
    ]
    frozen_hashes = [
        "cko.hash",
        "script.hash",
        "narration.hash",
        "visuals.hash",
        "video.hash",
        "pipeline-version.txt",
    ]
    hash_status = {name: (archive / name).exists() for name in frozen_hashes}
    frozen = all(hash_status.values())
    return {
        "cko_id": cko_id,
        "mode": "semantic",
        "aiki_root": _rel(AIKI_ROOT),
        "frozen": frozen,
        "checklist": items,
        "hash_status": hash_status,
        "note": (
            "CKO-0001 not frozen — replay is a structure checklist only."
            if not frozen
            else "Frozen hashes present — compare against current artifacts."
        ),
    }
