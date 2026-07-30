"""AIKI pipeline path helpers. Status: skeleton."""
from __future__ import annotations

from pathlib import Path

# paths.py lives at aiki/pipeline/core/paths.py → parents[2] == aiki/
AIKI_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = AIKI_ROOT.parent
KNOWLEDGE_OBJECTS = AIKI_ROOT / "knowledge" / "objects"
ARCHIVE_PUBLISHED = AIKI_ROOT / "archive" / "published"
PIPELINE_CONFIG = AIKI_ROOT / "config" / "pipeline.yaml"
CONTENT_SCRIPTS = AIKI_ROOT / "content" / "scripts"


def cko_path(cko_id: str) -> Path:
    return KNOWLEDGE_OBJECTS / f"{cko_id}.yaml"


def archive_dir(cko_id: str) -> Path:
    return ARCHIVE_PUBLISHED / cko_id
