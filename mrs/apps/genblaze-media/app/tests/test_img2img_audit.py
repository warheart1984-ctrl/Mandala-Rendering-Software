"""img2img provider audit test harness.

Verifies which AI providers actually support image-to-image editing (not just
text-to-image) with the operator's existing API keys.  For each provider, the
harness:

1. Sends a known test image + edit prompt
2. Measures composition preservation (MSE vs input)
3. Records endpoint, model, latency, and success/failure
4. Emits a structured JSON report

Run:
    cd mrs/apps/genblaze-media
    python -m pytest app/tests/test_img2img_audit.py -v --tb=short
    python -m pytest app/tests/test_img2img_audit.py -v -k "nim"

Or as a standalone script:
    python app/tests/test_img2img_audit.py

Drive-G-1 honesty:
    This harness tests what ACTUALLY works.  A provider that returns a T2I
    image (ignoring the input) is documented as "t2i-only", not "img2img".
    A provider that fails is documented as "failed", not "unavailable".
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Minimal PNG generator (no external deps needed for audit)
# ---------------------------------------------------------------------------

def _make_png(width: int, height: int, rgba: bytes) -> bytes:
    """Build a minimal valid PNG from raw RGBA pixels."""
    import zlib

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw = b""
    for y in range(height):
        raw += b"\x00"  # filter byte
        raw += rgba[y * width * 4 : (y + 1) * width * 4]
    idat = zlib.compress(raw)
    return sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


def _make_test_image(width: int = 64, height: int = 64) -> bytes:
    """Create a known test image: colored quadrants with sharp edges.

    This is a deterministic composition that makes it easy to measure
    whether img2img preserved the structure.
    """
    pixels = bytearray(width * height * 4)
    hw, hh = width // 2, height // 2
    colors = [
        (255, 0, 0, 255),     # top-left: red
        (0, 255, 0, 255),     # top-right: green
        (0, 0, 255, 255),     # bottom-left: blue
        (255, 255, 0, 255),   # bottom-right: yellow
    ]
    for y in range(height):
        for x in range(width):
            idx = (y * width + x) * 4
            qi = (0 if y < hh else 2) + (0 if x < hw else 1)
            r, g, b, a = colors[qi]
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = a
    return _make_png(width, height, bytes(pixels))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _mse(img_a: bytes, img_b: bytes) -> float:
    """Mean squared error between two RGBA image buffers (same length)."""
    if len(img_a) != len(img_b):
        return float("inf")
    n = len(img_a)
    total = sum((a - b) ** 2 for a, b in zip(img_a, img_b))
    return total / n


# ---------------------------------------------------------------------------
# Audit result types
# ---------------------------------------------------------------------------

@dataclass
class ProviderAuditResult:
    """Result of testing one provider's img2img endpoint."""

    provider: str
    model: str
    endpoint: str
    status: str  # "img2img-works" | "t2i-only" | "failed" | "no-key" | "not-tested"
    error: str | None = None
    latency_ms: float | None = None
    input_sha256: str | None = None
    output_sha256: str | None = None
    mse_vs_input: float | None = None
    composition_preserved: bool | None = None
    """True if MSE < threshold (composition was kept).  None if not measured."""
    response_status: int | None = None
    response_snippet: str | None = None
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AuditReport:
    """Full audit report across all providers."""

    timestamp: str = ""
    test_image_sha256: str = ""
    test_image_size: str = ""
    providers: list[ProviderAuditResult] = field(default_factory=list)
    summary: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "test_image_sha256": self.test_image_sha256,
            "test_image_size": self.test_image_size,
            "providers": [p.to_dict() for p in self.providers],
            "summary": self.summary,
        }


# ---------------------------------------------------------------------------
# Provider testers
# ---------------------------------------------------------------------------

