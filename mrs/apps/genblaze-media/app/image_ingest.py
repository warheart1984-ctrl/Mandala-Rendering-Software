"""Local image ingest + heuristic 4D suggestion helpers.

Drive-G-1: stores uploaded photos and returns **heuristic** palette/style
suggestions for operators. Does **not** perform true RT4D / 4D scene
reconstruction.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allowed raster formats (Pillow names / common MIME).
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "GIF", "WEBP", "BMP", "TIFF"})
ALLOWED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"})
ALLOWED_MIME = frozenset(
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/x-ms-bmp",
        "image/tiff",
        "image/tif",
    }
)

_SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")
_MAX_BYTES = 25 * 1024 * 1024  # 25 MiB


@dataclass(frozen=True)
class IngestMeta:
    id: str
    filename: str
    format: str
    mime: str
    width: int
    height: int
    size_bytes: int
    sha256: str
    dominant_color: str
    created_at: str
    stored_name: str
    analysis_mode: str = "heuristic"


def ingested_dir(app_dir: Path) -> Path:
    """Dedicated ingest store under Genblaze data/ (not the generate preview cache)."""
    path = app_dir / "data" / "ingested"
    path.mkdir(parents=True, exist_ok=True)
    return path


def index_path(app_dir: Path) -> Path:
    return ingested_dir(app_dir) / "index.json"


def is_safe_ingest_id(image_id: str) -> bool:
    return bool(_SAFE_ID.match(image_id or ""))


def sanitize_filename(name: str | None) -> str:
    """Strip path components; reject traversal. Returns a safe basename."""
    raw = (name or "upload.bin").replace("\\", "/")
    base = raw.split("/")[-1].strip() or "upload.bin"
    if ".." in base or base.startswith("."):
        base = "upload.bin"
    # Keep alnum, dash, underscore, dot
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120]
    return cleaned or "upload.bin"


def _mime_for_format(fmt: str) -> str:
    mapping = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "GIF": "image/gif",
        "WEBP": "image/webp",
        "BMP": "image/bmp",
        "TIFF": "image/tiff",
    }
    return mapping.get(fmt.upper(), "application/octet-stream")


def _ext_for_format(fmt: str) -> str:
    mapping = {
        "JPEG": ".jpg",
        "PNG": ".png",
        "GIF": ".gif",
        "WEBP": ".webp",
        "BMP": ".bmp",
        "TIFF": ".tiff",
    }
    return mapping.get(fmt.upper(), ".bin")


def is_valid_image(
    data: bytes,
    *,
    declared_mime: str | None = None,
    filename: str | None = None,
) -> tuple[bool, str | None, dict[str, Any]]:
    """Validate bytes are an allowed raster image.

    Returns ``(ok, error_reason, info)`` where ``info`` may include format/size.
    """
    info: dict[str, Any] = {"byte_len": len(data or b"")}
    if not data:
        return False, "empty payload", info
    if len(data) > _MAX_BYTES:
        return False, f"image exceeds {_MAX_BYTES} bytes", info

    if declared_mime:
        mime = declared_mime.split(";")[0].strip().lower()
        if mime and mime not in ALLOWED_MIME and mime != "application/octet-stream":
            return False, f"unsupported MIME type: {mime}", info

    if filename:
        ext = Path(sanitize_filename(filename)).suffix.lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            return False, f"unsupported file extension: {ext}", info

    try:
        from PIL import Image
    except ImportError:
        return False, "Pillow is required for image validation", info

    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        with Image.open(io.BytesIO(data)) as im:
            fmt = (im.format or "").upper()
            width, height = im.size
            info.update({"format": fmt, "width": width, "height": height})
            if fmt not in ALLOWED_FORMATS:
                return False, f"unsupported image format: {fmt or 'unknown'}", info
            # Re-load after verify for dominant color sample
            rgb = im.convert("RGB")
            sample = rgb
            if max(width, height) > 64:
                sample = rgb.resize((64, 64))
            pixels = list(sample.get_flattened_data()) if hasattr(sample, "get_flattened_data") else list(sample.getdata())
            # get_flattened_data returns flat RGB triples as a sequence of ints in newer Pillow;
            # normalize to (r,g,b) tuples.
            if pixels and isinstance(pixels[0], int):
                triples = [(pixels[i], pixels[i + 1], pixels[i + 2]) for i in range(0, len(pixels) - 2, 3)]
            else:
                triples = pixels  # type: ignore[assignment]
            if not triples:
                return False, "could not sample image pixels", info
            r = sum(p[0] for p in triples) // len(triples)
            g = sum(p[1] for p in triples) // len(triples)
            b = sum(p[2] for p in triples) // len(triples)
            info["dominant_color"] = f"#{r:02x}{g:02x}{b:02x}"
            info["mime"] = _mime_for_format(fmt)
            return True, None, info
    except Exception as exc:  # noqa: BLE001 — surface decode failures
        return False, f"invalid image data: {exc}", info


def decode_base64_payload(payload: str) -> bytes:
    """Decode raw or data-URL base64."""
    text = (payload or "").strip()
    if not text:
        raise ValueError("empty base64 payload")
    if "," in text and text.lower().startswith("data:"):
        text = text.split(",", 1)[1]
    try:
        return base64.b64decode(text, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"invalid base64: {exc}") from exc


def _load_index(app_dir: Path) -> list[dict[str, Any]]:
    path = index_path(app_dir)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return [x for x in raw if isinstance(x, dict)]
        if isinstance(raw, dict) and isinstance(raw.get("items"), list):
            return [x for x in raw["items"] if isinstance(x, dict)]
    except (OSError, json.JSONDecodeError):
        return []
    return []


def _save_index(app_dir: Path, items: list[dict[str, Any]]) -> None:
    path = index_path(app_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"items": items[:200]}, indent=2), encoding="utf-8")


def resolve_stored_file(app_dir: Path, image_id: str) -> Path | None:
    """Resolve ingest id → file under ingested dir; reject traversal."""
    if not is_safe_ingest_id(image_id):
        return None
    root = ingested_dir(app_dir).resolve()
    for item in _load_index(app_dir):
        if item.get("id") != image_id:
            continue
        stored = item.get("stored_name")
        if not isinstance(stored, str) or not stored or ".." in stored or "/" in stored or "\\" in stored:
            return None
        candidate = (root / stored).resolve()
        if not str(candidate).startswith(str(root)):
            return None
        if candidate.is_file():
            return candidate
    return None


def ingest_bytes(
    app_dir: Path,
    data: bytes,
    *,
    filename: str | None = None,
    declared_mime: str | None = None,
) -> IngestMeta:
    ok, err, info = is_valid_image(data, declared_mime=declared_mime, filename=filename)
    if not ok:
        raise ValueError(err or "invalid image")

    fmt = str(info["format"])
    image_id = uuid.uuid4().hex
    safe_name = sanitize_filename(filename)
    stem = Path(safe_name).stem[:40] or "upload"
    stored_name = f"{image_id}_{stem}{_ext_for_format(fmt)}"
    # Extra guard: stored_name must be a single path segment
    if "/" in stored_name or "\\" in stored_name or ".." in stored_name:
        stored_name = f"{image_id}{_ext_for_format(fmt)}"

    dest = ingested_dir(app_dir) / stored_name
    dest.write_bytes(data)

    meta = IngestMeta(
        id=image_id,
        filename=safe_name,
        format=fmt,
        mime=str(info.get("mime") or _mime_for_format(fmt)),
        width=int(info["width"]),
        height=int(info["height"]),
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        dominant_color=str(info.get("dominant_color") or "#808080"),
        created_at=datetime.now(timezone.utc).isoformat(),
        stored_name=stored_name,
        analysis_mode="heuristic",
    )
    items = _load_index(app_dir)
    items.insert(0, asdict(meta))
    _save_index(app_dir, items)
    return meta


def list_ingested(app_dir: Path, *, limit: int = 50) -> list[dict[str, Any]]:
    items = _load_index(app_dir)
    out: list[dict[str, Any]] = []
    for item in items:
        row = dict(item)
        row["preview_url"] = f"/api/image/ingested/{item.get('id')}/file"
        out.append(row)
        if len(out) >= limit:
            break
    return out


def get_ingested_meta(app_dir: Path, image_id: str) -> dict[str, Any] | None:
    if not is_safe_ingest_id(image_id):
        return None
    for item in _load_index(app_dir):
        if item.get("id") == image_id:
            row = dict(item)
            row["preview_url"] = f"/api/image/ingested/{image_id}/file"
            return row
    return None


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return 0.5
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _style_from_palette(hex_color: str, width: int, height: int) -> dict[str, Any]:
    """Cheap heuristic style tags — explicitly not vision-model analysis."""
    lum = _luminance(hex_color)
    h = hex_color.lstrip("#")
    r, g, b = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) if len(h) == 6 else (128, 128, 128)
    aspect = width / max(height, 1)

    if lum < 0.28:
        mood = "low-key / nocturnal"
        material = "matte dark volume"
    elif lum > 0.72:
        mood = "high-key / airy"
        material = "soft diffuse surface"
    else:
        mood = "mid-tone / balanced"
        material = "neutral dielectric"

    if r > g + 30 and r > b + 30:
        palette_tag = "warm-red bias"
    elif b > r + 30 and b > g + 20:
        palette_tag = "cool-blue bias"
    elif g > r + 20 and g > b + 20:
        palette_tag = "green bias"
    else:
        palette_tag = "neutral / mixed"

    if aspect > 1.4:
        framing = "wide / landscape-friendly lattice"
    elif aspect < 0.75:
        framing = "tall / portrait-friendly lattice"
    else:
        framing = "square-ish / centered lattice"

    return {
        "mood": mood,
        "material_hint": material,
        "palette_tag": palette_tag,
        "framing": framing,
        "suggested_surface": "implicit_manifold_shell",
        "suggested_color": hex_color,
        "notes": (
            "Heuristic only (palette + aspect). Not RT4D reconstruction, "
            "not Midjourney/Kling, and not a governed MRS scene."
        ),
    }


def analyze_image_bytes(data: bytes, *, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    ok, err, info = is_valid_image(data)
    if not ok:
        raise ValueError(err or "invalid image")

    dominant = str(info.get("dominant_color") or (meta or {}).get("dominant_color") or "#808080")
    width = int(info["width"])
    height = int(info["height"])
    style = _style_from_palette(dominant, width, height)

    return {
        "analysis_mode": "heuristic",
        "disclaimer": (
            "image_to_4d / analyze returns operator suggestions only. "
            "True 4D scene reconstruction is not implemented in Genblaze media."
        ),
        "format": info.get("format"),
        "width": width,
        "height": height,
        "size_bytes": len(data),
        "dominant_color": dominant,
        "suggestion": style,
        "source_meta": meta,
    }


def analyze_ingested(app_dir: Path, image_id: str) -> dict[str, Any]:
    meta = get_ingested_meta(app_dir, image_id)
    if meta is None:
        raise FileNotFoundError(f"ingested image not found: {image_id}")
    path = resolve_stored_file(app_dir, image_id)
    if path is None:
        raise FileNotFoundError(f"ingested file missing for id: {image_id}")
    data = path.read_bytes()
    result = analyze_image_bytes(data, meta=meta)
    result["id"] = image_id
    return result
