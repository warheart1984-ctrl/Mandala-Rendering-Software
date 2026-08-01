"""Unit tests for the Constitutional Anime Render pipeline CLI.

Live network probes are monkeypatched via a fake ``httpx`` module; the
``GENBLAZE_PROBE_LIVE=0`` env fallback is covered as an offline path.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys

from PIL import Image

from app.anime_world_profile import (
    default_example_path,
    load_anime_world_profile,
    validate_anime_world_profile,
)
from app.constitutional_anime_render import (
    BACKEND_CEL_PROXY,
    BACKEND_FAL,
    BACKEND_HFSPACE,
    BACKEND_NONE,
    LANE_BEAUTY,
    LANE_STRUCTURE_ONLY,
    PainterProbe,
    apply_cel_proxy_png,
    build_assertion,
    main,
    probe_fal,
    probe_hfspace,
    probe_lemonade,
    probe_nvidia,
    resolve_anime_claim,
    run_beauty_stage,
    run_pipeline,
)


class FakeResp:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.text = text

    def json(self):
        return self._json


class FakeClient:
    """Mirrors httpx.Client: ``(method, url_suffix, response)`` routing."""

    def __init__(self, responses=None):
        self.responses = responses or []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url):
        return self._route("get", url)

    def post(self, url, json=None, headers=None):
        return self._route("post", url)

    def _route(self, method, url):
        for meth, suffix, resp in self.responses:
            if meth == method and suffix in url:
                return resp
        return FakeResp(404)


class _FakeHttpx:
    def __init__(self, client_factory):
        self.Client = client_factory
        self.TimeoutException = TimeoutError


def _fake_httpx(monkeypatch, client_factory) -> None:
    monkeypatch.setitem(sys.modules, "httpx", _FakeHttpx(client_factory))


def _tiny_png_bytes(color=(180, 90, 40)) -> bytes:
    img = Image.new("RGB", (64, 64), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _profile_dict() -> dict:
    """Validated example profile — claim gate requires full contract shape."""
    return load_anime_world_profile(default_example_path())


def _invalid_profile_dict() -> dict:
    return {"profileId": "anime.broken.v1", "schemaVersion": "1.0.0"}


def _pipeline_args(tmp_path, **overrides) -> argparse.Namespace:
    base = dict(
        out_dir=str(tmp_path / "out"),
        profile=None,
        structure=None,
        structure_source="engine3d",
        no_reuse_continuity=True,
        run_engine3d=False,
        painter="none",
        no_cel_proxy=True,
        intent_id=None,
        world_id=None,
        timeline_id=None,
    )
    base.update(overrides)
    return argparse.Namespace(**base)


def test_probe_fal_missing_key(monkeypatch):
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.delenv("FAL_API_KEY", raising=False)
    monkeypatch.delenv("SEEDANCE_API_KEY", raising=False)
    p = probe_fal()
    assert not p.available
    assert p.configured is False
    assert p.reachable is None
    assert p.operational is None
    assert p.verified is False
    assert p.last_verified is None
    assert "missing" in p.detail


def test_probe_fal_polish_disabled_fails_closed(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "sk-probe")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "0")
    p = probe_fal()
    assert not p.available
    assert p.configured is False
    assert p.verified is False
    assert p.last_verified is None
    assert "GENBLAZE_POLISH_ENABLED" in p.detail


def test_probe_fal_live_401_dead_key(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "dead-key")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    resp = FakeResp(401, text='{"detail": "No user found for Key ID and Secret"}')
    _fake_httpx(
        monkeypatch, lambda *a, **k: FakeClient([("post", "fal.run", resp)])
    )
    p = probe_fal(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is False
    assert p.verified is True
    assert p.last_verified is not None
    assert "401" in p.detail
    assert "dead" in p.detail.lower() or "invalid" in p.detail.lower()


def test_probe_fal_live_ok(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "good-key")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    resp = FakeResp(200, json_data={"images": [{"url": "https://fal.run/x.png"}]})
    _fake_httpx(
        monkeypatch, lambda *a, **k: FakeClient([("post", "fal.run", resp)])
    )
    p = probe_fal(live=True)
    assert p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is True
    assert p.verified is True
    assert p.last_verified is not None
    assert "200" in p.detail


def test_probe_fal_live_disabled_key_presence(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "k")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    p = probe_fal()
    assert p.available
    assert p.configured is True
    assert p.reachable is None
    assert p.operational is None
    assert p.verified is False
    assert p.last_verified is None
    assert "disabled" in p.detail


def test_probe_lemonade_generation_500_not_available(monkeypatch):
    # The fix: reachable /models but failed generation must report not operational.
    models = FakeResp(200, json_data={"object": "list", "data": []})
    gen = FakeResp(500, text='{"error": {"code": "model_load_error"}}')
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient(
            [("get", "/models", models), ("post", "/images/generations", gen)]
        ),
    )
    p = probe_lemonade(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is False
    assert p.verified is True
    assert p.last_verified is not None
    assert "500" in p.detail


def test_probe_lemonade_generation_ok(monkeypatch):
    b64 = base64.b64encode(b"probe-png").decode()
    models = FakeResp(200, json_data={"object": "list", "data": []})
    gen = FakeResp(200, json_data={"data": [{"b64_json": b64}]})
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient(
            [("get", "/models", models), ("post", "/images/generations", gen)]
        ),
    )
    p = probe_lemonade(live=True)
    assert p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is True
    assert p.verified is True
    assert p.last_verified is not None
    assert "200" in p.detail


def test_probe_nvidia_401_bad_key(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "bad")
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient([("post", "ai.api.nvidia.com", FakeResp(401))]),
    )
    p = probe_nvidia(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is False
    assert p.verified is True
    assert p.last_verified is not None
    assert "invalid key" in p.detail


def test_probe_nvidia_504_upstream(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "k")
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient([("post", "ai.api.nvidia.com", FakeResp(504))]),
    )
    p = probe_nvidia(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is False
    assert p.verified is True
    assert p.last_verified is not None
    assert "upstream" in p.detail.lower()


def test_probe_nvidia_ok(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "k")
    resp = FakeResp(200, json_data={"artifacts": [{"base64": "eA=="}]})
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient([("post", "ai.api.nvidia.com", resp)]),
    )
    p = probe_nvidia(live=True)
    assert p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is True
    assert p.verified is True
    assert p.last_verified is not None


def test_probe_hfspace_keyless_configured(monkeypatch):
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    p = probe_hfspace()
    assert p.available
    assert p.configured is True
    assert p.reachable is None
    assert p.operational is None
    assert p.verified is False
    assert p.last_verified is None
    assert "disabled" in p.detail


def test_probe_hfspace_missing_url_fails_closed(monkeypatch):
    monkeypatch.delenv("GENBLAZE_HFSPACE_URL", raising=False)
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    p = probe_hfspace()
    assert not p.available
    assert p.configured is False
    assert "GENBLAZE_HFSPACE_URL" in p.detail


def test_probe_hfspace_polish_disabled_fails_closed(monkeypatch):
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "0")
    p = probe_hfspace()
    assert not p.available
    assert p.configured is False
    assert p.verified is False
    assert "GENBLAZE_POLISH_ENABLED" in p.detail


def test_probe_hfspace_live_root_ok(monkeypatch):
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient([("get", "example.hf.space", FakeResp(200))]),
    )
    p = probe_hfspace(live=True)
    assert p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is True
    assert p.verified is True
    assert p.last_verified is not None
    assert "200" in p.detail


def test_probe_hfspace_live_root_error(monkeypatch):
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    _fake_httpx(
        monkeypatch,
        lambda *a, **k: FakeClient([("get", "example.hf.space", FakeResp(503))]),
    )
    p = probe_hfspace(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is True
    assert p.operational is False
    assert p.verified is True
    assert "503" in p.detail


def test_probe_hfspace_live_unreachable(monkeypatch):
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")

    class _RaisingFakeClient(FakeClient):
        def get(self, url):
            raise TimeoutError("probe timeout")

    _fake_httpx(monkeypatch, lambda *a, **k: _RaisingFakeClient())
    p = probe_hfspace(live=True)
    assert not p.available
    assert p.configured is True
    assert p.reachable is False
    assert p.operational is False
    assert p.verified is True
    assert "unreachable" in p.detail


def test_painter_probe_three_state_report():
    p = PainterProbe(
        backend=BACKEND_FAL,
        configured=True,
        reachable=True,
        operational=False,
        verified=True,
        last_verified="2026-07-31T12:00:00+00:00",
        detail="fal: invalid/dead key (HTTP 401)",
        env_vars_required=["FAL_KEY"],
    )
    assert p.available is False  # verified + not operational -> gated off

    d = PainterProbe(
        backend=BACKEND_FAL,
        configured=True,
        reachable=None,
        operational=None,
        verified=False,
        last_verified=None,
        detail="configured (live probe disabled)",
        env_vars_required=["FAL_KEY"],
    )
    assert d.available is True  # unverified -> best-effort configured

    import dataclasses

    report = dataclasses.asdict(p)
    for key in ("configured", "reachable", "operational", "verified", "last_verified"):
        assert key in report
    assert report["reachable"] is True
    assert report["operational"] is False
    assert report["verified"] is True
    assert report["last_verified"] == "2026-07-31T12:00:00+00:00"


def test_cel_proxy_deterministic_dual_apply():
    png = _tiny_png_bytes()
    prof = _profile_dict()
    a = apply_cel_proxy_png(png, prof)
    b = apply_cel_proxy_png(png, prof)
    assert a == b
    assert a != png  # banding/ink changes pixels


def test_cel_proxy_output_is_png():
    out = apply_cel_proxy_png(_tiny_png_bytes(), _profile_dict())
    img = Image.open(io.BytesIO(out))
    assert img.format == "PNG"
    assert img.size == (64, 64)


def test_build_assertion_format():
    a = build_assertion(
        profile_id="anime.mandala-cel.v1",
        profile_version="1.0.0",
        structure_source="RT4D",
        polish_backend="cel-proxy",
        provenance_hash="abcd" * 8,
    )
    assert a.startswith("Rendered under AnimeWorldProfile v1.0.0")
    assert "structure from RT4D" in a
    assert "polished by cel-proxy" in a
    assert "abcd" in a


def test_build_assertion_structure_only_label():
    a = build_assertion(
        profile_id="p",
        profile_version="1.0.0",
        structure_source="engine3d",
        polish_backend="none",
        provenance_hash="h" * 64,
    )
    assert "polished by structure-only" in a


def test_run_beauty_stage_fails_closed_structure_only():
    png = _tiny_png_bytes()
    beauty, lane, backend, claim, detail = run_beauty_stage(
        structure_png=png,
        profile=_profile_dict(),
        painter_pref="none",
        allow_cel_proxy=True,
        probe_map={},
    )
    assert lane == LANE_STRUCTURE_ONLY
    assert backend == BACKEND_NONE
    assert claim is False
    assert beauty == png
    assert "structure-only" in detail


def test_run_beauty_stage_cel_proxy_deterministic():
    png = _tiny_png_bytes()
    prof = _profile_dict()
    beauty, lane, backend, claim, _ = run_beauty_stage(
        structure_png=png,
        profile=prof,
        painter_pref="cel-proxy",
        allow_cel_proxy=True,
        probe_map={},
    )
    assert lane == LANE_BEAUTY
    assert backend == BACKEND_CEL_PROXY
    assert claim is True
    assert beauty == apply_cel_proxy_png(png, prof)


def test_run_beauty_stage_cel_proxy_disabled_falls_closed():
    png = _tiny_png_bytes()
    beauty, lane, backend, claim, detail = run_beauty_stage(
        structure_png=png,
        profile=_profile_dict(),
        painter_pref="cel-proxy",
        allow_cel_proxy=False,
        probe_map={},
    )
    assert lane == LANE_STRUCTURE_ONLY
    assert backend == BACKEND_NONE
    assert claim is False
    assert beauty == png
    assert "cel-proxy disabled" in detail


def test_run_beauty_stage_auto_with_empty_probe_map_skips_unprobed():
    # probe_map={} must not KeyError; unprobed diffusion backends are skipped.
    png = _tiny_png_bytes()
    prof = _profile_dict()
    beauty, lane, backend, claim, detail = run_beauty_stage(
        structure_png=png,
        profile=prof,
        painter_pref="auto",
        allow_cel_proxy=True,
        probe_map={},
    )
    assert lane == LANE_BEAUTY
    assert backend == BACKEND_CEL_PROXY
    assert claim is True
    assert "cel-proxy" in detail


def test_run_beauty_stage_auto_prefers_hfspace_before_cel_proxy(monkeypatch):
    monkeypatch.setenv("GENBLAZE_POLISH_ENABLED", "1")
    monkeypatch.setenv("GENBLAZE_HFSPACE_URL", "https://example.hf.space")
    monkeypatch.setattr(
        "app.constitutional_anime_render.try_hfspace_polish",
        lambda structure_png, prompt: (_tiny_png_bytes((255, 0, 128)), "hfspace: img2img ok"),
    )
    png = _tiny_png_bytes()
    hf_probe = PainterProbe(
        backend=BACKEND_HFSPACE,
        configured=True,
        reachable=True,
        operational=True,
        verified=True,
        last_verified="2026-07-31T12:00:00+00:00",
        detail="hfspace: space reachable (HTTP 200)",
        env_vars_required=["GENBLAZE_HFSPACE_URL"],
    )
    beauty, lane, backend, claim, detail = run_beauty_stage(
        structure_png=png,
        profile=_profile_dict(),
        painter_pref="auto",
        allow_cel_proxy=True,
        probe_map={BACKEND_HFSPACE: hf_probe},
    )
    assert lane == LANE_BEAUTY
    assert backend == BACKEND_HFSPACE
    assert claim is True
    assert "hfspace" in detail


def test_probe_only_exits_zero_offline(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    monkeypatch.setattr(
        "app.constitutional_anime_render.probe_painters", lambda live=None: []
    )
    code = main(["--probe-only"])
    assert code == 0
    out = json.loads(capsys.readouterr().out)
    assert out["valid"] is True
    assert "painter_probes" in out
    assert out["painter_probes"] == []


def test_run_pipeline_structure_only_labels_honest(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    monkeypatch.setattr(
        "app.constitutional_anime_render.probe_painters", lambda live=None: []
    )
    struct = tmp_path / "in-structure.png"
    struct.write_bytes(_tiny_png_bytes((90, 120, 200)))
    args = _pipeline_args(tmp_path, structure=str(struct))

    manifest = run_pipeline(args)

    assert manifest.lane == LANE_STRUCTURE_ONLY
    assert manifest.polish_backend == BACKEND_NONE
    assert manifest.anime_claim is False
    assert manifest.anime_world_profile_id  # validated id still attached
    assert manifest.structure_sha256 == manifest.beauty_sha256  # identity fallback
    assert "structure-only" in manifest.assertion
    assert manifest.statusTags["beauty_lane"] == "blocked"
    assert manifest.statusTags["anime_claim_gate"] == "enforced"
    assert manifest.statusTags["ckl_gate"] == "declared"

    out = tmp_path / "out"
    assert (out / "render-manifest.json").is_file()
    assert (out / "provenance-report.json").is_file()
    assert (out / "structure-only.png").is_file()
    assert (out / "final.png").is_file()
    assert (out / "anime-world-profile.json").is_file()
    report = json.loads((out / "provenance-report.json").read_text(encoding="utf-8"))
    assert report["lane"] == LANE_STRUCTURE_ONLY
    assert report["continuity_ok"] is True
    stage2 = next(s for s in manifest.stages if s["stage"] == "2-beauty")
    assert stage2["artifacts"]["anime_claim"] is False
    assert "deny:" in stage2["artifacts"]["anime_claim_gate"]


def test_run_pipeline_cel_proxy_dual_apply_replay(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    monkeypatch.setattr(
        "app.constitutional_anime_render.probe_painters", lambda live=None: []
    )
    struct = tmp_path / "in-structure.png"
    struct.write_bytes(_tiny_png_bytes((40, 180, 90)))
    args = _pipeline_args(
        tmp_path,
        structure=str(struct),
        painter="cel-proxy",
        no_cel_proxy=False,
    )

    manifest = run_pipeline(args)

    assert manifest.lane == LANE_BEAUTY
    assert manifest.polish_backend == BACKEND_CEL_PROXY
    assert manifest.anime_claim is True
    assert manifest.anime_world_profile_id == "anime.mandala-cel.v1"
    assert manifest.structure_sha256 != manifest.beauty_sha256
    assert manifest.provenance_hash
    assert manifest.statusTags["cel_proxy_replay"] == "enforced"
    assert manifest.statusTags["beauty_lane"] == "partial"
    assert manifest.statusTags["anime_claim_gate"] == "enforced"
    assert manifest.statusTags["ckl_gate"] == "declared"
    out = tmp_path / "out"
    assert (out / "beauty.png").is_file()
    stage2 = next(s for s in manifest.stages if s["stage"] == "2-beauty")
    assert "allow:" in stage2["artifacts"]["anime_claim_gate"]
    assert stage2["artifacts"]["anime_world_profile_id"] == "anime.mandala-cel.v1"


def test_resolve_anime_claim_deny_missing_profile_id():
    claim, reason = resolve_anime_claim(
        profile={"schemaVersion": "1.0.0"},
        lane=LANE_BEAUTY,
        polish_backend=BACKEND_CEL_PROXY,
        beauty_bytes=b"beauty",
        structure_bytes=b"structure",
        profile_issues=[],
    )
    assert claim is False
    assert "missing anime_world_profile_id" in reason


def test_resolve_anime_claim_deny_invalid_profile():
    bad = _invalid_profile_dict()
    issues = validate_anime_world_profile(bad)
    assert issues
    png = _tiny_png_bytes()
    beauty = apply_cel_proxy_png(png, _profile_dict())
    claim, reason = resolve_anime_claim(
        profile=bad,
        lane=LANE_BEAUTY,
        polish_backend=BACKEND_CEL_PROXY,
        beauty_bytes=beauty,
        structure_bytes=png,
        profile_issues=issues,
    )
    assert claim is False
    assert "invalid" in reason


def test_resolve_anime_claim_deny_structure_only_no_beauty():
    prof = _profile_dict()
    png = _tiny_png_bytes()
    claim, reason = resolve_anime_claim(
        profile=prof,
        lane=LANE_STRUCTURE_ONLY,
        polish_backend=BACKEND_NONE,
        beauty_bytes=png,
        structure_bytes=png,
        profile_issues=[],
    )
    assert claim is False
    assert "structure-only" in reason


def test_resolve_anime_claim_deny_identity_beauty_pixels():
    prof = _profile_dict()
    png = _tiny_png_bytes()
    claim, reason = resolve_anime_claim(
        profile=prof,
        lane=LANE_BEAUTY,
        polish_backend=BACKEND_CEL_PROXY,
        beauty_bytes=png,
        structure_bytes=png,
        profile_issues=[],
    )
    assert claim is False
    assert "identical to structure" in reason


def test_resolve_anime_claim_allow_validated_profile_plus_beauty():
    prof = _profile_dict()
    png = _tiny_png_bytes((10, 20, 30))
    beauty = apply_cel_proxy_png(png, prof)
    claim, reason = resolve_anime_claim(
        profile=prof,
        lane=LANE_BEAUTY,
        polish_backend=BACKEND_CEL_PROXY,
        beauty_bytes=beauty,
        structure_bytes=png,
        profile_issues=validate_anime_world_profile(prof),
    )
    assert claim is True
    assert "allow:" in reason
    assert prof["profileId"] in reason
    assert BACKEND_CEL_PROXY in reason


def test_run_beauty_stage_invalid_profile_cannot_claim(monkeypatch):
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    png = _tiny_png_bytes()
    bad = _invalid_profile_dict()
    issues = validate_anime_world_profile(bad)
    beauty, lane, backend, claim, detail = run_beauty_stage(
        structure_png=png,
        profile=bad,
        painter_pref="cel-proxy",
        allow_cel_proxy=True,
        probe_map={},
        profile_issues=issues,
    )
    assert claim is False
    assert lane == LANE_STRUCTURE_ONLY
    assert backend == BACKEND_NONE
    assert beauty == png
    assert "fail-closed" in detail


def test_run_pipeline_rejects_invalid_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("GENBLAZE_PROBE_LIVE", "0")
    monkeypatch.setattr(
        "app.constitutional_anime_render.probe_painters", lambda live=None: []
    )
    bad_path = tmp_path / "bad-profile.json"
    bad_path.write_text(json.dumps(_invalid_profile_dict()), encoding="utf-8")
    struct = tmp_path / "in-structure.png"
    struct.write_bytes(_tiny_png_bytes())
    args = _pipeline_args(
        tmp_path,
        structure=str(struct),
        profile=str(bad_path),
        painter="cel-proxy",
        no_cel_proxy=False,
    )
    try:
        run_pipeline(args)
        raise AssertionError("expected ValueError for invalid profile")
    except ValueError as exc:
        assert "fail-closed" in str(exc)
        assert "anime_claim" in str(exc)