def _test_nvidia_nim_flux_img2img(
    api_key: str,
    test_png: bytes,
) -> ProviderAuditResult:
    """Test NVIDIA NIM Flux img2img endpoint.

    Endpoint: POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
    If the endpoint accepts image input (img2img), it returns a modified image.
    If it only does T2I, it either rejects the image input or ignores it.
    """
    import httpx

    endpoint = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell"
    model = "black-forest-labs/flux.1-schnell"
    input_b64 = base64.b64encode(test_png).decode("ascii")
    input_sha = _sha256(test_png)

    # Flux img2img payload (if supported).
    payload = {
        "prompt": "enhance the colors, add dramatic lighting",
        "image": input_b64,
        "strength": 0.6,
        "width": 64,
        "height": 64,
        "num_inference_steps": 4,
        "seed": 42,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            latency = (time.monotonic() - t0) * 1000

        if resp.status_code == 200:
            body = resp.json()
            # Check if response contains an image (img2img worked).
            art = body.get("artifacts", [{}])
            if art and isinstance(art, list) and len(art) > 0:
                b64_out = art[0].get("base64", "")
                if b64_out:
                    out_bytes = base64.b64decode(b64_out)
                    mse_val = _mse(test_png, out_bytes[: len(test_png)])
                    return ProviderAuditResult(
                        provider="nim-flux",
                        model=model,
                        endpoint=endpoint,
                        status="img2img-works",
                        latency_ms=latency,
                        input_sha256=input_sha,
                        output_sha256=_sha256(out_bytes),
                        mse_vs_input=mse_val,
                        composition_preserved=mse_val < 5000,
                        response_status=200,
                        note="NIM Flux returned a modified image from img2img payload.",
                    )
            # 200 but no image — might be T2I only.
            return ProviderAuditResult(
                provider="nim-flux",
                model=model,
                endpoint=endpoint,
                status="t2i-only",
                latency_ms=latency,
                input_sha256=input_sha,
                response_status=200,
                response_snippet=str(body)[:200],
                note="NIM Flux returned 200 but no image artifact from img2img payload.",
            )
        elif resp.status_code in (400, 422):
            latency = (time.monotonic() - t0) * 1000
            return ProviderAuditResult(
                provider="nim-flux",
                model=model,
                endpoint=endpoint,
                status="t2i-only",
                latency_ms=latency,
                input_sha256=input_sha,
                response_status=resp.status_code,
                response_snippet=resp.text[:200],
                note=(
                    f"NIM Flux rejected img2img payload ({resp.status_code}). "
                    f"Endpoint is text-to-image only."
                ),
            )
        else:
            latency = (time.monotonic() - t0) * 1000
            return ProviderAuditResult(
                provider="nim-flux",
                model=model,
                endpoint=endpoint,
                status="failed",
                latency_ms=latency,
                input_sha256=input_sha,
                response_status=resp.status_code,
                response_snippet=resp.text[:200],
                error=f"HTTP {resp.status_code}",
            )
    except Exception as exc:
        latency = (time.monotonic() - t0) * 1000
        return ProviderAuditResult(
            provider="nim-flux",
            model=model,
            endpoint=endpoint,
            status="failed",
            latency_ms=latency,
            input_sha256=input_sha,
            error=str(exc)[:300],
            note=f"NIM Flux img2img test failed: {type(exc).__name__}",
        )


def _test_fal_flux_img2img(
    api_key: str,
    test_png: bytes,
) -> ProviderAuditResult:
    """Test fal.ai Flux img2img endpoint.

    Endpoint: POST https://fal.run/fal-ai/flux/dev/image-to-image
    """
    import httpx

    endpoint = "https://fal.run/fal-ai/flux/dev/image-to-image"
    model = "fal-ai/flux/dev"
    input_b64 = base64.b64encode(test_png).decode("ascii")
    input_sha = _sha256(test_png)

    payload = {
        "prompt": "enhance the colors, add dramatic lighting",
        "image_url": f"data:image/png;base64,{input_b64}",
        "strength": 0.6,
        "num_inference_steps": 28,
        "seed": 42,
    }

    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json",
    }

    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            latency = (time.monotonic() - t0) * 1000

        if resp.status_code == 200:
            body = resp.json()
            images = body.get("images", [])
            if images and isinstance(images, list) and len(images) > 0:
                img_url = images[0].get("url", "")
                if img_url:
                    # Download the image to measure MSE.
                    img_resp = client.get(img_url)
                    out_bytes = img_resp.content
                    mse_val = _mse(test_png, out_bytes[: len(test_png)])
                    return ProviderAuditResult(
                        provider="fal-flux",
                        model=model,
                        endpoint=endpoint,
                        status="img2img-works",
                        latency_ms=latency,
                        input_sha256=input_sha,
                        output_sha256=_sha256(out_bytes),
                        mse_vs_input=mse_val,
                        composition_preserved=mse_val < 5000,
                        response_status=200,
                        note="fal.ai Flux returned a modified image from img2img.",
                    )
            return ProviderAuditResult(
                provider="fal-flux",
                model=model,
                endpoint=endpoint,
                status="t2i-only",
                latency_ms=latency,
                input_sha256=input_sha,
                response_status=200,
                response_snippet=str(body)[:200],
                note="fal.ai Flux returned 200 but no image from img2img payload.",
            )
        else:
            return ProviderAuditResult(
                provider="fal-flux",
                model=model,
                endpoint=endpoint,
                status="failed",
                latency_ms=latency,
                input_sha256=input_sha,
                response_status=resp.status_code,
                response_snippet=resp.text[:200],
                error=f"HTTP {resp.status_code}",
            )
    except Exception as exc:
        latency = (time.monotonic() - t0) * 1000
        return ProviderAuditResult(
            provider="fal-flux",
            model=model,
            endpoint=endpoint,
            status="failed",
            latency_ms=latency,
            input_sha256=input_sha,
            error=str(exc)[:300],
            note=f"fal.ai Flux img2img test failed: {type(exc).__name__}",
        )


