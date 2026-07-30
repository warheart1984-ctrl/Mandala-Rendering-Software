"""Minimal CKO field checks. Status: skeleton."""
from __future__ import annotations

REQUIRED_TOP = ("id", "cko_id", "series", "title", "slug", "pedagogy", "formats", "status")
REQUIRED_PEDAGOGY = ("learning_objectives", "narrative_arc")


def validate_cko_dict(data: dict) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_TOP:
        if key not in data:
            errors.append(f"missing top-level field: {key}")
    pedagogy = data.get("pedagogy") or {}
    if not isinstance(pedagogy, dict):
        errors.append("pedagogy must be a mapping")
    else:
        for key in REQUIRED_PEDAGOGY:
            if key not in pedagogy:
                errors.append(f"missing pedagogy.{key}")
        objs = pedagogy.get("learning_objectives")
        if objs is not None and (not isinstance(objs, list) or len(objs) == 0):
            errors.append("pedagogy.learning_objectives must be a non-empty list")
        arc = pedagogy.get("narrative_arc")
        if arc is not None and not isinstance(arc, dict):
            errors.append("pedagogy.narrative_arc must be a mapping")
        elif isinstance(arc, dict) and "hook" not in arc:
            errors.append("pedagogy.narrative_arc.hook is required")
    status = data.get("status") or {}
    if isinstance(status, dict) and "lifecycle" not in status:
        errors.append("status.lifecycle is required")
    return errors
