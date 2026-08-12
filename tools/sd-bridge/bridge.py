"""SD-CPP <-> Lemonade API bridge (standalone, stdlib only).

Listens on :13305 and routes to two local backends:

    /api/v1/images/*  /v1/*  /sdapi/v1/*   -> stable-diffusion.cpp sd-server  (127.0.0.1:13306)
    /api/v1/chat/*    /api/v1/audio/*      -> LemonadeServer                  (127.0.0.1:13307)
    /health, /api/v1/health                -> aggregated status (200 when SD is healthy)

Why it exists: the bundled Lemonade sd-cpp backend crashes on CPUs without
AVX2 (FX-8350) and cannot run SD on the RX 580. We build stable-diffusion.cpp
from source (baseline x64 + Vulkan fp16 patch) and serve it separately; this
bridge keeps the public endpoint (127.0.0.1:13305) and the OpenAI schema that
downstream tools (genblaze lemonade_provider, lemonade examples, etc.) expect.

Routing rules:
  - Images always go to sd-server. Its OpenAI route ignores `steps`/`cfg_scale`
    from the JSON body, so the server must be started with --steps 4 --cfg-scale
    1.0 (see start_all.bat). `size` and `n` ARE honored.
  - Everything else is passed through to LemonadeServer unchanged (same path).
  - Unknown paths: try lemonade first, then sd-server; 404 if neither answers.

Run:  python bridge.py            (bind 0.0.0.0:13305 by default)
Env:   BRIDGE_HOST  BRIDGE_PORT   SD_PORT=13306  LEMONADE_PORT=13307
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SD_PORT = int(os.getenv("SD_PORT", "13306"))
LEM_PORT = int(os.getenv("LEMONADE_PORT", "13307"))
BRIDGE_HOST = os.getenv("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.getenv("BRIDGE_PORT", "13305"))
IMG_TIMEOUT = 600.0
GEN_TIMEOUT = 900.0

LOG_LOCK = threading.Lock()


def log(msg: str) -> None:
    with LOG_LOCK:
        sys.stderr.write(f"[bridge] {msg}\n")
        sys.stderr.flush()


def forward(method: str, path: str, body: bytes | None, port: int, timeout: float) -> tuple[int, str, bytes]:
    """Forward one request to an upstream HTTP/1.1 server and return its full response."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        conn.request(method, path, body=body)
        resp = conn.getresponse()
        # http.client already decoded chunked transfer-encoding, so the payload
        # length is correct to re-send with Content-Length.
        payload = resp.read()
        return resp.status, resp.getheader("Content-Type", "application/octet-stream"), payload
    finally:
        conn.close()


def sd_healthy() -> bool:
    try:
        status, _, _ = forward("GET", "/v1/models", None, SD_PORT, 3.0)
        return status < 500
    except Exception:
        return False


def lemonade_healthy() -> bool:
    for path in ("/api/v1/health", "/health"):
        try:
            status, _, _ = forward("GET", path, None, LEM_PORT, 3.0)
            if status < 500:
                return status < 400
        except Exception:
            continue
    return False


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SDCPPBridge/1.0"

    # ---- helpers ---------------------------------------------------------
    def _read_body(self) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length > 0 else None

    def _reply(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj) -> None:
        self._reply(status, json.dumps(obj).encode("utf-8"), "application/json")

    # ---- dispatch --------------------------------------------------------
    def _route(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if parsed.query:
            path = f"{path}?{parsed.query}"
        body = self._read_body()
        log(f"{method} {path}")

        if path in ("/health", "/api/v1/health"):
            sd = sd_healthy()
            lemon = lemonade_healthy()
            self._json(
                200 if sd else 503,
                {
                    "status": "ok" if sd else "degraded",
                    "sd_cpp": {"healthy": sd, "port": SD_PORT},
                    "lemonade": {"healthy": lemon, "port": LEM_PORT},
                },
            )
            return

        if path.startswith(("/api/v1/images/", "/v1/images/", "/v1/models", "/sdapi/v1/")):
            target = path[4:] if path.startswith("/api/") else path
            try:
                status, ctype, payload = forward(method, target, body, SD_PORT, IMG_TIMEOUT)
            except Exception as exc:  # noqa: BLE001
                log(f"sd-server forward failed: {exc!r}")
                self._json(502, {"error": f"sd-server unreachable: {exc!r}"})
                return
            self._reply(status, payload, ctype or "application/json")
            return

        # Everything else: Lemonade passthrough (chat, audio/speech, STT, ...).
        try:
            status, ctype, payload = forward(method, path, body, LEM_PORT, GEN_TIMEOUT)
        except Exception as exc:  # noqa: BLE001
            log(f"lemonade forward failed: {exc!r}")
            self._json(502, {"error": f"lemonade unreachable: {exc!r}"})
            return
        if status == 404:
            # Maybe the caller expected an sd-server route we didn't match.
            try:
                status, ctype, payload = forward(method, path, body, SD_PORT, IMG_TIMEOUT)
            except Exception:
                pass
        self._reply(status, payload, ctype or "application/json")

    def do_GET(self) -> None:
        self._route("GET")

    def do_POST(self) -> None:
        self._route("POST")

    def do_PUT(self) -> None:
        self._route("PUT")

    def do_DELETE(self) -> None:
        self._route("DELETE")

    def log_message(self, fmt, *args) -> None:  # silence default stderr noise
        pass


def main() -> None:
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)
    log(f"bridge listening on {BRIDGE_HOST}:{BRIDGE_PORT} -> sd-server:{SD_PORT} / lemonade:{LEM_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
