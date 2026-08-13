"""
Sovereign X JSON-RPC Bridge Client (Python) — Hardened

Persistent stdio connection to Node.js bridge with:
- Protocol handshake on connect (bridge.hello)
- Heartbeat monitoring (background thread)
- Process death detection
- Automatic reconnect with backoff
- Structured error types
- Graceful shutdown forwarding
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


BRIDGE_PROTOCOL_VERSION = "1.0.0"


class BridgeErrorCode(Enum):
    """Structured error codes for bridge failures."""
    NOT_STARTED = "not_started"
    TIMEOUT = "timeout"
    PROCESS_DEAD = "process_dead"
    RPC_ERROR = "rpc_error"
    PROTOCOL_MISMATCH = "protocol_mismatch"
    RECONNECT_FAILED = "reconnect_failed"
    INTERNAL_ERROR = "internal_error"


class BridgeError(Exception):
    """Base bridge error with structured code."""
    def __init__(self, code: BridgeErrorCode, message: str, details: Optional[Dict] = None):
        self.code = code
        self.details = details or {}
        super().__init__(f"[{code.value}] {message}")


class BridgeTimeoutError(BridgeError):
    def __init__(self, method: str, timeout: float):
        super().__init__(
            BridgeErrorCode.TIMEOUT,
            f"Request '{method}' timed out after {timeout}s",
            {"method": method, "timeout": timeout},
        )


class BridgeProcessDiedError(BridgeError):
    def __init__(self, returncode: int):
        super().__init__(
            BridgeErrorCode.PROCESS_DEAD,
            f"Node process exited with code {returncode}",
            {"returncode": returncode},
        )


class BridgeRpcError(BridgeError):
    def __init__(self, code: int, message: str, data: Optional[str] = None):
        super().__init__(
            BridgeErrorCode.RPC_ERROR,
            f"RPC error {code}: {message}",
            {"rpc_code": code, "rpc_message": message, "data": data},
        )


@dataclass
class SXBridgeConfig:
    """Configuration for the bridge."""
    sx_path: str = ""
    node_cmd: str = "node"
    bridge_script: str = "bridge/sx-jsonrpc-bridge.mjs"
    startup_timeout: float = 15.0
    request_timeout: float = 120.0
    heartbeat_interval: float = 30.0
    heartbeat_timeout: float = 5.0
    max_reconnect_attempts: int = 3
    reconnect_backoff_base: float = 1.0
    env: Dict[str, str] = field(default_factory=dict)


class SXJsonRpcBridge:
    """
    Persistent JSON-RPC 2.0 client for Sovereign X bridge (hardened).

    Features:
    - Protocol handshake on connect
    - Background heartbeat monitoring
    - Automatic reconnect on process death
    - Structured error types
    - Graceful shutdown forwarding

    Usage:
        bridge = SXJsonRpcBridge()
        bridge.start()

        # Probe capabilities
        result = bridge.call("probe", {"tryGenerate": False})

        # Generate image
        result = bridge.call("generate", {"prompt": "mandala", "size": "512x512"})

        bridge.stop()
    """

    def __init__(self, config: Optional[SXBridgeConfig] = None):
        self.config = config or SXBridgeConfig()
        self._process: Optional[subprocess.Popen] = None
        self._request_id = 0
        self._pending: Dict[int, threading.Event] = {}
        self._responses: Dict[int, Dict] = {}
        self._lock = threading.Lock()
        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._running = False
        self._ready = threading.Event()
        self._ready_error: Optional[Exception] = None
        self._shutdown = threading.Event()
        self._last_heartbeat_ok = True
        self._consecutive_heartbeat_failures = 0
        self._heartbeat_failures_before_reconnect = 3
        self._protocol_ok = False

    def _resolve_paths(self) -> tuple[str, str]:
        """Resolve SX path and bridge script."""
        if self.config.sx_path:
            sx_path = self.config.sx_path
        else:
            sx_path = str(Path(__file__).parent / "sovereign-x")

        bridge_script = os.path.join(sx_path, self.config.bridge_script)

        if not os.path.exists(bridge_script):
            raise FileNotFoundError(f"Bridge script not found: {bridge_script}")

        return sx_path, bridge_script

    def _spawn_process(self) -> subprocess.Popen:
        """Spawn the Node bridge process."""
        sx_path, bridge_script = self._resolve_paths()

        env = {**os.environ, **self.config.env}
        env["NODE_PATH"] = sx_path

        return subprocess.Popen(
            [self.config.node_cmd, bridge_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
            cwd=sx_path,
        )

    def start(self) -> bool:
        """Start the bridge process with protocol handshake."""
        if self._running:
            return True

        self._shutdown.clear()
        self._ready.clear()
        self._ready_error = None

        try:
            self._process = self._spawn_process()
        except Exception as e:
            raise BridgeError(
                BridgeErrorCode.NOT_STARTED,
                f"Failed to start bridge process: {e}",
            ) from e

        self._running = True

        self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._reader_thread.start()

        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stderr_thread.start()

        if not self._ready.wait(timeout=self.config.startup_timeout):
            self._cleanup_process()
            raise BridgeError(
                BridgeErrorCode.NOT_STARTED,
                f"Bridge did not signal ready within {self.config.startup_timeout}s",
            )

        if self._ready_error:
            self._cleanup_process()
            raise self._ready_error

        try:
            self._do_handshake()
        except Exception as e:
            self._cleanup_process()
            raise BridgeError(
                BridgeErrorCode.PROTOCOL_MISMATCH,
                f"Protocol handshake failed: {e}",
            ) from e

        self._start_heartbeat()

        return True

    def _do_handshake(self):
        """Perform protocol version handshake."""
        hello = self.call("bridge.hello", {"protocol": BRIDGE_PROTOCOL_VERSION}, timeout=10.0)

        if not hello.get("compatible"):
            server_ver = hello.get("protocol", "unknown")
            raise BridgeError(
                BridgeErrorCode.PROTOCOL_MISMATCH,
                f"Protocol mismatch: client={BRIDGE_PROTOCOL_VERSION}, server={server_ver}",
                {"client": BRIDGE_PROTOCOL_VERSION, "server": server_ver},
            )

        self._protocol_ok = True

    def _start_heartbeat(self):
        """Start background heartbeat monitoring."""
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return

        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

    def _heartbeat_loop(self):
        """Send periodic ping to detect hung/dead process."""
        while self._running and not self._shutdown.is_set():
            self._shutdown.wait(timeout=self.config.heartbeat_interval)
            if self._shutdown.is_set():
                break

            try:
                result = self.call("ping", {}, timeout=self.config.heartbeat_timeout)
                if result.get("pong"):
                    self._consecutive_heartbeat_failures = 0
                    self._last_heartbeat_ok = True
            except Exception:
                self._consecutive_heartbeat_failures += 1
                self._last_heartbeat_ok = False

                if self._consecutive_heartbeat_failures >= self._heartbeat_failures_before_reconnect:
                    self._attempt_reconnect()

    def _attempt_reconnect(self):
        """Attempt to reconnect after heartbeat failures."""
        for attempt in range(1, self.config.max_reconnect_attempts + 1):
            try:
                self._cleanup_process(keep_state=True)

                self._process = self._spawn_process()
                self._ready.clear()

                self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
                self._reader_thread.start()

                self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
                self._stderr_thread.start()

                if self._ready.wait(timeout=self.config.startup_timeout):
                    self._do_handshake()
                    self._consecutive_heartbeat_failures = 0
                    self._last_heartbeat_ok = True
                    return

            except Exception:
                time.sleep(self.config.reconnect_backoff_base * attempt)

        self._running = False
        raise BridgeError(
            BridgeErrorCode.RECONNECT_FAILED,
            f"Failed to reconnect after {self.config.max_reconnect_attempts} attempts",
        )

    def _read_loop(self):
        """Background thread: read stdout lines and parse JSON-RPC responses."""
        if not self._process or not self._process.stdout:
            return

        try:
            for line in self._process.stdout:
                line = line.strip()
                if not line:
                    continue

                try:
                    response = json.loads(line)
                except json.JSONDecodeError:
                    continue

                req_id = response.get("id")
                if req_id is not None:
                    with self._lock:
                        self._responses[req_id] = response
                        if req_id in self._pending:
                            self._pending[req_id].set()
        except (ValueError, OSError):
            pass
        finally:
            if self._running and not self._shutdown.is_set():
                if self._process and self._process.poll() is not None:
                    self._ready_error = BridgeProcessDiedError(self._process.returncode)
                    self._ready.set()

    def _read_stderr(self):
        """Read stderr for structured events."""
        if not self._process or not self._process.stderr:
            return

        try:
            for line in self._process.stderr:
                line = line.strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)
                    if event.get("event") == "ready":
                        self._ready.set()
                except json.JSONDecodeError:
                    if "[SX Bridge] Ready" in line and not self._ready.is_set():
                        self._ready.set()
        except (ValueError, OSError):
            pass

    def call(
        self,
        method: str,
        params: Optional[Dict] = None,
        timeout: Optional[float] = None,
    ) -> Dict:
        """
        Call a JSON-RPC method.

        Args:
            method: Method name
            params: Method parameters
            timeout: Override default timeout

        Returns:
            Parsed result dict

        Raises:
            BridgeProcessDiedError: If the Node process has exited
            BridgeTimeoutError: If request times out
            BridgeRpcError: If the server returns an RPC error
        """
        if not self._running or not self._process:
            raise BridgeError(BridgeErrorCode.NOT_STARTED, "Bridge not started")

        if self._process.poll() is not None:
            self._running = False
            raise BridgeProcessDiedError(self._process.returncode)

        timeout = timeout or self.config.request_timeout

        with self._lock:
            self._request_id += 1
            req_id = self._request_id
            event = threading.Event()
            self._pending[req_id] = event

        request = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {},
        }

        try:
            request_line = json.dumps(request) + "\n"
            self._process.stdin.write(request_line)
            self._process.stdin.flush()
        except (BrokenPipeError, OSError) as e:
            with self._lock:
                self._pending.pop(req_id, None)
            if self._process.poll() is not None:
                self._running = False
                raise BridgeProcessDiedError(self._process.returncode) from e
            raise BridgeError(BridgeErrorCode.INTERNAL_ERROR, f"Failed to send: {e}") from e

        if not event.wait(timeout):
            with self._lock:
                self._pending.pop(req_id, None)
            raise BridgeTimeoutError(method, timeout)

        with self._lock:
            response = self._responses.pop(req_id, None)
            self._pending.pop(req_id, None)

        if not response:
            raise BridgeError(BridgeErrorCode.INTERNAL_ERROR, "No response received")

        if "error" in response:
            err = response["error"]
            raise BridgeRpcError(
                err.get("code", -32603),
                err.get("message", "Unknown error"),
                err.get("data"),
            )

        return response.get("result", {})

    def _cleanup_process(self, keep_state: bool = False):
        """Clean up the Node process."""
        self._running = False

        if self._process:
            try:
                self._process.stdin.close()
            except Exception:
                pass

            try:
                self._process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                self._process.kill()
                try:
                    self._process.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    pass

            self._process = None

        if self._reader_thread:
            self._reader_thread.join(timeout=2.0)
            self._reader_thread = None

        if self._stderr_thread:
            self._stderr_thread.join(timeout=1.0)
            self._stderr_thread = None

        if not keep_state:
            if self._heartbeat_thread:
                self._heartbeat_thread.join(timeout=1.0)
                self._heartbeat_thread = None

    def stop(self):
        """Stop the bridge gracefully."""
        self._shutdown.set()

        if self._running and self._process and self._process.poll() is None:
            try:
                self.call("bridge.shutdown", {"reason": "client_stop"}, timeout=5.0)
            except Exception:
                pass

        self._cleanup_process()

    @property
    def is_alive(self) -> bool:
        """Check if the bridge process is alive."""
        return (
            self._running
            and self._process is not None
            and self._process.poll() is None
        )

    @property
    def protocol_ok(self) -> bool:
        """Check if protocol handshake succeeded."""
        return self._protocol_ok

    def get_status(self) -> Dict:
        """Get bridge runtime status."""
        if not self.is_alive:
            return {"running": False}

        try:
            return self.call("bridge.status", {}, timeout=5.0)
        except Exception as e:
            return {"running": True, "error": str(e)}

    def __enter__(self) -> "SXJsonRpcBridge":
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def probe(
        self,
        try_generate: bool = False,
        model: Optional[str] = None,
        prompt: Optional[str] = None,
        size: str = "512x512",
        steps: int = 4,
        **kwargs,
    ) -> Dict:
        """Full capability probe."""
        return self.call("probe", {
            "tryGenerate": try_generate,
            "model": model,
            "prompt": prompt,
            "size": size,
            "steps": steps,
            **kwargs,
        })

    def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: str = "512x512",
        steps: int = 4,
        out_path: Optional[str] = None,
        use_cascade: bool = True,
        require_lawful_weights: bool = True,
        **kwargs,
    ) -> Dict:
        """Generate image via cascade."""
        return self.call("generate", {
            "prompt": prompt,
            "model": model,
            "size": size,
            "steps": steps,
            "outPath": out_path,
            "useProviderCascade": use_cascade,
            "requireLawfulWeights": require_lawful_weights,
            **kwargs,
        })

    def generate_direct(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: str = "512x512",
        steps: int = 4,
        out_path: Optional[str] = None,
        **kwargs,
    ) -> Dict:
        """Direct Lemonade generation (no cascade)."""
        return self.call("generate-direct", {
            "prompt": prompt,
            "model": model,
            "size": size,
            "steps": steps,
            "outPath": out_path,
            **kwargs,
        })

    def list_models(self) -> Dict:
        """List downloaded image models."""
        return self.call("list-models", {})

    def health(self) -> Dict:
        """Quick health check."""
        return self.call("health", {})

    def ping(self) -> Dict:
        """Liveness check."""
        return self.call("ping", {})

    def verify_weights(self, model_id: str, **kwargs) -> Dict:
        """Verify model weight checksums."""
        return self.call("verify-weights", {"modelId": model_id, **kwargs})

    def classify_halt(self, error_info: Dict) -> str:
        """Classify halt cause from error."""
        result = self.call("classify-halt", error_info)
        # Handle wrapped response with cklDecision/provenance
        if isinstance(result, dict):
            # Check if it's a wrapped response
            if "cklDecision" in result and "provenance" in result:
                # Extract the actual result from the wrapped response
                # The original result should be at the top level
                if isinstance(result.get("haltCauseClass"), str):
                    return result["haltCauseClass"]
                # Try to find it in the result
                for key, val in result.items():
                    if key not in ("cklDecision", "provenance", "governance") and isinstance(val, str) and val != "unknown":
                        return val
            if isinstance(result.get("haltCauseClass"), str):
                return result["haltCauseClass"]
            return result.get("result", "unknown") if isinstance(result.get("result"), str) else "unknown"
        if isinstance(result, str):
            return result
        return "unknown"

    # ===== OpenCL / Axiom-X methods (migrated from subprocess patterns) =====

    def opencl_gen_still(
        self,
        width: int = 512,
        height: int = 512,
        seed: float = 1.0,
        out_path: Optional[str] = None,
        report_path: Optional[str] = None,
        scene_json: Optional[Dict] = None,
        scene_path: Optional[str] = None,
        timeout_ms: int = 180_000,
        **kwargs,
    ) -> Dict:
        """CL-Gen scene-aware still via opencl_cl_gen_still.py."""
        return self.call("opencl.gen-still", {
            "width": width,
            "height": height,
            "seed": seed,
            "outPath": out_path,
            "reportPath": report_path,
            "sceneJson": scene_json,
            "scenePath": scene_path,
            "timeoutMs": timeout_ms,
            **kwargs,
        })

    def opencl_tonga_still(
        self,
        width: int = 256,
        height: int = 256,
        seed: float = 1.0,
        out_path: Optional[str] = None,
        report_path: Optional[str] = None,
        timeout_ms: int = 120_000,
        **kwargs,
    ) -> Dict:
        """OpenCL Tonga legacy still proof via opencl_tonga_still.py."""
        return self.call("opencl.tonga-still", {
            "width": width,
            "height": height,
            "seed": seed,
            "outPath": out_path,
            "reportPath": report_path,
            "timeoutMs": timeout_ms,
            **kwargs,
        })

    def axiom_x_gen_still(
        self,
        width: int = 256,
        height: int = 256,
        seed: float = 1.0,
        out_dir: Optional[str] = None,
        report_path: Optional[str] = None,
        intent_id: Optional[str] = None,
        world_id: Optional[str] = None,
        timeline_id: Optional[str] = None,
        timeout_ms: int = 120_000,
        **kwargs,
    ) -> Dict:
        """Axiom-X production still via run_production.py --mode still."""
        return self.call("axiom-x.gen-still", {
            "width": width,
            "height": height,
            "seed": seed,
            "outDir": out_dir,
            "reportPath": report_path,
            "intentId": intent_id,
            "worldId": world_id,
            "timelineId": timeline_id,
            "timeoutMs": timeout_ms,
            **kwargs,
        })

    # ===== UALS Bridge Backend Methods =====

    def uals_init(
        self,
        session_id: str,
        backend_id: str,
        backend_type: str = "opencl",
        max_tile_size: Optional[Dict] = None,
        supported_kernels: Optional[list] = None,
        determinism_level: str = "bit-exact",
        context: Optional[Dict] = None,
        intent: Optional[Dict] = None,
        evidence: Optional[Dict] = None,
        **kwargs,
    ) -> Dict:
        """Initialize UALS backend session via bridge."""
        return self.call("uals.init", {
            "sessionId": session_id,
            "backendId": backend_id,
            "backendType": backend_type,
            "maxTileSize": max_tile_size or {"width": 512, "height": 512},
            "supportedKernels": supported_kernels or [],
            "determinismLevel": determinism_level,
            "context": context or {},
            "intent": intent,
            "evidence": evidence,
            **kwargs,
        })

    def uals_execute(
        self,
        session_id: str,
        kernel_id: str,
        params: Optional[Dict] = None,
        tile: Optional[Dict] = None,
        intent: Optional[Dict] = None,
        evidence: Optional[Dict] = None,
        **kwargs,
    ) -> Dict:
        """Execute kernel via UALS backend."""
        return self.call("uals.execute", {
            "sessionId": session_id,
            "kernelId": kernel_id,
            "params": params or {},
            "tile": tile or {},
            "intent": intent,
            "evidence": evidence,
            **kwargs,
        })

    def uals_readback(
        self,
        session_id: str,
        tile_id: str,
        intent: Optional[Dict] = None,
        evidence: Optional[Dict] = None,
        **kwargs,
    ) -> Dict:
        """Readback tile output via UALS backend."""
        return self.call("uals.readback", {
            "sessionId": session_id,
            "tileId": tile_id,
            "intent": intent,
            "evidence": evidence,
            **kwargs,
        })

    def uals_teardown(
        self,
        session_id: str,
        intent: Optional[Dict] = None,
        evidence: Optional[Dict] = None,
        **kwargs,
    ) -> Dict:
        """Teardown UALS backend session."""
        return self.call("uals.teardown", {
            "sessionId": session_id,
            "intent": intent,
            "evidence": evidence,
            **kwargs,
        })


class SXBridgeCompat:
    """
    Drop-in replacement for the subprocess-based SovereignXBridge.
    Uses persistent JSON-RPC connection with all hardening features.
    """

    def __init__(self, sx_path: Optional[str] = None, **kwargs):
        config = SXBridgeConfig(sx_path=sx_path, **kwargs)
        self._bridge = SXJsonRpcBridge(config)
        self._started = False

    def _ensure_started(self):
        if not self._started:
            self._bridge.start()
            self._started = True

    def probe_capabilities(self, **kwargs) -> Dict:
        self._ensure_started()
        return self._bridge.probe(**kwargs)

    def generate_image(self, **kwargs) -> Dict:
        self._ensure_started()
        return self._bridge.generate(**kwargs)

    def close(self):
        self._bridge.stop()
        self._started = False

    def __enter__(self):
        self._ensure_started()
        return self

    def __exit__(self, *args):
        self.close()


if __name__ == "__main__":
    print("=== SX JSON-RPC Bridge (Hardened) Demo ===\n")

    with SXJsonRpcBridge() as bridge:
        print(f"Bridge started (alive={bridge.is_alive}, protocol_ok={bridge.protocol_ok})")

        status = bridge.get_status()
        print(f"\n--- Bridge Status ---")
        print(f"Uptime: {status.get('uptimeMs', 0)}ms")
        print(f"Requests served: {status.get('requestsServed', 0)}")
        print(f"Adapter loaded: {status.get('adapterLoaded', False)}")

        print("\n--- Health Check ---")
        health = bridge.health()
        print(f"Server up: {health.get('serverUp')}")
        print(f"Status: {health.get('status')}")

        print("\n--- List Models ---")
        models = bridge.list_models()
        print(f"Downloaded: {models.get('models', [])}")

        print("\n--- Capability Probe ---")
        probe = bridge.probe(try_generate=False)
        print(f"Generation capable: {probe.get('generationCapable')}")
        print(f"Models: {probe.get('downloadedImageModels', [])}")
        print(f"Status: {probe.get('imagesStatus', '')}")
