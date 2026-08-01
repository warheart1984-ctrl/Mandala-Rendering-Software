"""Tests for B2 pre-render structure lane + 24h schedule/--run-due (mocked I/O)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from app.demo_cache import SOURCE_B2_STRUCTURE, SOURCE_STRUCTURE_ONLY, claim_label, sha256_bytes
from app.pre_render import (
    build_24h_schedule,
    load_cached_structure_if_available,
    pre_render_prefix,
    run_due_slots,
    run_live_pipeline_with_b2_fallback,
    run_live_polish,
    schedule_key,
    spawn_24h_spread_pipeline,
    structure_asset_key,
    structure_manifest_key,
)


@dataclass
class FakeSettings:
    storage_prefix: str = "genblaze-media"
    b2_configured: bool = False
    b2_bucket: str = "test-bucket"
    b2_key_id: str | None = None
    b2_app_key: str | None = None
    gmi_api_key: str | None = None
    gmi_configured: bool = False
    skip_local_sd: bool = True
    pre_render_fallback_enabled: bool = True
    pre_render_shots_per_hour: int = 4


def _tiny_png() -> bytes:
    import struct
    import zlib

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(d)) + c + crc

    raw = b"\x00\xff\x00\x00\xff"
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


class TestSchedule:
    def test_96_slots_at_4_per_hour(self):
        sched = build_24h_schedule(shots_per_hour=4, window_hours=24.0)
        assert sched["slot_count"] == 96
        assert len(sched["slots"]) == 96
        assert sched["interval_seconds"] == 900.0
        assert sched["slots"][0]["status"] == "pending"
        assert sched["slots"][1]["index"] == 1

    def test_due_spacing(self):
        start = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)
        sched = build_24h_schedule(
            shots_per_hour=4, window_hours=1.0, start_at=start
        )
        assert sched["slot_count"] == 4
        t0 = datetime.fromisoformat(sched["slots"][0]["due_at"])
        t1 = datetime.fromisoformat(sched["slots"][1]["due_at"])
        assert (t1 - t0).total_seconds() == 900.0

    def test_key_layout(self):
        assert (
            structure_asset_key("genblaze-media")
            == "genblaze-media/pre-render/structure.png"
        )
        assert structure_manifest_key("p").endswith("/pre-render/manifest.json")
        assert schedule_key("p").endswith("/pre-render/schedule.json")
        assert pre_render_prefix("x") == "x/pre-render"


class TestSpawnSkipB2:
    def test_skip_when_b2_not_configured(self, tmp_path: Path):
        settings = FakeSettings(b2_configured=False)
        result = spawn_24h_spread_pipeline(
            settings,
            shots_per_hour=4,
            window_hours=24.0,
            out_dir=tmp_path / "spawn",
            upload_b2=True,
            structure_png=_tiny_png(),
        )
        assert result["status"] == "skipped_b2"
        assert result["slot_count"] == 96
        assert result["spread_mode"] == "schedule+run-due"
        assert (Path(result["local_dir"]) / "structure.png").is_file()
        assert (Path(result["local_dir"]) / "schedule.json").is_file()
        assert (Path(result["local_dir"]) / "manifest.json").is_file()
        man = json.loads(
            (Path(result["local_dir"]) / "manifest.json").read_text(encoding="utf-8")
        )
        assert man["structure_sha256"] == result["structure_sha256"]
        assert man["schedule"]["slot_count"] == 96
        assert man.get("intent_id")
        assert man.get("world_id")
        assert man.get("timeline_id")


class TestLoadCachedStructure:
    def test_miss_when_b2_not_configured(self):
        data, reason = load_cached_structure_if_available(FakeSettings())
        assert data is None
        assert reason == "b2_not_configured"

    def test_hit_with_mock_backend(self):
        png = _tiny_png()
        settings = FakeSettings(b2_configured=True)

        def fake_get(_settings: Any, key: str) -> bytes | None:
            if key.endswith("structure.png"):
                return png
            if key.endswith("manifest.json"):
                return json.dumps(
                    {"structure_sha256": sha256_bytes(png)}
                ).encode()
            return None

        with patch("app.pre_render._backend_get_bytes", side_effect=fake_get):
            data, reason = load_cached_structure_if_available(settings)
        assert data == png
        assert reason.startswith("hit:")


class TestLivePolishUsesStructureBytes:
    def test_polish_receives_structure_bytes(self, tmp_path: Path):
        png = _tiny_png()
        settings = FakeSettings()

        captured: dict[str, Any] = {}

        def fake_beauty(**kwargs: Any):
            captured["structure_png"] = kwargs["structure_png"]
            # Return structure-only (no live painters)
            return png, "structure-only", "none", False, "no painters"

        with patch(
            "app.constitutional_anime_render.run_beauty_stage",
            side_effect=fake_beauty,
        ):
            with patch(
                "app.constitutional_anime_render.probe_painters",
                return_value=[],
            ):
                result = run_live_polish(
                    settings,
                    "test prompt",
                    png,
                    allow_cel_proxy=False,
                    painter_pref="none",
                )

        assert captured["structure_png"] == png
        assert result["polish_used_structure_bytes"] is True
        assert result["image_bytes"] == png
        assert result["anime_claim"] is False


class TestB2Fallback:
    def test_failover_loads_cache(self):
        png = _tiny_png()
        settings = FakeSettings(b2_configured=True)

        def fake_polish(*_a: Any, **_k: Any) -> dict[str, Any]:
            return {
                "status": "structure-only",
                "anime_claim": False,
                "detail": "all painters failed",
                "image_bytes": png,
                "backend": "none",
            }

        with patch(
            "app.pre_render.run_live_polish",
            side_effect=fake_polish,
        ):
            with patch(
                "app.pre_render.load_cached_structure_if_available",
                return_value=(png, "hit:genblaze-media/pre-render/structure.png"),
            ):
                result = run_live_pipeline_with_b2_fallback(
                    settings,
                    "prompt",
                    structure_png=png,
                )

        assert result["source"] == SOURCE_B2_STRUCTURE
        assert result["fallback"] == "b2-structure-cache"
        assert result["anime_claim"] is False
        assert result["image_bytes"] == png
        assert "not live beauty" in claim_label(SOURCE_B2_STRUCTURE).lower() or (
            "structure" in claim_label(SOURCE_B2_STRUCTURE).lower()
        )


class TestRunDue:
    def test_run_due_only_due_slots(self, tmp_path: Path):
        settings = FakeSettings(b2_configured=False)
        start = datetime(2026, 8, 1, 0, 0, 0, tzinfo=timezone.utc)
        sched = build_24h_schedule(
            shots_per_hour=4, window_hours=1.0, start_at=start, shot_id="t"
        )
        sched_path = tmp_path / "schedule.json"
        sched_path.write_text(json.dumps(sched), encoding="utf-8")

        # Only first two slots due
        now = start + timedelta(seconds=900 + 1)

        def fake_render(*_a: Any, **kwargs: Any) -> dict[str, Any]:
            return {
                "shot_id": kwargs["shot_id"],
                "frame": kwargs["frame"],
                "asset_key": f"k/{kwargs['frame']}",
                "source": "live-generate",
            }

        with patch("app.pre_render.render_one_frame", side_effect=fake_render):
            with patch(
                "app.pre_render.load_cached_structure_if_available",
                return_value=(None, "b2_not_configured"),
            ):
                result = run_due_slots(
                    settings,
                    out_root=tmp_path / "out",
                    upload_b2=False,
                    allow_placeholder=True,
                    local_schedule=sched_path,
                    now=now,
                )

        assert result["status"] == "ok"
        assert result["completed"] == 2
        updated = json.loads(sched_path.read_text(encoding="utf-8"))
        assert updated["slots"][0]["status"] == "done"
        assert updated["slots"][1]["status"] == "done"
        assert updated["slots"][2]["status"] == "pending"


class TestSourceLabels:
    def test_structure_cache_label_honest(self):
        label = claim_label(SOURCE_B2_STRUCTURE)
        assert "live beauty" in label.lower() or "not live" in label.lower()
        assert SOURCE_STRUCTURE_ONLY != SOURCE_B2_STRUCTURE
