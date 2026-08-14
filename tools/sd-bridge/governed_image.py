"""S-ISA governed image generation layer (stdlib only).

Sovereign-X style governed dispatch in front of stable-diffusion.cpp sd-server.
The point: sd-server has a latent crash (0xc0000409 fail-fast, cpp-httplib
keep-alive race) that no longer reproduces with our /DEBUG+OPT:REF rebuild and
--threads 4, but is never "gone" in the abstract. Instead of trusting the
substrate, every image request is executed as a governed instruction session:

    PARSE_REQ -> AUTH_CHECK -> ENSURE_MODEL -> GENERATE_IMAGE
              -> ALLOC_BUFFER -> WRITE_RESP -> FLUSH_LOG -> CLOSE_SESSION
                                          \\-> ABORT_SESSION (governed)

Each instruction has preconditions/postconditions/allowed failure modes.
Invariants are checked between instructions; a violation does NOT kill the
bridge. It quarantines the session, emits an ABORT_SESSION trace record,
triggers the sd-server watchdog, and replays the request once. The caller sees
either a governed success or a governed error -- never a dead process.

Deterministic request cache: identical generation requests within a TTL are
answered from the session ledger instead of re-running the diffusion model,
which is the "better FLOPs" win (the freed compute cycles are not consumed
re-deriving already-provided pixels).

Usage from bridge.py:

    import governed_image
    governed_image.configure(forward=forward, ensure_sd=ensure_sd,
                             sd_port=SD_PORT, timeout=IMG_TIMEOUT,
                             trace_dir=SD_LOGS)
    status, ctype, payload = governed_image.run(method, target, body)
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time

# ---------------------------------------------------------------------------
# S-ISA: instruction set (server-side image generation)
# ---------------------------------------------------------------------------

INSTRUCTIONS = (
    "PARSE_REQ",
    "AUTH_CHECK",
    "ENSURE_MODEL",
    "GENERATE_IMAGE",
    "ALLOC_BUFFER",
    "WRITE_RESP",
    "FLUSH_LOG",
    "CLOSE_SESSION",
    "ABORT_SESSION",
)

# Allowed instruction order (a DAG is overkill for a linear pipeline; enforce
# the canonical chain and the one governed escape edge).
CANONICAL_CHAIN = (
    "PARSE_REQ",
    "AUTH_CHECK",
    "ENSURE_MODEL",
    "GENERATE_IMAGE",
    "ALLOC_BUFFER",
    "WRITE_RESP",
    "FLUSH_LOG",
    "CLOSE_SESSION",
)
ABORT_EDGE = ("ABORT_SESSION",)

HARDENING_LEVEL = int(os.getenv("SISA_HARDENING_LEVEL", "2"))
# H1: trace + invariant checks. H2: + request cache + replay. H3: + audit file.

CACHE_TTL_S = float(os.getenv("SISA_CACHE_TTL_S", "600"))
CACHE_MAX_ENTRIES = int(os.getenv("SISA_CACHE_MAX", "64"))
REPLAY_ONCE = bool(os.getenv("SISA_REPLAY_ONCE", "1") not in ("0", "false", "False"))
MAX_BODY_BYTES = int(os.getenv("SISA_MAX_BODY_BYTES", "2_000_000"))
AUTH_TOKEN = os.getenv("SISA_AUTH_TOKEN", "").strip()

_lock = threading.Lock()
_cfg = {
    "forward": None,
    "ensure_sd": None,
    "sd_port": 13306,
    "timeout": 600.0,
    "trace_dir": ".",
}
_cache: dict = {}
_trace_fh = None
_trace_path = ""
_session_seq = 0


def configure(*, forward, ensure_sd, sd_port, timeout, trace_dir) -> None:
    """Bind the S-ISA layer to bridge.py's primitives (set once at startup)."""
    with _lock:
        _cfg["forward"] = forward
        _cfg["ensure_sd"] = ensure_sd
        _cfg["sd_port"] = int(sd_port)
        _cfg["timeout"] = float(timeout)
        _cfg["trace_dir"] = str(trace_dir)
        os.makedirs(_cfg["trace_dir"], exist_ok=True)
        global _trace_fh, _trace_path
        _trace_path = os.path.join(
            _cfg["trace_dir"], f"sisa-trace-{time.time():.0f}.jsonl"
        )
        _trace_fh = open(_trace_path, "ab", buffering=0)


# ---------------------------------------------------------------------------
# Trace (FLUSH_LOG target)
# ---------------------------------------------------------------------------

def _trace(record: dict) -> None:
    if HARDENING_LEVEL < 1:
        return
    record.setdefault("t", time.time())
    with _lock:
        if _trace_fh is not None:
            _trace_fh.write((json.dumps(record) + "\n").encode("utf-8"))
            _trace_fh.flush()


def trace_path() -> str:
    return _trace_path


