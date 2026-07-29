"""Conformance Evidence: Genblaze / Engine3D tile ROI API inventory (Cycle 7+)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
GENBLAZE_APP = REPO / "mrs" / "apps" / "genblaze-media" / "app"
ENGINE3D_PROVIDER = GENBLAZE_APP / "engine3d_still_provider.py"
GENBLAZE_MAIN = GENBLAZE_APP / "main.py"

TILE_API_PATTERNS = (
    r"\bcrop_region\b",
    r"\btile_index\b",
    r"/api/engine3d-tile-still",
)


def _scan_for_tile_api(path: Path) -> list[str]:
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    hits: list[str] = []
    for pat in TILE_API_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            hits.append(pat)
    return hits


class TestGenblazeTileApiInventory:
    """Drive-G-1: per-tile shade API signals must exist for W-TILE-FAITHFUL clearance."""

    def test_engine3d_still_provider_exposes_crop_region(self):
        hits = _scan_for_tile_api(ENGINE3D_PROVIDER)
        assert r"\bcrop_region\b" in hits, f"missing crop_region in {ENGINE3D_PROVIDER}"

    def test_genblaze_main_has_tile_still_route(self):
        hits = _scan_for_tile_api(GENBLAZE_MAIN)
        assert r"/api/engine3d-tile-still" in hits
        assert r"\bcrop_region\b" in hits

    def test_tile_faithful_conformance_cleared(self):
        """Minimum API landed: crop_region + dedicated tile route."""
        provider_hits = _scan_for_tile_api(ENGINE3D_PROVIDER)
        main_hits = _scan_for_tile_api(GENBLAZE_MAIN)
        assert r"\bcrop_region\b" in provider_hits
        assert r"/api/engine3d-tile-still" in main_hits