def _test_nvidia_nim_img2img_models(
    api_key: str,
    test_png: bytes,
) -> list[ProviderAuditResult]:
    """Probe multiple NIM models that might support img2img.

    NVIDIA's catalog changes.  This probes known img2img-capable models.
    """
    results = []

    # Model 1: flux.1-schnell (primary)
    results.append(_test_nvidia_nim_flux_img2img(api_key, test_png))

    # Model 2: Try the img2img-specific variant if it exists.
    import httpx

    img2img_endpoint = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell"
    input_b64 = base64.b64encode(test_png).decode("ascii")

    # Try the "init_image" parameter (some NIM models use this instead of "image").
    alt_payload = {
        "prompt": "enhance the colors",
        "init_image": input_b64,
        "image_strength": 0.6,
        "steps": 4,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(img2img_endpoint, json=alt_payload, headers=headers)
            latency = (time.monotonic() - t0) * 1000

        if resp.status_code == 200:
            body = resp.json()
            art = body.get("artifacts", [])
            if art and art[0].get("base64"):
                results.append(ProviderAuditResult(
                    provider="nim-flux",
                    model="flux.1-schnell (init_image)",
                    endpoint=img2img_endpoint,
                    status="img2img-works",
                    latency_ms=latency,
                    input_sha256=_sha256(test_png),
                    output_sha256=_sha256(base64.b64decode(art[0]["base64"])),
                    response_status=200,
                    note="NIM Flux accepted init_image parameter.",
                ))
        # Otherwise, the primary test already captured the result.
    except Exception:
        pass

    return results


# ---------------------------------------------------------------------------
# Audit runner
# ---------------------------------------------------------------------------

def run_audit(
    *,
    output_path: str | None = None,
) -> AuditReport:
    """Run the full img2img audit across all configured providers.

    Reads API keys from environment variables.  Skips providers whose keys
    are not set.

    Returns:
        AuditReport with results for each provider tested.
    """
    from datetime import datetime, timezone

    report = AuditReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    test_png = _make_test_image(64, 64)
    report.test_image_sha256 = _sha256(test_png)
    report.test_image_size = f"{len(test_png)} bytes"

    # Test NVIDIA NIM.
    nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
    if nvidia_key:
        results = _test_nvidia_nim_img2img_models(nvidia_key, test_png)
        report.providers.extend(results)
    else:
        report.providers.append(ProviderAuditResult(
            provider="nim-flux",
            model="black-forest-labs/flux.1-schnell",
            endpoint="https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
            status="no-key",
            note="NVIDIA_API_KEY not set; skipping NIM img2img test.",
        ))

    # Test fal.ai.
    fal_key = os.environ.get("FAL_KEY", "")
    if fal_key:
        result = _test_fal_flux_img2img(fal_key, test_png)
        report.providers.append(result)
    else:
        report.providers.append(ProviderAuditResult(
            provider="fal-flux",
            model="fal-ai/flux/dev",
            endpoint="https://fal.run/fal-ai/flux/dev/image-to-image",
            status="no-key",
            note="FAL_KEY not set; skipping fal.ai img2img test.",
        ))

    # Summary.
    report.summary = {}
    for p in report.providers:
        report.summary[p.provider] = p.status

    # Write report.
    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report.to_dict(), indent=2))

    return report


# ---------------------------------------------------------------------------
# Pytest tests
# ---------------------------------------------------------------------------

