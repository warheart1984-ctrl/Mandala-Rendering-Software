"""Environment loading and dual-export for Genblaze B2 + NVIDIA NIM."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent.parent


def resolve_repo_root(app_dir: Path = APP_DIR) -> Path:
    """Locate monorepo root when present; otherwise the app dir (Docker image).

    Local layout: ``<repo>/mrs/apps/genblaze-media`` → parents[2] is repo root.
    Docker layout: app lives at ``/app`` with no monorepo parents — use ``app_dir``.
    """
    try:
        candidate = app_dir.parents[2]
    except IndexError:
        return app_dir
    if (candidate / "mrs" / "apps" / "genblaze-media").is_dir():
        return candidate
    if (candidate / ".git").exists():
        return candidate
    return app_dir


REPO_ROOT = resolve_repo_root()


def _load_dotenv_files() -> list[str]:
    """Load repo-root `.env` then app-local `.env` without clobbering process env.

    Uses override=False so deploy-host / test monkeypatches win over file values.
    On Render, secrets come from the dashboard env — dotenv files are optional.
    """
    loaded: list[str] = []
    seen: set[Path] = set()
    for path in (REPO_ROOT / ".env", APP_DIR / ".env"):
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if path.is_file():
            load_dotenv(path, override=False)
            loaded.append(str(path))
    return loaded


def dual_export_b2_keys() -> None:
    """Genblaze-s3 reads B2_APP_KEY; MRS docs use B2_APPLICATION_KEY. Bridge both."""
    app_key = (os.getenv("B2_APP_KEY") or os.getenv("B2_APPLICATION_KEY") or "").strip()
    if app_key:
        os.environ["B2_APP_KEY"] = app_key
        # Keep APPLICATION_KEY set for @mrs/storage-b2 / npm scripts in same shell.
        if not (os.getenv("B2_APPLICATION_KEY") or "").strip():
            os.environ["B2_APPLICATION_KEY"] = app_key


def dual_export_nvidia_keys() -> None:
    """Bridge NVIDIA_API_KEY with NGC_API_KEY / NVIDIA_NIM_API_KEY aliases."""
    key = (
        os.getenv("NVIDIA_API_KEY")
        or os.getenv("NGC_API_KEY")
        or os.getenv("NVIDIA_NIM_API_KEY")
        or ""
    ).strip()
    if not key:
        return
    os.environ["NVIDIA_API_KEY"] = key
    if not (os.getenv("NGC_API_KEY") or "").strip():
        os.environ["NGC_API_KEY"] = key
    if not (os.getenv("NVIDIA_NIM_API_KEY") or "").strip():
        os.environ["NVIDIA_NIM_API_KEY"] = key


@dataclass(frozen=True)
class Settings:
    """Runtime settings (names only; values come from env)."""

    nvidia_api_key: str | None
    fal_api_key: str | None
    b2_key_id: str | None
    b2_app_key: str | None
    b2_bucket: str
    b2_region: str
    b2_endpoint: str | None
    storage_prefix: str
    image_model: str
    video_model: str
    video_enabled: bool
    video_backend: str
    seedance_model: str
    seedance_resolution: str
    seedance_duration: str
    seedance_aspect_ratio: str
    seedance_generate_audio: bool
    seedance_watermark: bool | None
    embed_model: str
    embed_url: str
    embed_timeout_seconds: float
    store_full_embeddings: bool
    presign_expires_seconds: int
    dry_run: bool
    b2_probe_on_health: bool
    abstract_retry_on_blank: bool
    empty_504_retry: bool
    empty_504_retry_delay_seconds: float
    nvidia_warmup_on_startup: bool
    dotenv_loaded: tuple[str, ...]

    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key)

    @property
    def seedance_configured(self) -> bool:
        return bool(self.fal_api_key)

    @property
    def b2_configured(self) -> bool:
        return bool(self.b2_key_id and self.b2_app_key and self.b2_bucket)

    @property
    def video_available(self) -> bool:
        """Operator can attempt video (flag on + backend credentials, or dry-run)."""
        if not self.video_enabled:
            return False
        if self.dry_run:
            return True
        if self.video_backend == "seedance":
            return self.seedance_configured
        return self.nvidia_configured


def get_settings() -> Settings:
    loaded = _load_dotenv_files()
    dual_export_b2_keys()
    dual_export_nvidia_keys()

    region = (os.getenv("B2_REGION") or "us-east-005").strip()
    endpoint = (os.getenv("B2_ENDPOINT") or "").strip() or None
    if not endpoint and region:
        endpoint = f"https://s3.{region}.backblazeb2.com"

    dry = (os.getenv("GENBLAZE_DRY_RUN") or "").strip().lower() in {"1", "true", "yes"}
    store_full = (os.getenv("NVIDIA_STORE_FULL_EMBEDDINGS") or "1").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    # Default OFF: /health ListObjects is a Class C burn (Render probes + UI loads).
    # Opt in with B2_PROBE_ON_HEALTH=1 only when debugging credentials.
    b2_probe = (os.getenv("B2_PROBE_ON_HEALTH") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    # Default ON: one FLUX retry with abstract rewrite after near-black people blanks.
    # Set GENBLAZE_ABSTRACT_RETRY=0 to save NIM/B2 Class C when over free-tier caps.
    abstract_retry = (os.getenv("GENBLAZE_ABSTRACT_RETRY") or "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    # Default OFF: one delayed retry after empty NVIDIA gateway 504 only.
    # Opt in with GENBLAZE_EMPTY_504_RETRY=1 — may bill a second call if the
    # first eventually completed; prefer manual wait+retry unless operators
    # accept that risk on cold Render/NIM.
    empty_504_retry = (os.getenv("GENBLAZE_EMPTY_504_RETRY") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    try:
        empty_504_delay = float(
            (os.getenv("GENBLAZE_EMPTY_504_RETRY_DELAY") or "45").strip() or "45"
        )
    except ValueError:
        empty_504_delay = 45.0
    empty_504_delay = max(5.0, min(180.0, empty_504_delay))
    # Default OFF: one invalid-payload genai probe at process start (cheap; not
    # a billed generate when NIM rejects empty body). Set
    # GENBLAZE_NVIDIA_WARMUP_ON_STARTUP=1 on Render to reduce cold-start 504s.
    nvidia_warmup = (
        os.getenv("GENBLAZE_NVIDIA_WARMUP_ON_STARTUP") or ""
    ).strip().lower() in {"1", "true", "yes", "on"}
    # Default OFF: judge/demo path is FLUX stills. Cosmos video stays an
    # operator opt-in (GENBLAZE_VIDEO_ENABLED=1) when the key's catalog is live.
    video_enabled = (os.getenv("GENBLAZE_VIDEO_ENABLED") or "0").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    backend_raw = (os.getenv("GENBLAZE_VIDEO_BACKEND") or "nvidia").strip().lower()
    video_backend = "seedance" if backend_raw in {"seedance", "fal", "bytedance"} else "nvidia"
    fal_key = (
        os.getenv("FAL_KEY") or os.getenv("SEEDANCE_API_KEY") or os.getenv("FAL_API_KEY") or ""
    ).strip() or None
    seedance_audio = (os.getenv("SEEDANCE_GENERATE_AUDIO") or "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    wm_raw = (os.getenv("SEEDANCE_WATERMARK") or "0").strip().lower()
    if wm_raw in {"", "default", "omit"}:
        seedance_watermark: bool | None = None
    else:
        seedance_watermark = wm_raw not in {"0", "false", "no", "off"}

    return Settings(
        nvidia_api_key=(
            os.getenv("NVIDIA_API_KEY")
            or os.getenv("NGC_API_KEY")
            or os.getenv("NVIDIA_NIM_API_KEY")
            or ""
        ).strip()
        or None,
        fal_api_key=fal_key,
        b2_key_id=(os.getenv("B2_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        or None,
        b2_app_key=(os.getenv("B2_APP_KEY") or os.getenv("B2_APPLICATION_KEY") or "").strip()
        or None,
        b2_bucket=(os.getenv("B2_BUCKET") or "Mandala-Rendering-System").strip(),
        b2_region=region,
        b2_endpoint=endpoint,
        storage_prefix=(os.getenv("GENBLAZE_STORAGE_PREFIX") or "genblaze-media").strip(),
        image_model=(
            os.getenv("GENBLAZE_IMAGE_MODEL") or "black-forest-labs/flux.1-schnell"
        ).strip(),
        video_model=(
            os.getenv("GENBLAZE_VIDEO_MODEL")
            # Upstream-valid default; operators can fall back to the 12b
            # Cosmos 1.0 slug when it is available on their NVIDIA key.
            or "nvidia/cosmos-1.0-7b-diffusion-text2world"
        ).strip(),
        video_enabled=video_enabled,
        video_backend=video_backend,
        seedance_model=(
            os.getenv("SEEDANCE_MODEL") or "bytedance/seedance-2.0/text-to-video"
        ).strip(),
        seedance_resolution=(os.getenv("SEEDANCE_RESOLUTION") or "720p").strip(),
        seedance_duration=(os.getenv("SEEDANCE_DURATION") or "5").strip(),
        seedance_aspect_ratio=(os.getenv("SEEDANCE_ASPECT_RATIO") or "16:9").strip(),
        seedance_generate_audio=seedance_audio,
        seedance_watermark=False if seedance_watermark is None else seedance_watermark,
        embed_model=(
            os.getenv("NVIDIA_EMBED_MODEL") or "nvidia/nv-embedcode-7b-v1"
        ).strip(),
        embed_url=(
            os.getenv("NVIDIA_EMBED_URL")
            or "https://integrate.api.nvidia.com/v1/embeddings"
        ).strip(),
        embed_timeout_seconds=float(os.getenv("NVIDIA_EMBED_TIMEOUT") or "60"),
        store_full_embeddings=store_full,
        presign_expires_seconds=int(os.getenv("GENBLAZE_PRESIGN_EXPIRES") or "3600"),
        dry_run=dry,
        b2_probe_on_health=b2_probe,
        abstract_retry_on_blank=abstract_retry,
        empty_504_retry=empty_504_retry,
        empty_504_retry_delay_seconds=empty_504_delay,
        nvidia_warmup_on_startup=nvidia_warmup,
        dotenv_loaded=tuple(loaded),
    )


NVIDIA_SETUP_HELP = (
    "NVIDIA_API_KEY is missing. Create a free nvapi- key at "
    "https://build.nvidia.com/ and set NVIDIA_API_KEY in the repo-root .env "
    "(or the deploy host env). Live generate requires this key; "
    "GENBLAZE_DRY_RUN=1 is for unit tests only."
)

SEEDANCE_SETUP_HELP = (
    "Seedance backend selected but FAL_KEY / SEEDANCE_API_KEY is missing. "
    "Create a key at https://fal.ai/dashboard/keys and set FAL_KEY "
    "(see env.seedance.example). fal API usage is billed; consumer Dreamina/"
    "Jimeng free credits are not this API. GENBLAZE_DRY_RUN=1 skips live calls."
)