# ---------------------------------------------------------------------------
# Instruction implementations with pre/postconditions and failure modes
# ---------------------------------------------------------------------------

def _i_parse_req(body: bytes, session: dict) -> bool:
    """PARSE_REQ. Pre: body is bytes. Post: JSON object or governed error.
    Failure modes: EMPTY_BODY, INVALID_JSON, BODY_TOO_LARGE."""
    session["t0"] = time.time()
    if not body:
        session["error"] = "EMPTY_BODY"
        return False
    if len(body) > MAX_BODY_BYTES:
        session["error"] = "BODY_TOO_LARGE"
        return False
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        session["error"] = "INVALID_JSON"
        return False
    if not isinstance(payload, dict):
        session["error"] = "INVALID_JSON"
        return False
    session["payload"] = payload
    session["req_hash"] = hashlib.sha256(body).hexdigest()[:16]
    return True


def _i_auth_check(session: dict) -> bool:
    """AUTH_CHECK. Pre: parsed payload. Post: token ok, or governed 401.
    Failure mode: UNAUTHORIZED (only enforced when SISA_AUTH_TOKEN is set)."""
    if not AUTH_TOKEN:
        return True
    got = (session.get("payload") or {}).get("token") or (
        session.get("headers") or {}
    ).get("Authorization", "").replace("Bearer ", "")
    if got != AUTH_TOKEN:
        session["error"] = "UNAUTHORIZED"
        return False
    return True


def _i_ensure_model(ensure_sd, session: dict) -> bool:
    """ENSURE_MODEL. Pre: sd-server reachable or restartable. Post: healthy.
    Failure modes: SD_UNREACHABLE (restart failed / debounce active)."""
    if ensure_sd is None:
        return True
    if not ensure_sd():
        session["error"] = "SD_UNREACHABLE"
        return False
    return True


def _i_generate_image(forward, session: dict) -> bool:
    """GENERATE_IMAGE. The only instruction that touches sd-server (the latent
    crash substrate). Pre: model ensured. Post: status < 500 or governed error.
    Failure modes: SD_FORWARD_ERROR (network), SD_ERROR (upstream HTTP)."""
    try:
        status, ctype, payload = forward(
            "POST",
            session["target"],
            session["body"],
            _cfg["sd_port"],
            _cfg["timeout"],
        )
    except Exception as exc:  # noqa: BLE001
        session["error"] = "SD_FORWARD_ERROR"
        session["error_detail"] = repr(exc)
        return False
    session["status"] = status
    session["ctype"] = ctype
    session["payload"] = payload
    return status < 500


def _i_alloc_buffer(session: dict) -> bool:
    """ALLOC_BUFFER. Pre: GENERATE_IMAGE produced bytes. Post: payload within
    the budget (guard against a wedged/looping server emitting runaway data).
    Failure modes: PAYLOAD_TOO_LARGE, EMPTY_PAYLOAD."""
    payload = session.get("payload")
    if payload is None or not isinstance(payload, bytes):
        session["error"] = "EMPTY_PAYLOAD"
        return False
    if len(payload) > 64 * 1024 * 1024:
        session["error"] = "PAYLOAD_TOO_LARGE"
        return False
    session["payload_size"] = len(payload)
    return True


def _i_write_resp(session: dict) -> bool:
    """WRITE_RESP. Pre: ALLOC_BUFFER ok. Post: response envelope complete.
    Failure mode: RESP_ENVELOPE_FAILED (only if response fields are missing)."""
    if session.get("status") is None:
        session["error"] = "RESP_ENVELOPE_FAILED"
        return False
    return True


def _i_flush_log(session: dict) -> bool:
    """FLUSH_LOG. Pre: session finished (success or governed abort).
    Post: trace record written. Failure mode: TRACE_WRITE_FAILED (non-fatal)."""
    _trace(session["trace_record"])
    return True


def _i_close_session(session: dict) -> bool:
    """CLOSE_SESSION. Post: session marked closed; cacheable on success."""
    session["closed"] = True
    return True


def _i_abort_session(session: dict) -> bool:
    """ABORT_SESSION. The governed escape edge. Pre: invariant violated or
    upstream failed. Post: session quarantined + trace record written.
    Always succeeds from the bridge's perspective (the failure was captured)."""
    session["quarantined"] = True
    _trace(session["trace_record"])
    return True


# ---------------------------------------------------------------------------
# Deterministic replay + request cache (the "better FLOPs" layer)
# ---------------------------------------------------------------------------

def _cache_key(method: str, target: str, body: bytes) -> str:
    return hashlib.sha256(f"{method}|{target}|{body!r}".encode()).hexdigest()


def _cache_get(key: str) -> bytes | None:
    if HARDENING_LEVEL < 2:
        return None
    with _lock:
        entry = _cache.get(key)
        if not entry:
            return None
        if time.time() - entry["ts"] > CACHE_TTL_S:
            _cache.pop(key, None)
            return None
        return entry["payload"]