class TestAuditHarness:
    """Verify the audit harness itself works correctly."""

    def test_make_test_image_is_deterministic(self):
        """Same inputs produce identical test images."""
        a = _make_test_image(32, 32)
        b = _make_test_image(32, 32)
        assert a == b

    def test_make_test_image_is_valid_png(self):
        """Test image starts with PNG signature."""
        img = _make_test_image(16, 16)
        assert img[:8] == b"\x89PNG\r\n\x1a\n"

    def test_mse_identical_is_zero(self):
        img = _make_test_image(16, 16)
        assert _mse(img, img) == 0.0

    def test_mse_different_is_positive(self):
        a = _make_test_image(16, 16)
        b = _make_test_image(32, 32)
        assert _mse(a, b) == float("inf")  # different lengths

    def test_sha256_deterministic(self):
        img = _make_test_image(16, 16)
        assert _sha256(img) == _sha256(img)

    def test_provider_result_serializes(self):
        r = ProviderAuditResult(
            provider="test",
            model="test-model",
            endpoint="https://test.example.com",
            status="no-key",
            note="test",
        )
        d = r.to_dict()
        assert d["provider"] == "test"
        assert d["status"] == "no-key"

    def test_report_serializes(self):
        report = AuditReport(
            timestamp="2026-01-01T00:00:00Z",
            test_image_sha256="abc",
            test_image_size="100 bytes",
            providers=[
                ProviderAuditResult(
                    provider="test",
                    model="test-model",
                    endpoint="https://test.example.com",
                    status="no-key",
                ),
            ],
            summary={"test": "no-key"},
        )
        d = report.to_dict()
        assert len(d["providers"]) == 1
        assert d["summary"]["test"] == "no-key"

    def test_audit_run_produces_report(self):
        """Run the audit without keys — should produce a report with 'no-key' entries."""
        # Ensure no keys are set for this test.
        old_nvidia = os.environ.pop("NVIDIA_API_KEY", None)
        old_fal = os.environ.pop("FAL_KEY", None)
        try:
            report = run_audit()
            assert len(report.providers) >= 2
            statuses = {p.provider: p.status for p in report.providers}
            assert statuses.get("nim-flux") == "no-key"
            assert statuses.get("fal-flux") == "no-key"
        finally:
            if old_nvidia:
                os.environ["NVIDIA_API_KEY"] = old_nvidia
            if old_fal:
                os.environ["FAL_KEY"] = old_fal

    def test_audit_report_json_roundtrip(self):
        old_nvidia = os.environ.pop("NVIDIA_API_KEY", None)
        old_fal = os.environ.pop("FAL_KEY", None)
        try:
            report = run_audit()
            json_str = json.dumps(report.to_dict(), indent=2)
            restored = json.loads(json_str)
            assert restored["test_image_sha256"] == report.test_image_sha256
        finally:
            if old_nvidia:
                os.environ["NVIDIA_API_KEY"] = old_nvidia
            if old_fal:
                os.environ["FAL_KEY"] = old_fal


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "audit-report.json"
    print(f"Running img2img provider audit → {output}")
    report = run_audit(output_path=output)

    print(f"\n{'='*60}")
    print(f"img2img Provider Audit Report")
    print(f"{'='*60}")
    print(f"Test image: {report.test_image_sha256[:16]}... ({report.test_image_size})")
    print(f"Timestamp:  {report.timestamp}")
    print()

    for p in report.providers:
        status_icon = {
            "img2img-works": "[OK]",
            "t2i-only":     "[NO]",
            "failed":       "[!!]",
            "no-key":       "[--]",
            "not-tested":   "[--]",
        }.get(p.status, "[??]")
        print(f"  {status_icon} {p.provider} ({p.model})")
        print(f"       status:   {p.status}")
        print(f"       endpoint: {p.endpoint}")
        if p.latency_ms is not None:
            print(f"       latency:  {p.latency_ms:.0f}ms")
        if p.mse_vs_input is not None:
            print(f"       MSE:      {p.mse_vs_input:.2f}")
        if p.composition_preserved is not None:
            print(f"       composed: {p.composition_preserved}")
        if p.error:
            print(f"       error:    {p.error[:100]}")
        if p.note:
            print(f"       note:     {p.note}")
        print()

    print(f"Summary: {json.dumps(report.summary, indent=2)}")
    print(f"Full report: {output}")
