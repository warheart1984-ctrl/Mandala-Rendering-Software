"""NVIDIA gateway error classification (empty 504 cold-start / timeout).

Evidence: live E2E on Render returned
``NVIDIA image generate failed (504): {"_raw": ""}`` after ~2 minutes —
upstream NIM/gateway empty body, not missing keys or B2.

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


EMPTY_504_OPERATOR_HINT = (
    "NVIDIA returned an empty 504 gateway response. This can occur during an "
    "upstream NIM cold start or gateway timeout. Wait 30–60 seconds and retry "
    "once manually; if it repeats, raise GENBLAZE_NVCF_POLL_SECONDS (max 300) "
    "and GENBLAZE_HTTP_TIMEOUT on the deploy host, or enable a single delayed "
    "server retry with GENBLAZE_EMPTY_504_RETRY=1 (may bill a second NIM call "
    "if the first eventually completed). Ingest routes require a separate "
    "Render redeploy when those commits are not yet live."
)


def format_generation_failure(exc: BaseException | str) -> str:
    """Preserve provider detail and append empty-504 operator guidance."""
    detail = exception_text(exc)
    if is_empty_nvidia_gateway_504(detail):
        if "empty 504 gateway response" not in detail.lower():
            detail = f"{detail}; {EMPTY_504_OPERATOR_HINT}"
    return detail


def warmup_result_dict(result: Any) -> dict[str, Any]:
    """Serialize a warmup probe result for /health (no secrets)."""
    if result is None:
        return {"ran": False}
    if isinstance(result, dict):
        return result
    return {"ran": True, "status": str(result)}
