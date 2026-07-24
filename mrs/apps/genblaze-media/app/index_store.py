"""Lightweight recent-assets index (local JSON + optional B2 mirror)."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class AssetIndex:
    """Append-only recent list capped at `max_entries`."""

    def __init__(self, path: Path, max_entries: int = 50) -> None:
        self.path = path
        self.max_entries = max_entries
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({"updated_at": _utc_now(), "assets": []})

    def _read(self) -> dict[str, Any]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"updated_at": _utc_now(), "assets": []}

    def _write(self, data: dict[str, Any]) -> None:
        self.path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    def list_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        with _LOCK:
            assets = self._read().get("assets") or []
            return list(assets)[: max(1, min(limit, self.max_entries))]

    def prepend(self, entry: dict[str, Any]) -> None:
        with _LOCK:
            data = self._read()
            assets = [entry, *(data.get("assets") or [])]
            data["assets"] = assets[: self.max_entries]
            data["updated_at"] = _utc_now()
            self._write(data)
