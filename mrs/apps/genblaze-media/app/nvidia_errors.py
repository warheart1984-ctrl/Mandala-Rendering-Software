"""NVIDIA gateway error classification (empty 504 cold-start / unavailable).

Evidence: live E2E on Render returned
``NVIDIA image generate failed (504): {"_raw": ""}`` after ~2 minutes —
upstream NIM/gateway empty body, not missing keys or B2.
When startup warmup also returns 504, that is stronger evidence of NIM
unavailability than of an undersized client timeout alone.

Billing honesty: an empty 504 usually means the sync POST never returned a
usable asset, but NVIDIA billing is opaque. Auto-retry is therefore **opt-in**
(``GENBLAZE_EMPTY_504_RETRY``) and limited to one delayed attempt.
"""

from __future__ import annotations

import re
from typing import Any

# Match both JSON dumps and Python-ish dict reprs (optional whitespace).
_EMPTY_RAW_RE = re.compile(
    r"""["']_raw["']\s*:\s*["']\s*["']""",
    re.IGNORECASE,
)


def exception_text(exc: BaseException | str) -> str:
    """Flatten an exception (and one cause/context hop) into searchable text."""
    if isinstance(exc, str):
        return exc.strip()
    detail = str(exc).strip() or type(exc).__name__
    cause = exc.__cause__ or exc.__context__
    if cause is not None and str(cause) and str(cause) not in detail:
        detail = f"{detail}; cause: {type(cause).__name__}: {cause}"
    return detail


def is_empty_nvidia_gateway_504(exc: BaseException | str) -> bool:
    """True when the failure looks like an empty NVIDIA/NIM gateway 504.

    Matches Genblaze ``ProviderError`` shapes such as:
    ``NVIDIA image generate failed (504): {"_raw": ""}``
    and NVCF poll variants with the same empty body.
    """
    detail = exception_text(exc)
    if "504" not in detail:
        return False
    if _EMPTY_RAW_RE.search(detail):
        return True
    normalized = detail.lower().replace(" ", "")
    if '"_raw":""' in normalized or "'_raw':''" in normalized:
        return True
    # Bare empty body after the status token.
    for sep in ("(504):", "status504:", "504:"):
        if sep in normalized:
            after = normalized.split(sep, 1)[-1].strip(" ;.")
            if after in {"", "{}", "null", "none", '{"_raw":""}', "{'_raw':''}"}:
                return True
    return False


EMPTY_504_COLD_START_HINT = (
    "NVIDIA returned an empty 504 gateway response. This can occur during an "
    "upstream NIM cold start or gateway timeout. Wait 30–60 seconds and retry "
    "once manually; if it repeats, raise GENBLAZE_NVCF_POLL_SECONDS (max 300) "
    "and GENBLAZE_HTTP_TIMEOUT on the deploy host, or enable a single delayed "
    "server retry with GENBLAZE_EMPTY_504_RETRY=1 (may bill a second NIM call "
    "if the first eventually completed). Keep the Render service warm with a "
    "cron GET /health so Render sleep does not stack with NIM cold start."
)

EMPTY_504_NIM_UNAVAILABLE_HINT = (
    "NVIDIA returned an empty 504 and startup warmup for this process also got "
    "gateway 504 — treat NIM as unavailable (cold, overloaded, unreachable, "
    "or denied model access), not only as a short poll window. Verify the same "
    "API key can invoke FLUX.1-schnell on build.nvidia.com; set "
    "GENBLAZE_NVCF_POLL_SECONDS=300; optionally enable "
    "GENBLAZE_EMPTY_504_RETRY=1 with a 45–60 second delay (double-bill risk); "
    "and keep Render warm with cron GET /health. GENBLAZE_DRY_RUN=1 proves the "
    "app path while NIM is down, but is not a live generation demo. No fal "
    "image fallback is wired; the existing Seedance/fal path is video-only."
)


def warmup_suggests_nim_unavailable(warmup: dict[str, Any] | None) -> bool:
    """Return whether startup warmup already observed a gateway 504."""
    if not isinstance(warmup, dict) or not warmup.get("ran"):
        return False
    if warmup.get("liveness") == "unavailable":
        return True
    try:
        return int(warmup.get("http_status") or 0) == 504
    except (TypeError, ValueError):
        return False


def format_generation_failure(
    exc: BaseException | str,
    *,
    warmup: dict[str, Any] | None = None,
) -> str:
    """Preserve provider detail and append empty-504 operator guidance."""
    detail = exception_text(exc)
    if is_empty_nvidia_gateway_504(detail):
        hint = (
            EMPTY_504_NIM_UNAVAILABLE_HINT
            if warmup_suggests_nim_unavailable(warmup)
            else EMPTY_504_COLD_START_HINT
        )
        if (
            "empty 504 gateway response" not in detail.lower()
            and "treat NIM as unavailable" not in detail
        ):
            detail = f"{detail}; {hint}"
    return detail


def nvidia_nim_status_from_warmup(
    warmup: dict[str, Any] | None,
) -> dict[str, Any]:
    """Return an operator-facing NIM status derived from the startup probe."""
    if not isinstance(warmup, dict):
        return {"status": "unknown", "note": "warmup state missing"}
    if not warmup.get("ran"):
        return {
            "status": "skipped",
            "note": warmup.get("note") or "startup warmup did not run",
        }

    liveness = str(warmup.get("liveness") or "unknown")
    if liveness == "live":
        note = "warmup rejected the invalid payload as expected; gateway reachable"
    elif liveness == "unavailable":
        note = (
            "warmup got gateway 504; generate likely fails until NVIDIA "
            "recovers, and poll tuning alone may not help"
        )
    elif liveness == "dead":
        note = "warmup got 404; verify the model slug and key catalog access"
    else:
        note = str(warmup.get("note") or "warmup was inconclusive")
    return {
        "status": liveness,
        "http_status": warmup.get("http_status"),
        "model": warmup.get("model"),
        "note": note,
    }


def warmup_result_dict(result: Any) -> dict[str, Any]:
    """Serialize a warmup probe result for /health (no secrets)."""
    if result is None:
        return {"ran": False}
    if isinstance(result, dict):
        return result
    return {"ran": True, "status": str(result)}
