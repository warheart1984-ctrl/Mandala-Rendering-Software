"""Environment loading and dual-export for Genblaze B2 + NVIDIA NIM."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_DIR.parents[2]  # mrs/apps/genblaze-media -> repo root


def _load_dotenv_files() -> list[str]:
    """Load repo-root `.env` then app-local `.env` without clobbering process env.

    Uses override=False so deploy-host / test monkeypatches win over file values.
    """
    loaded: list[str] = []
    for path in (REPO_ROOT / ".env", APP_DIR / ".env"):
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
    b2_key_id: str | None
    b2_app_key: str | None
    b2_bucket: str
    b2_region: str
    b2_endpoint: str | None
    storage_prefix: str
    image_model: str
    embed_model: str
    embed_url: str
    embed_timeout_seconds: float
    store_full_embeddings: bool
    presign_expires_seconds: int
    dry_run: bool
    dotenv_loaded: tuple[str, ...]

    @property
    def nvidia_configured(self) -> bool:
        return bool(self.nvidia_api_key)

    @property
    def b2_configured(self) -> bool:
        return bool(self.b2_key_id and self.b2_app_key and self.b2_bucket)


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

    return Settings(
        nvidia_api_key=(
            os.getenv("NVIDIA_API_KEY")
            or os.getenv("NGC_API_KEY")
            or os.getenv("NVIDIA_NIM_API_KEY")
            or ""
        ).strip()
        or None,
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
        dotenv_loaded=tuple(loaded),
    )


NVIDIA_SETUP_HELP = (
    "NVIDIA_API_KEY is missing. Create a free nvapi- key at "
    "https://build.nvidia.com/ and set NVIDIA_API_KEY in the repo-root .env "
    "(or the deploy host env). Live generate requires this key; "
    "GENBLAZE_DRY_RUN=1 is for unit tests only."
)