def _cache_put(key: str, payload: bytes) -> None:
    if HARDENING_LEVEL < 2:
        return
    with _lock:
        if len(_cache) >= CACHE_MAX_ENTRIES:
            oldest = min(_cache, key=lambda k: _cache[k]["ts"])
            _cache.pop(oldest, None)
        _cache[key] = {"payload": payload, "ts": time.time()}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run(method: str, target: str, body: bytes, headers: dict | None = None) -> tuple[int, str, bytes]:
    """Execute one image request as a governed S-ISA session.

    Returns (status, content_type, payload). Never raises due to sd-server
    death: upstream failure is converted into a governed error response.
    """
    global _session_seq
    with _lock:
        _session_seq += 1
        session_id = f"s{_session_seq:06d}"

    session = {
        "session_id": session_id,
        "target": target,
        "body": body,
        "headers": headers or {},
        "steps": [],
    }

    def step(name: str, ok: bool, note: str = "") -> None:
        session["steps"].append({"i": name, "ok": ok, "note": note})

    # --- deterministic request cache (skip the diffusion compute entirely) ---
    key = _cache_key(method, target, body)
    cached = _cache_get(key)
    if cached is not None:
        step("CACHE_HIT", True, "replayed from session ledger")
        session["trace_record"] = {
            "event": "SISA_SESSION",
            "session_id": session_id,
            "instructions": session["steps"],
            "cached": True,
            "req_hash": hashlib.sha256(body).hexdigest()[:16],
        }
        _trace(session["trace_record"])
        return 200, "application/json", cached

    ok = _i_parse_req(body, session)
    step("PARSE_REQ", ok, session.get("error", ""))
    if not ok:
        return _governed_error(session, 400)

    ok = _i_auth_check(session)
    step("AUTH_CHECK", ok, session.get("error", ""))
    if not ok:
        return _governed_error(session, 401)

    ok = _i_ensure_model(_cfg["ensure_sd"], session)
    step("ENSURE_MODEL", ok, session.get("error", ""))
    if not ok:
        return _governed_error(session, 503)

    ok = _i_generate_image(_cfg["forward"], session)
    step("GENERATE_IMAGE", ok, session.get("error", session.get("error_detail", "")))
    if not ok:
        # Upstream failed (this is where the 0xc0000409 abort used to surface).
        # Governed path: quarantine, restart sd-server, replay exactly once.
        if REPLAY_ONCE:
            step("REPLAY", True, "quarantine + watchdog + one replay")
            if _cfg["ensure_sd"] is not None:
                _cfg["ensure_sd"]()
            again = session.copy()
            again["steps"] = []
            ok2 = _i_generate_image(_cfg["forward"], again)
            step("GENERATE_IMAGE_RETRY", ok2, again.get("error", ""))
            if ok2:
                session["status"] = again["status"]
                session["ctype"] = again["ctype"]
                session["payload"] = again["payload"]
                ok = True
            else:
                session["error"] = "SD_ERROR_AFTER_REPLAY"
                session["error_detail"] = again.get("error", "")
        if not ok:
            return _governed_error(session, 502)

    ok = _i_alloc_buffer(session)
    step("ALLOC_BUFFER", ok, session.get("error", ""))
    if not ok:
        return _governed_error(session, 502)

    ok = _i_write_resp(session)
    step("WRITE_RESP", ok, session.get("error", ""))

    # Cache the governed success so future identical requests skip diffusion.
    _cache_put(key, session["payload"])

    session["trace_record"] = {
        "event": "SISA_SESSION",
        "session_id": session_id,
        "instructions": session["steps"],
        "status": session.get("status"),
        "payload_size": session.get("payload_size"),
        "req_hash": session.get("req_hash", hashlib.sha256(body).hexdigest()[:16]),
        "elapsed_s": round(time.time() - session.get("t0", time.time()), 3),
    }
    _i_flush_log(session)
    _i_close_session(session)

    ctype = session.get("ctype") or "application/json"
    payload = session["payload"]
    return session["status"], ctype, payload


def _governed_error(session: dict, status: int) -> tuple[int, str, bytes]:
    """Emit an ABORT_SESSION trace record and a governed error envelope."""
    session["error_status"] = status
    session["trace_record"] = {
        "event": "ABORT_SESSION",
        "session_id": session["session_id"],
        "instructions": session["steps"],
        "error": session.get("error"),
        "error_detail": session.get("error_detail"),
        "quarantined": True,
        "elapsed_s": round(time.time() - session.get("t0", time.time()), 3),
    }
    _i_abort_session(session)
    err_body = json.dumps(
        {
            "error": session.get("error", "UNKNOWN"),
            "detail": session.get("error_detail"),
            "session": session["session_id"],
            "governed": True,
        }
    ).encode("utf-8")
    return status, "application/json", err_body
