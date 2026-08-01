"""Tests for demo-cache keying, failover order, and claim labeling."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from app.demo_cache import (
    SOURCE_B2_CACHE,
    SOURCE_LIVE_GENERATE,
    SOURCE_STRUCTURE_ONLY,
    VALID_SOURCES,
    build_frame_provenance,
    cache_frame_key,
    cache_lookup_key,
    cache_manifest_key,
    claim_label,
    demo_cache_enabled,
    sha256_bytes,
    structure_only_response,
    write_local_sidecars,
)
from app.provider_cascade import (
    DEFAULT_CASCADE,
    cascade_for_backend,
    cascade_health,
    normalize_cascade,
    provider_configured,
)
from app.pre_render import _parse_frame_range, schedule_hint


@dataclass
class FakeSettings:
    storage_prefix: str = "genblaze-media"
    demo_cache_enabled: bool = False
    gmi_api_key: str | None = None
    gmi_configured: bool = False
    fal_api_key: str | None = None
    nvidia_configured: bool = False
    hfspace_configured: bool = True
    polish_backend: str = "auto"


class TestCacheKeying:
    def test_frame_key_layout(self):
        key = cache_frame_key("genblaze-media", "mandala-open", 3)
        assert key == "genblaze-media/demo-cache/mandala-open/f0003/render.png"

    def test_manifest_key_layout(self):
        key = cache_manifest_key("genblaze-media", "mandala-open", 3)
        assert key.endswith("/f0003/manifest.json")

    def test_lookup_key_with_prompt_hash(self):
        a = cache_lookup_key("shot-a", 0, "hello")
        b = cache_lookup_key("shot-a", 0, "hello")
        c = cache_lookup_key("shot-a", 0, "other")
        assert a == b
        assert a != c
        assert a.startswith("shot-a:f0000:p")

    def test_rejects_bad_shot_id(self):
        with pytest.raises(ValueError):
            cache_frame_key("p", "../evil", 0)

    def test_rejects_bad_frame(self):
        with pytest.raises(ValueError):
            cache_frame_key("p", "ok", -1)


class TestClaimLabeling:
    def test_all_sources_have_labels(self):
        for src in VALID_SOURCES:
            label = claim_label(src)
            assert isinstance(label, str) and len(label) > 8

    def test_b2_cache_not_live(self):
        label = claim_label(SOURCE_B2_CACHE)
        assert "live" not in label.lower() or "not a live" in label.lower()
        assert "b2" in label.lower() or "cache" in label.lower()

    def test_provenance_rejects_bad_source(self):
        with pytest.raises(ValueError):
            build_frame_provenance(
                source="silent-fake-anime",
                shot_id="s",
                frame=0,
                asset_sha256="abc",
                storage_prefix="genblaze-media",
            )

    def test_structure_only_payload(self):
        p = structure_only_response(shot_id="s", frame=1, detail="miss")
        assert p["source"] == SOURCE_STRUCTURE_ONLY
        assert p["beauty"] is False
        assert "source_label" in p


class TestFailoverOrder:
    def test_default_cascade_gmi_first_hfspace_last(self):
        assert DEFAULT_CASCADE[0] == "gmi"
        assert DEFAULT_CASCADE[-1] == "hfspace"
        assert "fal" in DEFAULT_CASCADE

    def test_normalize_dedupes(self):
        assert normalize_cascade(["gmi", "gmi", "hfspace", "unknown"]) == [
            "gmi",
            "hfspace",
        ]

    def test_backend_pin(self):
        assert cascade_for_backend("hfspace") == ["hfspace"]
        assert cascade_for_backend("auto") == list(DEFAULT_CASCADE)

    def test_cascade_health_first_configured(self):
        s = FakeSettings(fal_api_key="x", gmi_api_key=None, gmi_configured=False)
        h = cascade_health(s)
        assert h["cascade"][0] == "gmi"
        assert h["first_configured"] == "fal"
        assert h["legs"][-1]["provider"] == "hfspace"
        assert h["legs"][-1]["role"] == "free_fallback"

    def test_provider_configured_gmi(self):
        assert provider_configured("gmi", FakeSettings(gmi_configured=True)) is True
        assert provider_configured("gmi", FakeSettings()) is False


class TestDemoCacheFlag:
    def test_env_and_request(self):
        s = FakeSettings(demo_cache_enabled=True)
        assert demo_cache_enabled(s, None) is True
        assert demo_cache_enabled(FakeSettings(), True) is True
        assert demo_cache_enabled(s, False) is False


class TestLocalSidecars:
    def test_write_png_and_manifest(self, tmp_path: Path):
        png = b"\x89PNG\r\n\x1a\nfake"
        digest = sha256_bytes(png)
        prov = build_frame_provenance(
            source=SOURCE_LIVE_GENERATE,
            shot_id="mandala-open",
            frame=2,
            asset_sha256=digest,
            storage_prefix="genblaze-media",
            provider="gmicloud-genblaze",
            anime_world_profile_id="mandala-cel-v1",
        )
        paths = write_local_sidecars(tmp_path / "f0002", png, prov)
        assert paths["render"].read_bytes() == png
        man = json.loads(paths["manifest"].read_text(encoding="utf-8"))
        assert man["source"] == SOURCE_LIVE_GENERATE
        assert man["intent_id"]
        assert man["world_id"]
        assert man["timeline_id"]
        assert man["anime_world_profile_id"] == "mandala-cel-v1"
        assert man["asset_sha256"] == digest
        assert "demo-cache/mandala-open/f0002" in man["asset_key"]


class TestPreRenderHelpers:
    def test_parse_frame_range(self):
        assert _parse_frame_range("0-2") == [0, 1, 2]
        assert _parse_frame_range("1,3,5") == [1, 3, 5]

    def test_schedule_hint_24h(self):
        h = schedule_hint(24, window_hours=24.0)
        assert h["frames"] == 24
        assert abs(h["sleep_seconds"] - 3600.0) < 0.1


class TestSkipLocalSd:
    def test_lemonade_availability_skipped(self, monkeypatch):
        monkeypatch.setenv("GENBLAZE_SKIP_LOCAL_SD", "1")
        monkeypatch.setenv("GENBLAZE_DRY_RUN", "1")
        from app.config import get_settings
        from app.lemonade_provider import lemonade_availability

        s = get_settings()
        assert s.skip_local_sd is True
        avail = lemonade_availability(s)
        assert avail["available"] is False
        assert avail.get("skipped") is True
        assert "SKIP_LOCAL_SD" in (avail.get("skip_reason") or "")
