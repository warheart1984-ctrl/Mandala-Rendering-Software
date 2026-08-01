"""Constitutional Anime Render pipeline CLI (partial).

Stages:
  1) Structure plate (Engine3D soft-raster / provided PNG / continuity reuse)
   2) Anime painter (fal | hfspace | lemonade probe | local cel-proxy) or structure-only
  3) Continuity + provenance report

Drive-G-1:
  - Never claim anime polish when painter failed.
  - Never commit secrets; fail closed on missing keys.
  - Diffusion beauty is assist — not Digital Printer / Full Photoreal SoT.
  - Painter probes make live availability calls by default; set
    GENBLAZE_PROBE_LIVE=0 for key-presence-only classification (offline).

Usage:
  python -m app.constitutional_anime_render --out-dir ../../../tmp/constitutional-anime-render-v1
  npm run render:constitutional-anime
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.anime_world_profile import (
    SCHEMA_VERSION,
    default_example_path,
    load_anime_world_profile,
    validate_anime_world_profile,
)
from app.config import _load_dotenv_files, resolve_repo_root
from app.style_steer import ANIME_STEER_SUFFIX, apply_style_steer

# Match the app's canonical env source (repo-root .env then app-local .env,
# override=False so process env / test monkeypatches win).
_load_dotenv_files()

PIPELINE_ID = "constitutional-anime-render"
PIPELINE_VERSION = "1.0.0"
QUOTE_PRIMARY = (
    "The first Constitutional Anime Render: governed style, "
    "deterministic replay, 4D geometry."
)
QUOTE_SECONDARY = "I want a real anime renderer"

LANE_STRUCTURE = "structure"
LANE_BEAUTY = "beauty"
LANE_STRUCTURE_ONLY = "structure-only"

BACKEND_NONE = "none"
BACKEND_CEL_PROXY = "cel-proxy"
BACKEND_FAL = "fal"
BACKEND_LEMONADE = "lemonade"
BACKEND_NVIDIA = "nvidia"
BACKEND_HFSPACE = "hfspace"
BACKEND_GMICLOUD = "gmicloud"


def _repo_root() -> Path:
    # Monorepo checkout vs Docker /app shallow layout (see config.resolve_repo_root).
    return resolve_repo_root()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


@dataclass
class PainterProbe:
    backend: str
    configured: bool
    reachable: bool | None
    operational: bool | None
    verified: bool
    last_verified: str | None
    detail: str
    env_vars_required: list[str] = field(default_factory=list)

    @property
    def available(self) -> bool:
        """Run gate: live-verified operational, else configured (best effort).

        ``available`` is an internal scheduling hint, not a claim. The public
        report is the three-state ``configured`` / ``reachable`` / ``operational``
        plus ``verified`` and ``last_verified`` timestamps.
        """
        if self.verified:
            return bool(self.operational)
        return self.configured


@dataclass
class StageResult:
    stage: str
    status: str
    detail: str
    artifacts: dict[str, Any] = field(default_factory=dict)


@dataclass
class RenderManifest:
    schemaVersion: str
    kind: str
    pipeline_version: str
    anime_world_profile_id: str
    anime_world_profile_version: str
    style: str
    structure_source: str
    lane: str
    polish_backend: str
    anime_claim: bool
    path_kind: str
    structure_sha256: str
    beauty_sha256: str | None
    provenance_hash: str
    intentId: str
    worldId: str
    timelineId: str
    assertion: str
    painter_probes: list[dict[str, Any]]
    stages: list[dict[str, Any]]
    statusTags: dict[str, str]
    nonClaims: list[str]
    created_at: str
    quotes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _env_live() -> bool:
    """Whether painter probes should make live calls.

    Defaults to live (reality checks). Set ``GENBLAZE_PROBE_LIVE=0`` to fall back
    to key-presence classification (offline CI, no per-probe cost/latency).
    """
    return (os.getenv("GENBLAZE_PROBE_LIVE") or "").strip().lower() not in {
        "0",
        "false",
        "off",
        "no",
    }


def _polish_enabled() -> bool:
    flag = (os.getenv("GENBLAZE_POLISH_ENABLED") or "").strip().lower()
    return flag in {"1", "true", "yes", "on"}


def probe_fal(live: bool | None = None) -> PainterProbe:
    live = _env_live() if live is None else live
    key = (
        (os.getenv("FAL_KEY") or "").strip()
        or (os.getenv("FAL_API_KEY") or "").strip()
        or (os.getenv("SEEDANCE_API_KEY") or "").strip()
    )
    if not key:
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="missing FAL_KEY / FAL_API_KEY / SEEDANCE_API_KEY",
            env_vars_required=["FAL_KEY", "FAL_API_KEY", "SEEDANCE_API_KEY"],
        )
    if not _polish_enabled():
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail=(
                "GENBLAZE_POLISH_ENABLED not enabled (fail closed); "
                "key present but policy gate off"
            ),
            env_vars_required=["FAL_KEY"],
        )
    if not live:
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled via GENBLAZE_PROBE_LIVE=0)",
            env_vars_required=["FAL_KEY"],
        )
    try:
        import httpx

        payload = {
            "prompt": "constitutional painter probe",
            "width": 768,
            "height": 768,
            "num_images": 1,
        }
        headers = {
            "Authorization": f"Key {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                "https://fal.run/fal-ai/flux/schnell",
                json=payload,
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=f"fal: unreachable ({type(exc).__name__}: {exc})",
            env_vars_required=["FAL_KEY"],
        )
    if resp.status_code == 200:
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=True,
            reachable=True,
            operational=True,
            verified=True,
            last_verified=_utc_now(),
            detail="fal: live auth + generation ok (HTTP 200)",
            env_vars_required=["FAL_KEY"],
        )
    if resp.status_code == 401:
        return PainterProbe(
            backend=BACKEND_FAL,
            configured=True,
            reachable=True,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=(
                "fal: invalid/dead key (HTTP 401): "
                f"{resp.text[:120]}"
            ),
            env_vars_required=["FAL_KEY"],
        )
    return PainterProbe(
        backend=BACKEND_FAL,
        configured=True,
        reachable=True,
        operational=False,
        verified=True,
        last_verified=_utc_now(),
        detail=f"fal: upstream error (HTTP {resp.status_code}): {resp.text[:120]}",
        env_vars_required=["FAL_KEY"],
    )


def probe_lemonade(live: bool | None = None) -> PainterProbe:
    live = _env_live() if live is None else live
    base = (os.getenv("LEMONADE_BASE_URL") or "http://127.0.0.1:13305/api/v1").rstrip(
        "/"
    )
    if not live:
        return PainterProbe(
            backend=BACKEND_LEMONADE,
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled via GENBLAZE_PROBE_LIVE=0)",
            env_vars_required=["LEMONADE_BASE_URL"],
        )
    try:
        import httpx

        with httpx.Client(timeout=20.0) as client:
            reachable = None
            for url in (f"{base}/models", f"{base}/health"):
                try:
                    resp = client.get(url)
                    if resp.status_code < 500:
                        reachable = url
                        break
                except Exception:  # noqa: BLE001
                    continue
            if reachable is None:
                return PainterProbe(
                    backend=BACKEND_LEMONADE,
                    configured=True,
                    reachable=False,
                    operational=False,
                    verified=True,
                    last_verified=_utc_now(),
                    detail=f"lemonade: unreachable at {base}",
                    env_vars_required=["LEMONADE_BASE_URL"],
                )
            payload = {
                "model": os.getenv("LEMONADE_MODEL") or "SD-Turbo",
                "prompt": "constitutional painter probe",
                "size": "512x512",
                "steps": 4,
                "response_format": "b64_json",
            }
            headers = {"Content-Type": "application/json"}
            api_key = (os.getenv("LEMONADE_API_KEY") or "").strip()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            try:
                gen = client.post(
                    f"{base}/images/generations",
                    json=payload,
                    headers=headers,
                )
            except Exception as exc:  # noqa: BLE001
                return PainterProbe(
                    backend=BACKEND_LEMONADE,
                    configured=True,
                    reachable=True,
                    operational=False,
                    verified=True,
                    last_verified=_utc_now(),
                    detail=(
                        "lemonade: generation probe failed "
                        f"({type(exc).__name__}: {exc})"
                    ),
                    env_vars_required=["LEMONADE_BASE_URL"],
                )
            if gen.status_code == 200:
                body = gen.json()
                data = (body.get("data") or [{}])[0]
                if data.get("b64_json"):
                    return PainterProbe(
                        backend=BACKEND_LEMONADE,
                        configured=True,
                        reachable=True,
                        operational=True,
                        verified=True,
                        last_verified=_utc_now(),
                        detail="lemonade: generation ok (HTTP 200)",
                        env_vars_required=["LEMONADE_BASE_URL"],
                    )
                return PainterProbe(
                    backend=BACKEND_LEMONADE,
                    configured=True,
                    reachable=True,
                    operational=False,
                    verified=True,
                    last_verified=_utc_now(),
                    detail="lemonade: generation returned no b64_json",
                    env_vars_required=["LEMONADE_BASE_URL"],
                )
            return PainterProbe(
                backend=BACKEND_LEMONADE,
                configured=True,
                reachable=True,
                operational=False,
                verified=True,
                last_verified=_utc_now(),
                detail=(
                    "lemonade: generation failed (HTTP "
                    f"{gen.status_code}): {gen.text[:200]}"
                ),
                env_vars_required=["LEMONADE_BASE_URL"],
            )
    except Exception as exc:  # noqa: BLE001
        return PainterProbe(
            backend=BACKEND_LEMONADE,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=f"lemonade: {type(exc).__name__}: {exc}",
            env_vars_required=["LEMONADE_BASE_URL"],
        )


def probe_nvidia(live: bool | None = None) -> PainterProbe:
    live = _env_live() if live is None else live
    key = (os.getenv("NVIDIA_API_KEY") or os.getenv("NVIDIA_NIM_API_KEY") or "").strip()
    if not key:
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="missing NVIDIA_API_KEY",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    if not live:
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled via GENBLAZE_PROBE_LIVE=0)",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    try:
        import httpx

        payload = {
            "prompt": "constitutional painter probe",
            "width": 1024,
            "height": 1024,
            "steps": 1,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
                json=payload,
                headers=headers,
            )
    except httpx.TimeoutException:
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail="nvidia: upstream timeout (slow/unreachable)",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    except Exception as exc:  # noqa: BLE001
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=f"nvidia: unreachable ({type(exc).__name__}: {exc})",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    if resp.status_code == 200:
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=True,
            operational=True,
            verified=True,
            last_verified=_utc_now(),
            detail="nvidia: live auth + generation ok (HTTP 200)",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    if resp.status_code in (401, 403):
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=True,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=f"nvidia: invalid key (HTTP {resp.status_code})",
            env_vars_required=["NVIDIA_API_KEY"],
        )
    if resp.status_code in (400, 422):
        return PainterProbe(
            backend=BACKEND_NVIDIA,
            configured=True,
            reachable=True,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=(
                "nvidia: schema reject (HTTP "
                f"{resp.status_code}): {resp.text[:120]}"
            ),
            env_vars_required=["NVIDIA_API_KEY"],
        )
    return PainterProbe(
        backend=BACKEND_NVIDIA,
        configured=True,
        reachable=True,
        operational=False,
        verified=True,
        last_verified=_utc_now(),
        detail=f"nvidia: upstream unavailable (HTTP {resp.status_code})",
        env_vars_required=["NVIDIA_API_KEY"],
    )


def probe_hfspace(live: bool | None = None) -> PainterProbe:
    """Three-state probe for the keyless HF Space img2img lane.

    ``configured`` is keyless (true when the Space URL is set), but fail-closes
    to ``configured=False`` when ``GENBLAZE_POLISH_ENABLED`` is off (policy gate,
    same as :func:`probe_fal`). Live mode checks that the Space responds; it does
    **not** burn ZeroGPU quota on a full infer in the probe (detail notes this).
    """
    live = _env_live() if live is None else live
    url = (os.getenv("GENBLAZE_HFSPACE_URL") or "").strip().rstrip("/") or None
    if not url:
        return PainterProbe(
            backend=BACKEND_HFSPACE,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="missing GENBLAZE_HFSPACE_URL",
            env_vars_required=["GENBLAZE_HFSPACE_URL"],
        )
    if not _polish_enabled():
        return PainterProbe(
            backend=BACKEND_HFSPACE,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail=(
                "GENBLAZE_POLISH_ENABLED not enabled (fail closed); "
                "hfspace is keyless but policy gate off"
            ),
            env_vars_required=["GENBLAZE_HFSPACE_URL"],
        )
    if not live:
        return PainterProbe(
            backend=BACKEND_HFSPACE,
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled via GENBLAZE_PROBE_LIVE=0)",
            env_vars_required=["GENBLAZE_HFSPACE_URL"],
        )
    try:
        import httpx

        with httpx.Client(timeout=20.0) as client:
            resp = client.get(f"{url}/")
    except Exception as exc:  # noqa: BLE001
        return PainterProbe(
            backend=BACKEND_HFSPACE,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=f"hfspace: unreachable ({type(exc).__name__}: {exc})",
            env_vars_required=["GENBLAZE_HFSPACE_URL"],
        )
    if resp.status_code == 200:
        return PainterProbe(
            backend=BACKEND_HFSPACE,
            configured=True,
            reachable=True,
            operational=True,
            verified=True,
            last_verified=_utc_now(),
            detail=(
                "hfspace: space reachable (HTTP 200); infer not exercised by probe "
                "(ZeroGPU cold-start/quota)"
            ),
            env_vars_required=["GENBLAZE_HFSPACE_URL"],
        )
    return PainterProbe(
        backend=BACKEND_HFSPACE,
        configured=True,
        reachable=True,
        operational=False,
        verified=True,
        last_verified=_utc_now(),
        detail=f"hfspace: space responded (HTTP {resp.status_code})",
        env_vars_required=["GENBLAZE_HFSPACE_URL"],
    )


def probe_gmicloud(live: bool | None = None) -> PainterProbe:
    """Three-state probe for GMI Cloud T2I (GenBlaze SDK / hackathon credits).

    Status: **partial** — configured when ``GMI_API_KEY`` is set; live reachability
    requires ``genblaze-gmicloud``. Probe does not burn credits on a full generate.
    """
    live = _env_live() if live is None else live
    key = (os.getenv("GMI_API_KEY") or "").strip()
    if not key:
        return PainterProbe(
            backend=BACKEND_GMICLOUD,
            configured=False,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="missing GMI_API_KEY",
            env_vars_required=["GMI_API_KEY"],
        )
    try:
        from app.gmi_provider import gmi_sdk_available

        sdk_ok = gmi_sdk_available()
    except Exception:  # noqa: BLE001
        sdk_ok = False
    if not sdk_ok:
        return PainterProbe(
            backend=BACKEND_GMICLOUD,
            configured=True,
            reachable=False,
            operational=False,
            verified=True,
            last_verified=_utc_now(),
            detail=(
                "GMI_API_KEY set but genblaze-gmicloud not installed "
                "(pip install genblaze-gmicloud)"
            ),
            env_vars_required=["GMI_API_KEY"],
        )
    if not live:
        return PainterProbe(
            backend=BACKEND_GMICLOUD,
            configured=True,
            reachable=None,
            operational=None,
            verified=False,
            last_verified=None,
            detail="configured (live probe disabled via GENBLAZE_PROBE_LIVE=0)",
            env_vars_required=["GMI_API_KEY"],
        )
    # Key + SDK present — mark operational without a billed generate.
    return PainterProbe(
        backend=BACKEND_GMICLOUD,
        configured=True,
        reachable=True,
        operational=True,
        verified=True,
        last_verified=_utc_now(),
        detail=(
            "gmicloud: key+SDK present; live T2I not exercised by probe "
            "(credits spend on generate)"
        ),
        env_vars_required=["GMI_API_KEY"],
    )


def probe_painters(live: bool | None = None) -> list[PainterProbe]:
    return [
        probe_fal(live),
        probe_hfspace(live),
        probe_gmicloud(live),
        probe_lemonade(live),
        probe_nvidia(live),
    ]


def build_assertion(
    *,
    profile_id: str,
    profile_version: str,
    structure_source: str,
    polish_backend: str,
    provenance_hash: str,
) -> str:
    polish = polish_backend if polish_backend != BACKEND_NONE else "structure-only"
    return (
        f"Rendered under AnimeWorldProfile v{profile_version} ({profile_id}), "
        f"structure from {structure_source}, polished by {polish}, "
        f"provenance hash {provenance_hash[:16]}…"
    )


def resolve_anime_claim(
    *,
    profile: dict[str, Any] | None,
    lane: str,
    polish_backend: str,
    beauty_bytes: bytes | None,
    structure_bytes: bytes | None = None,
    profile_issues: list[str] | None = None,
) -> tuple[bool, str]:
    """Fail-closed Genblaze gate for ``anime_claim`` (CKL policy remains declared).

    ``anime_claim: true`` is allowed only when:
      1) AnimeWorldProfile validates and exposes a non-empty ``profileId``
      2) beauty lane produced polish pixels (not structure-only / identity copy)

    Returns ``(anime_claim, reason)``.
    """
    if profile is None:
        return False, "deny: missing AnimeWorldProfile"
    issues = (
        list(profile_issues)
        if profile_issues is not None
        else validate_anime_world_profile(profile)
    )
    profile_id = str(profile.get("profileId") or "").strip()
    if not profile_id:
        return False, "deny: missing anime_world_profile_id"
    if issues:
        preview = "; ".join(issues[:3])
        return False, f"deny: AnimeWorldProfile invalid ({preview})"
    if lane == LANE_STRUCTURE_ONLY or polish_backend == BACKEND_NONE:
        return False, "deny: structure-only / no beauty pixels"
    if lane != LANE_BEAUTY:
        return False, f"deny: lane `{lane}` is not beauty"
    if not beauty_bytes:
        return False, "deny: beauty pixels absent"
    if structure_bytes is not None and beauty_bytes == structure_bytes:
        return False, "deny: beauty pixels identical to structure (no polish)"
    return (
        True,
        f"allow: validated profile `{profile_id}` + beauty via `{polish_backend}`",
    )


def apply_cel_proxy_png(structure_png: bytes, profile: dict[str, Any]) -> bytes:
    """Local cel banding + crude ink — always-available partial beauty backend.

    Does not claim diffusion anime. Deterministic for identical inputs.
    """
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Pillow required for cel-proxy") from exc

    import io

    img = Image.open(io.BytesIO(structure_png)).convert("RGBA")
    width, height = img.size

    shadows = profile.get("shadow_steps") or {}
    boundaries = shadows.get("boundaries") or [0.3, 0.7]
    levels = shadows.get("levels") or [0.18, 0.62, 1.0]
    b0 = float(boundaries[0]) if boundaries else 0.3
    b1 = float(boundaries[1]) if len(boundaries) > 1 else 0.7
    l0, l1, l2 = float(levels[0]), float(levels[1]), float(levels[2] if len(levels) > 2 else 1.0)

    outlines = profile.get("outline_rules") or {}
    ink_strength = float(outlines.get("inkStrength") or 0.0)
    ink_color = outlines.get("inkColor") or [0.05, 0.05, 0.08]
    ink_rgb = tuple(int(max(0, min(1, float(c))) * 255) for c in ink_color[:3])

    # Luminance banding
    banded: list[tuple[int, int, int, int]] = []
    lum_map: list[float] = []
    raw = img.tobytes()
    for i in range(width * height):
        o = i * 4
        r, g, b = raw[o], raw[o + 1], raw[o + 2]
        rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
        lum = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf
        lum_map.append(lum)
        band = l2
        if lum < b0:
            band = l0
        elif lum < b1:
            band = l1
        scale = band / lum if lum > 1e-6 else band
        banded.append(
            (
                max(0, min(255, int(round(rf * scale * 255)))),
                max(0, min(255, int(round(gf * scale * 255)))),
                max(0, min(255, int(round(bf * scale * 255)))),
                255,
            )
        )

    # Edge ink from luminance jumps (cheap silhouette proxy)
    if ink_strength > 0 and width > 2 and height > 2:
        out = list(banded)
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                i = y * width + x
                neighbors = (
                    lum_map[i - 1],
                    lum_map[i + 1],
                    lum_map[i - width],
                    lum_map[i + width],
                )
                if max(abs(lum_map[i] - n) for n in neighbors) > 0.12:
                    r, g, b, _ = out[i]
                    t = ink_strength
                    out[i] = (
                        int(r * (1 - t) + ink_rgb[0] * t),
                        int(g * (1 - t) + ink_rgb[1] * t),
                        int(b * (1 - t) + ink_rgb[2] * t),
                        255,
                    )
        banded = out

    out_img = Image.new("RGBA", (width, height))
    out_img.putdata(banded)
    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    return buf.getvalue()


def resolve_structure_plate(
    *,
    out_dir: Path,
    structure_path: Path | None,
    structure_source_pref: str,
    allow_continuity_reuse: bool,
    run_engine3d: bool,
) -> tuple[Path, str, StageResult]:
    """Return (structure_png_path, structure_source, stage_result)."""
    dest = out_dir / "structure.png"

    if structure_path is not None:
        if not structure_path.is_file():
            raise FileNotFoundError(f"structure plate not found: {structure_path}")
        shutil.copy2(structure_path, dest)
        return (
            dest,
            structure_source_pref or "provided",
            StageResult(
                stage="1-structure",
                status="ok",
                detail=f"copied provided structure from {structure_path}",
                artifacts={"structure_png": str(dest)},
            ),
        )

    continuity = (
        _repo_root()
        / "tmp"
        / "constitutional-anime-continuity-5shot"
        / "shots"
        / "shot-04-transform"
        / "beauty.png"
    )
    if allow_continuity_reuse and continuity.is_file():
        shutil.copy2(continuity, dest)
        return (
            dest,
            "engine3d",
            StageResult(
                stage="1-structure",
                status="ok",
                detail=(
                    "reused Engine3D continuity shot-04-transform beauty as structure "
                    "(4D-portal transform plate)"
                ),
                artifacts={
                    "structure_png": str(dest),
                    "source": str(continuity),
                },
            ),
        )

    if run_engine3d:
        pkg = _repo_root() / "mrs" / "packages" / "engine3d-core"
        tmp_cont = out_dir / "_structure_continuity"
        cmd = [
            "npm",
            "run",
            "render:anime-continuity-5shot",
            "--",
            f"--out-dir={tmp_cont}",
        ]
        try:
            subprocess.run(
                cmd,
                cwd=str(pkg),
                check=True,
                capture_output=True,
                text=True,
                timeout=600,
            )
            produced = tmp_cont / "shots" / "shot-04-transform" / "beauty.png"
            if not produced.is_file():
                raise FileNotFoundError("engine3d continuity did not produce shot-04 beauty")
            shutil.copy2(produced, dest)
            return (
                dest,
                "engine3d",
                StageResult(
                    stage="1-structure",
                    status="ok",
                    detail="rendered Engine3D continuity cycle; used shot-04 as structure",
                    artifacts={"structure_png": str(dest), "continuity_dir": str(tmp_cont)},
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Engine3D structure render failed ({exc}). "
                "Provide --structure PATH or pre-run continuity 5-shot."
            ) from exc

    raise RuntimeError(
        "No structure plate available. Pass --structure, enable --run-engine3d, "
        "or pre-generate tmp/constitutional-anime-continuity-5shot/."
    )


def try_fal_polish(structure_png: bytes, prompt: str) -> tuple[bytes | None, str]:
    key = (
        (os.getenv("FAL_KEY") or "").strip()
        or (os.getenv("FAL_API_KEY") or "").strip()
        or (os.getenv("SEEDANCE_API_KEY") or "").strip()
    )
    if not key:
        return None, "fal: missing key"
    polish_flag = (os.getenv("GENBLAZE_POLISH_ENABLED") or "").strip().lower()
    if polish_flag not in {"1", "true", "yes", "on"}:
        return None, "fal: GENBLAZE_POLISH_ENABLED not set (fail closed)"

    try:
        from app.image_polish import PolishError, _fal_img2img

        pixels = _fal_img2img(key, structure_png, prompt, strength=0.45)
        return pixels, "fal: img2img ok"
    except PolishError as exc:
        return None, f"fal: polish error ({exc})"
    except Exception as exc:  # noqa: BLE001
        return None, f"fal: {type(exc).__name__}: {exc}"


def try_lemonade_t2i(prompt: str) -> tuple[bytes | None, str]:
    """Best-effort Lemonade T2I (not true img2img) — label honestly if used."""
    probe = probe_lemonade()
    if not probe.available:
        return None, f"lemonade: {probe.detail}"
    try:
        import base64

        import httpx

        base = (os.getenv("LEMONADE_BASE_URL") or "http://127.0.0.1:13305/api/v1").rstrip(
            "/"
        )
        payload = {
            "model": os.getenv("LEMONADE_MODEL") or "SD-Turbo",
            "prompt": prompt,
            "size": "512x512",
            "steps": 4,
            "response_format": "b64_json",
        }
        headers = {"Content-Type": "application/json"}
        api_key = (os.getenv("LEMONADE_API_KEY") or "").strip()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(f"{base}/images/generations", json=payload, headers=headers)
        if resp.status_code != 200:
            return None, f"lemonade: HTTP {resp.status_code} {resp.text[:200]}"
        body = resp.json()
        data = (body.get("data") or [{}])[0]
        b64 = data.get("b64_json")
        if not b64:
            return None, "lemonade: no b64_json (sd-server may be down)"
        return base64.b64decode(b64), "lemonade: t2i ok (not img2img — structure not preserved)"
    except Exception as exc:  # noqa: BLE001
        return None, f"lemonade: {type(exc).__name__}: {exc}"


def try_hfspace_polish(structure_png: bytes, prompt: str) -> tuple[bytes | None, str]:
    """Keyless HF Space img2img — free fallback leg (quota-capped, best-effort)."""
    polish_flag = (os.getenv("GENBLAZE_POLISH_ENABLED") or "").strip().lower()
    if polish_flag not in {"1", "true", "yes", "on"}:
        return None, "hfspace: GENBLAZE_POLISH_ENABLED not set (fail closed)"
    try:
        from app.image_polish import PolishError, _hfspace_img2img

        pixels = _hfspace_img2img(structure_png, prompt, strength=0.45)
        return pixels, "hfspace: img2img ok (keyless HF Space fallback)"
    except PolishError as exc:
        return None, f"hfspace: polish error ({exc})"
    except Exception as exc:  # noqa: BLE001
        return None, f"hfspace: {type(exc).__name__}: {exc}"


def try_gmicloud_t2i(prompt: str) -> tuple[bytes | None, str]:
    """GMI Cloud text→image via GenBlaze SDK — does **not** preserve structure.

    Label honestly: T2I is not img2img. Prefer fal/hfspace when structure lock
    matters. Status: **partial** (needs ``GMI_API_KEY`` + ``genblaze-gmicloud``).
    """
    try:
        from app.config import get_settings
        from app.gmi_provider import GmiError, GmiNotConfiguredError, generate_image_gmi

        settings = get_settings()
        result = generate_image_gmi(settings, prompt)
        if not result.image_bytes:
            return None, f"gmicloud: empty image ({result.detail or 'no bytes'})"
        return (
            result.image_bytes,
            "gmicloud: t2i ok (not img2img — structure not preserved)",
        )
    except GmiNotConfiguredError as exc:
        return None, f"gmicloud: not configured ({exc})"
    except GmiError as exc:
        return None, f"gmicloud: generate error ({exc})"
    except Exception as exc:  # noqa: BLE001
        return None, f"gmicloud: {type(exc).__name__}: {exc}"


def run_beauty_stage(
    *,
    structure_png: bytes,
    profile: dict[str, Any],
    painter_pref: str,
    allow_cel_proxy: bool,
    probe_map: dict[str, PainterProbe] | None = None,
    profile_issues: list[str] | None = None,
) -> tuple[bytes, str, str, bool, str]:
    """Return (beauty_bytes, lane, backend, anime_claim, detail).

    ``anime_claim`` is fail-closed via :func:`resolve_anime_claim` — never true
    without a validated profile id and distinct beauty pixels.
    """
    palette = (profile.get("color_palette") or {}).get("roles") or {}
    palette_hint = ", ".join(f"{k} {v}" for k, v in list(palette.items())[:5])
    base_prompt = (
        f"constitutional anime still, mandala cel profile {profile.get('profileId')}, "
        f"palette {palette_hint}, clean line art, cel-shaded, 4D portal geometry preserved"
    )
    steered, _ = apply_style_steer(base_prompt, "anime")
    if ANIME_STEER_SUFFIX not in steered:
        steered = f"{steered}, {ANIME_STEER_SUFFIX}"

    probes = (
        probe_map
        if probe_map is not None
        else {p.backend: p for p in probe_painters()}
    )
    order: list[str]
    if painter_pref == "auto":
        # Live polish order: fal → hfspace → gmicloud → lemonade → cel-proxy
        order = [
            BACKEND_FAL,
            BACKEND_HFSPACE,
            BACKEND_GMICLOUD,
            BACKEND_LEMONADE,
            BACKEND_CEL_PROXY,
        ]
    elif painter_pref == BACKEND_NONE:
        order = []
    else:
        order = [painter_pref]

    details: list[str] = []
    beauty_bytes: bytes = structure_png
    lane: str = LANE_STRUCTURE_ONLY
    backend: str = BACKEND_NONE
    for candidate in order:
        probe = probes.get(candidate)
        if candidate == BACKEND_FAL:
            if probe is None or not probe.available:
                details.append(probe.detail if probe else "fal: not probed")
                continue
            pixels, detail = try_fal_polish(structure_png, steered)
            details.append(detail)
            if pixels:
                beauty_bytes, lane, backend = pixels, LANE_BEAUTY, BACKEND_FAL
                break
        elif candidate == BACKEND_HFSPACE:
            if probe is None or not probe.available:
                details.append(probe.detail if probe else "hfspace: not probed")
                continue
            pixels, detail = try_hfspace_polish(structure_png, steered)
            details.append(detail)
            if pixels:
                # img2img preserves structure (like fal); claim on gate only.
                beauty_bytes, lane, backend = pixels, LANE_BEAUTY, BACKEND_HFSPACE
                break
        elif candidate == BACKEND_GMICLOUD:
            if probe is None or not probe.available:
                details.append(probe.detail if probe else "gmicloud: not probed")
                continue
            pixels, detail = try_gmicloud_t2i(steered)
            details.append(detail)
            if pixels:
                # T2I does not preserve structure — claim only if gate allows.
                beauty_bytes, lane, backend = pixels, LANE_BEAUTY, BACKEND_GMICLOUD
                break
        elif candidate == BACKEND_LEMONADE:
            if probe is None or not probe.available:
                details.append(probe.detail if probe else "lemonade: not probed")
                continue
            pixels, detail = try_lemonade_t2i(steered)
            details.append(detail)
            if pixels:
                # T2I does not preserve structure — claim only if gate allows.
                beauty_bytes, lane, backend = pixels, LANE_BEAUTY, BACKEND_LEMONADE
                break
        elif candidate == BACKEND_CEL_PROXY:
            if not allow_cel_proxy:
                details.append("cel-proxy disabled")
                continue
            beauty_bytes = apply_cel_proxy_png(structure_png, profile)
            lane, backend = LANE_BEAUTY, BACKEND_CEL_PROXY
            details.append(
                "cel-proxy: local banding+ink (partial anime; not diffusion)"
            )
            break

    anime_claim, gate_reason = resolve_anime_claim(
        profile=profile,
        lane=lane,
        polish_backend=backend,
        beauty_bytes=beauty_bytes,
        structure_bytes=structure_png,
        profile_issues=profile_issues,
    )
    if not anime_claim and lane == LANE_BEAUTY:
        # Painter ran but claim denied (invalid profile / identity pixels) —
        # relabel as structure-only so manifests stay honest.
        lane = LANE_STRUCTURE_ONLY
        backend = BACKEND_NONE
        beauty_bytes = structure_png
        detail = f"structure-only fail-closed ({gate_reason})"
        return beauty_bytes, lane, backend, False, detail

    if anime_claim:
        painter_detail = details[-1] if details else gate_reason
        return beauty_bytes, lane, backend, True, f"{painter_detail} | {gate_reason}"

    detail = " | ".join(details) if details else "painter skipped"
    return (
        structure_png,
        LANE_STRUCTURE_ONLY,
        BACKEND_NONE,
        False,
        f"structure-only fallback ({detail}) | {gate_reason}",
    )


def write_readme(
    out_dir: Path,
    *,
    manifest: RenderManifest,
    visual_note: str,
) -> None:
    lines = [
        "# Constitutional Anime Render v1",
        "",
        f"> {QUOTE_PRIMARY}",
        f"> {QUOTE_SECONDARY}",
        "",
        "## Assertion",
        "",
        manifest.assertion,
        "",
        "## Status",
        "",
        f"- Lane: `{manifest.lane}`",
        f"- Structure source: `{manifest.structure_source}`",
        f"- Polish backend: `{manifest.polish_backend}`",
        f"- Anime claim: `{manifest.anime_claim}`",
        f"- Profile: `{manifest.anime_world_profile_id}` v{manifest.anime_world_profile_version}",
        "",
        "## Status tags",
        "",
    ]
    for k, v in manifest.statusTags.items():
        lines.append(f"- `{k}`: **{v}**")
    lines.extend(
        [
            "",
            "## Visual note",
            "",
            visual_note,
            "",
            "## Re-run",
            "",
            "```bash",
            "cd mrs/apps/genblaze-media",
            "python -m app.constitutional_anime_render --out-dir ../../../tmp/constitutional-anime-render-v1",
            "# or from repo root:",
            "npm run render:constitutional-anime",
            "```",
            "",
            "## Non-claims",
            "",
        ]
    )
    for nc in manifest.nonClaims:
        lines.append(f"- {nc}")
    lines.append("")
    (out_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def run_pipeline(args: argparse.Namespace) -> RenderManifest:
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    profile_path = Path(args.profile).resolve() if args.profile else default_example_path()
    profile = load_anime_world_profile(profile_path)
    issues = validate_anime_world_profile(profile)
    profile_id = str(profile.get("profileId") or "").strip()
    if not profile_id or issues:
        raise ValueError(
            "AnimeWorldProfile invalid or missing profileId "
            f"(fail-closed; cannot emit anime_claim): issues={issues or ['missing:profileId']}"
        )

    stages: list[StageResult] = []
    stages.append(
        StageResult(
            stage="0-profile",
            status="ok",
            detail=f"validated {profile_id} ({len(issues)} issues)",
            artifacts={
                "profile_path": str(profile_path),
                "anime_world_profile_id": profile_id,
            },
        )
    )

    structure_file, structure_source, stage1 = resolve_structure_plate(
        out_dir=out_dir,
        structure_path=Path(args.structure).resolve() if args.structure else None,
        structure_source_pref=args.structure_source,
        allow_continuity_reuse=not args.no_reuse_continuity,
        run_engine3d=bool(args.run_engine3d),
    )
    stages.append(stage1)
    structure_bytes = structure_file.read_bytes()
    structure_sha = _sha256_bytes(structure_bytes)

    probes = probe_painters(live=args.painter != BACKEND_NONE)

    beauty_bytes, lane, backend, anime_claim, beauty_detail = run_beauty_stage(
        structure_png=structure_bytes,
        profile=profile,
        painter_pref=args.painter,
        allow_cel_proxy=not args.no_cel_proxy,
        probe_map={p.backend: p for p in probes},
        profile_issues=issues,
    )
    # Final fail-closed re-check before any manifest write.
    anime_claim, claim_gate_reason = resolve_anime_claim(
        profile=profile,
        lane=lane,
        polish_backend=backend,
        beauty_bytes=beauty_bytes,
        structure_bytes=structure_bytes,
        profile_issues=issues,
    )
    if not anime_claim and lane == LANE_BEAUTY:
        lane = LANE_STRUCTURE_ONLY
        backend = BACKEND_NONE
        beauty_bytes = structure_bytes
        beauty_detail = f"structure-only fail-closed ({claim_gate_reason})"

    beauty_path = out_dir / ("beauty.png" if anime_claim else "structure-only.png")
    # Always also write final.png for a stable viewer path
    final_path = out_dir / "final.png"
    beauty_path.write_bytes(beauty_bytes)
    final_path.write_bytes(beauty_bytes)
    beauty_sha = _sha256_bytes(beauty_bytes)
    stages.append(
        StageResult(
            stage="2-beauty",
            status="ok" if anime_claim else "structure-only",
            detail=beauty_detail,
            artifacts={
                "lane": lane,
                "polish_backend": backend,
                "anime_claim": anime_claim,
                "anime_claim_gate": claim_gate_reason,
                "anime_world_profile_id": profile_id,
                "beauty_png": str(beauty_path),
                "final_png": str(final_path),
            },
        )
    )

    # Stage 3 — continuity / provenance (hash freeze + dual compare if replay file given)
    intent_id = args.intent_id or f"intent.constitutional-anime.{PIPELINE_VERSION}"
    world_id = args.world_id or "world.mandala-cel.v1"
    timeline_id = args.timeline_id or "timeline.constitutional-anime.demo.v1"
    provenance_payload = {
        "profileId": profile["profileId"],
        "schemaVersion": profile["schemaVersion"],
        "structure_source": structure_source,
        "structure_sha256": structure_sha,
        "beauty_sha256": beauty_sha,
        "lane": lane,
        "polish_backend": backend,
        "intentId": intent_id,
        "worldId": world_id,
        "timelineId": timeline_id,
    }
    provenance_hash = _sha256_bytes(
        json.dumps(provenance_payload, sort_keys=True).encode("utf-8")
    )
    continuity_ok = structure_sha == beauty_sha if not anime_claim else True
    if backend == BACKEND_CEL_PROXY:
        # Cel-proxy transforms pixels deterministically — re-run to verify.
        replay = apply_cel_proxy_png(structure_bytes, profile)
        continuity_ok = _sha256_bytes(replay) == beauty_sha

    stages.append(
        StageResult(
            stage="3-continuity-provenance",
            status="ok" if continuity_ok else "gap",
            detail=(
                "cel-proxy dual-apply hash match"
                if backend == BACKEND_CEL_PROXY and continuity_ok
                else (
                    "structure-only identity hash"
                    if lane == LANE_STRUCTURE_ONLY
                    else "provenance logged (diffusion replay declared)"
                )
            ),
            artifacts={
                "provenance_hash": provenance_hash,
                "continuity_ok": continuity_ok,
            },
        )
    )

    probes = [asdict(p) for p in probes]
    assertion = build_assertion(
        profile_id=str(profile["profileId"]),
        profile_version=str(profile.get("schemaVersion") or SCHEMA_VERSION),
        structure_source=structure_source.upper() if structure_source in {"rt4d", "engine3d"} else structure_source,
        polish_backend=backend,
        provenance_hash=provenance_hash,
    )

    status_tags = {
        "pipeline": "partial",
        "profile": "partial",
        "structure_lane": "partial",
        "beauty_lane": (
            "partial"
            if anime_claim and backend == BACKEND_CEL_PROXY
            else ("partial" if anime_claim else "blocked")
        ),
        "anime_claim_gate": "enforced",
        "cel_proxy_replay": "enforced" if backend == BACKEND_CEL_PROXY and continuity_ok else "n/a",
        "diffusion_replay": "declared",
        "ckl_gate": "declared",
        "photoreal": "non-claim",
        "digital_printer_sot": "non-claim",
    }

    structure_label = {
        "engine3d": "Engine3D",
        "rt4d": "RT4D",
    }.get(structure_source, structure_source)

    manifest = RenderManifest(
        schemaVersion="1.0.0",
        kind=PIPELINE_ID,
        pipeline_version=PIPELINE_VERSION,
        anime_world_profile_id=str(profile["profileId"]),
        anime_world_profile_version=str(profile.get("schemaVersion") or SCHEMA_VERSION),
        style="anime",
        structure_source=structure_source,
        lane=lane,
        polish_backend=backend,
        anime_claim=anime_claim,
        path_kind=lane,
        structure_sha256=structure_sha,
        beauty_sha256=beauty_sha,
        provenance_hash=provenance_hash,
        intentId=intent_id,
        worldId=world_id,
        timelineId=timeline_id,
        assertion=assertion.replace(
            f"structure from {structure_source}",
            f"structure from {structure_label}",
        )
        if structure_source in {"engine3d", "rt4d"}
        else assertion,
        painter_probes=probes,
        stages=[asdict(s) for s in stages],
        statusTags=status_tags,
        nonClaims=[
            "Not Full Photoreal",
            "Not Digital Printer beauty SoT",
            "Not CKL-enforced shot gate (Genblaze anime_claim_gate is unit-tested; CKL policy remains declared)",
            "Diffusion beauty replay remains declared unless seed-stable tests pass",
            "Lemonade SD may be blocked when sd-server / pixelsProduced is false",
        ],
        created_at=_utc_now(),
        quotes=[QUOTE_PRIMARY, QUOTE_SECONDARY],
    )

    # Persist profile copy + reports
    shutil.copy2(profile_path, out_dir / "anime-world-profile.json")
    (out_dir / "render-manifest.json").write_text(
        json.dumps(manifest.to_dict(), indent=2), encoding="utf-8"
    )
    (out_dir / "provenance-report.json").write_text(
        json.dumps(
            {
                **provenance_payload,
                "assertion": manifest.assertion,
                "continuity_ok": continuity_ok,
                "painter_probes": probes,
                "stages": [asdict(s) for s in stages],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    visual_note = (
        "Cel-proxy plate: stepped shadows + silhouette ink over Engine3D soft-raster. "
        "Reads as governed stylization, not studio-finished anime diffusion."
        if backend == BACKEND_CEL_PROXY
        else (
            "Structure-only: soft-raster geometry without painter — do not market as anime still."
            if not anime_claim
            else f"Beauty backend `{backend}` produced pixels — verify look vs profile manually."
        )
    )
    write_readme(out_dir, manifest=manifest, visual_note=visual_note)
    return manifest


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="constitutional-anime-render",
        description="Constitutional Anime Render pipeline (structure → polish → provenance)",
    )
    p.add_argument(
        "--out-dir",
        default=str(_repo_root() / "tmp" / "constitutional-anime-render-v1"),
        help="Output directory",
    )
    p.add_argument(
        "--profile",
        default=None,
        help="AnimeWorldProfile JSON (default: mandala-cel-v1 example)",
    )
    p.add_argument(
        "--structure",
        default=None,
        help="Existing structure PNG (skips Engine3D / continuity reuse)",
    )
    p.add_argument(
        "--structure-source",
        default="engine3d",
        choices=["engine3d", "rt4d", "provided"],
        help="Label for structure source in manifests",
    )
    p.add_argument(
        "--painter",
        default="auto",
        choices=[
            "auto",
            "fal",
            "hfspace",
            "gmicloud",
            "lemonade",
            "cel-proxy",
            "none",
        ],
        help=(
            "Beauty backend preference "
            "(auto tries fal→hfspace→gmicloud→lemonade→cel-proxy)"
        ),
    )
    p.add_argument(
        "--no-cel-proxy",
        action="store_true",
        help="Disable local cel-proxy fallback (may yield structure-only)",
    )
    p.add_argument(
        "--no-reuse-continuity",
        action="store_true",
        help="Do not reuse tmp/constitutional-anime-continuity-5shot plates",
    )
    p.add_argument(
        "--run-engine3d",
        action="store_true",
        help="Invoke npm Engine3D continuity runner for structure",
    )
    p.add_argument("--intent-id", default=None)
    p.add_argument("--world-id", default=None)
    p.add_argument("--timeline-id", default=None)
    p.add_argument(
        "--probe-only",
        action="store_true",
        help="Print painter probes + validate profile; do not render",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    if args.probe_only:
        profile_path = Path(args.profile).resolve() if args.profile else default_example_path()
        profile = load_anime_world_profile(profile_path)
        issues = validate_anime_world_profile(profile)
        payload = {
            "profileId": profile.get("profileId"),
            "valid": len(issues) == 0,
            "issues": issues,
            "painter_probes": [asdict(p) for p in probe_painters()],
        }
        print(json.dumps(payload, indent=2))
        return 0 if not issues else 2

    try:
        manifest = run_pipeline(args)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "out_dir": str(Path(args.out_dir).resolve()),
                "lane": manifest.lane,
                "polish_backend": manifest.polish_backend,
                "anime_claim": manifest.anime_claim,
                "assertion": manifest.assertion,
                "provenance_hash": manifest.provenance_hash,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
