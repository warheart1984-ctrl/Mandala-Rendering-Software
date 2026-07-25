"""Ephemeral local preview cache so UI does not need B2 Class B downloads.

Backblaze free-tier **transaction caps** make private-bucket presigned GETs fail with
``AccessDenied: Transaction cap exceeded`` even when objects exist. After generate
we already have image bytes in process — keep a small on-disk cache and serve
same-origin ``/api/preview/{run_id}`` for the UI.

Render's filesystem is ephemeral; cache is best-effort for the current instance.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_RUN_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

# Override the on-disk cache location (used by tests to keep writes out of the
# repository working tree, and by operators who mount a scratch volume).
_ENV_CACHE_DIR = "GENBLAZE_PREVIEW_CACHE_DIR"


def cache_dir(app_dir: Path) -> Path:
    override = os.getenv(_ENV_CACHE_DIR)
    path = Path(override) if override else app_dir / "data" / "preview-cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_run_id(run_id: str) -> bool:
    return bool(_RUN_ID_RE.match((run_id or "").strip()))


def _guess_ext(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    # WebM / Matroska (EBML)
    if len(data) >= 4 and data[:4] == b"\x1aE\xdf\xa3":
        return ".webm"
    # ISO BMFF: QuickTime (.mov) vs MP4 — major brand at offset 8
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand == b"qt  ":
            return ".mov"
        return ".mp4"
    return ".bin"


def media_type_for_path(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".png":
        return "image/png"
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    if ext == ".mp4":
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    if ext == ".mov":
        return "video/quicktime"
    return "application/octet-stream"


def put_preview(app_dir: Path, run_id: str, data: bytes) -> Path | None:
    """Write preview bytes for ``run_id``. Returns path or None on failure."""
    if not is_run_id(run_id) or not data:
        return None
    try:
        root = cache_dir(app_dir)
        # Drop older files for this run_id (any extension).
        for old in root.glob(f"{run_id}.*"):
            try:
                old.unlink()
            except OSError:
                pass
        path = root / f"{run_id}{_guess_ext(data)}"
        path.write_bytes(data)
        _prune(root, keep=40)
        return path
    except OSError:
        return None


def get_preview_path(app_dir: Path, run_id: str) -> Path | None:
    if not is_run_id(run_id):
        return None
    root = cache_dir(app_dir)
    matches = sorted(root.glob(f"{run_id}.*"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in matches:
        if path.is_file() and path.stat().st_size > 0:
            return path
    return None


def local_preview_url(run_id: str) -> str:
    return f"/api/preview/{run_id}"


def _prune(root: Path, keep: int = 40) -> None:
    files = [p for p in root.iterdir() if p.is_file()]
    if len(files) <= keep:
        return
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for path in files[keep:]:
        try:
            path.unlink()
        except OSError:
            pass
