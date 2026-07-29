"""Shared helpers for local uvicorn-backed smoke tests."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import httpx


def reserve_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return int(port)


def wait_for_health(base_url: str, *, timeout_seconds: float = 30.0) -> dict:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    with httpx.Client(timeout=5.0) as client:
        while time.time() < deadline:
            try:
                resp = client.get(f"{base_url}/health")
                if resp.status_code == 200:
                    return resp.json()
            except Exception as exc:  # noqa: BLE001
                last_error = exc
            time.sleep(0.5)
    if last_error is not None:
        raise AssertionError(f"server never became healthy: {last_error}") from last_error
    raise AssertionError("server never became healthy")


@contextmanager
def run_live_server(tmp_path: Path) -> Iterator[str]:
    """Boot uvicorn for the app and yield the base URL."""
    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.setdefault("GENBLAZE_DRY_RUN", "1")
    env["GENBLAZE_PREVIEW_CACHE_DIR"] = str(tmp_path / "preview-cache")

    workdir = Path(__file__).resolve().parents[1]
    proc = subprocess.Popen(  # noqa: S603
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(workdir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_health(base_url)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
