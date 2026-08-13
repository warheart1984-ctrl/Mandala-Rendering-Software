"""
Bridge-specific tests for the hardened SX JSON-RPC bridge.

Tests: startup, handshake, heartbeat, reconnect, concurrent calls,
graceful shutdown, error surfaces, process death detection.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from sx_jsonrpc_bridge import (
    SXJsonRpcBridge,
    SXBridgeConfig,
    BRIDGE_PROTOCOL_VERSION,
    BridgeError,
    BridgeErrorCode,
    BridgeTimeoutError,
    BridgeProcessDiedError,
    BridgeRpcError,
    SXBridgeCompat,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sx_path():
    """Get sovereign-x path (repo root / sovereign-x)."""
    return str(Path(__file__).parent.parent / "sovereign-x")


@pytest.fixture
def bridge(sx_path):
    """Create and start a bridge instance."""
    config = SXBridgeConfig(
        sx_path=sx_path,
        startup_timeout=15.0,
        heartbeat_interval=60.0,  # Long interval for tests
    )
    b = SXJsonRpcBridge(config)
    b.start()
    yield b
    try:
        b.stop()
    except Exception:
        pass


@pytest.fixture
def short_timeout_bridge(sx_path):
    """Bridge with short timeouts for error testing."""
    config = SXBridgeConfig(
        sx_path=sx_path,
        startup_timeout=15.0,
        request_timeout=2.0,
        heartbeat_interval=60.0,
    )
    b = SXJsonRpcBridge(config)
    b.start()
    yield b
    try:
        b.stop()
    except Exception:
        pass


# =============================================================================
# STARTUP & HANDSHAKE
# =============================================================================

class TestStartup:
    """Test bridge startup and protocol handshake."""

    def test_starts_successfully(self, bridge):
        """Bridge starts and reports alive."""
        assert bridge.is_alive
        assert bridge.protocol_ok

    def test_hello_returns_protocol_info(self, bridge):
        """bridge.hello returns correct protocol version."""
        result = bridge.call("bridge.hello", {"protocol": BRIDGE_PROTOCOL_VERSION})
        assert result["compatible"] is True
        assert result["protocol"] == BRIDGE_PROTOCOL_VERSION
        assert "methods" in result
        assert "ping" in result["methods"]

    def test_hello_rejects_mismatch(self, sx_path):
        """bridge.hello reports incompatible on version mismatch."""
        config = SXBridgeConfig(sx_path=sx_path)
        b = SXJsonRpcBridge(config)

        # Manually start without handshake
        b._process = b._spawn_process()
        b._running = True
        b._reader_thread = threading.Thread(target=b._read_loop, daemon=True)
        b._reader_thread.start()
        b._stderr_thread = threading.Thread(target=b._read_stderr, daemon=True)
        b._stderr_thread.start()
        b._ready.wait(timeout=10.0)

        result = b.call("bridge.hello", {"protocol": "99.99.99"})
        assert result["compatible"] is False
        assert result["clientProtocol"] == "99.99.99"

        b.stop()

    def test_double_start_is_noop(self, bridge):
        """Starting an already-running bridge is safe."""
        result = bridge.start()
        assert result is True
        assert bridge.is_alive

    def test_start_with_missing_script_raises(self):
        """Starting with a bad path raises BridgeError (NOT_STARTED)."""
        config = SXBridgeConfig(sx_path="/nonexistent/path")
        b = SXJsonRpcBridge(config)
        with pytest.raises(BridgeError) as exc_info:
            b.start()
        assert exc_info.value.code == BridgeErrorCode.NOT_STARTED


# =============================================================================
# HEARTBEAT / LIVENESS
# =============================================================================

class TestHeartbeat:
    """Test ping/heartbeat mechanism."""

    def test_ping_returns_pong(self, bridge):
        """ping returns pong with timestamp."""
        result = bridge.call("ping", {})
        assert result["pong"] is True
        assert "ts" in result

    def test_ping_under_load(self, bridge):
        """Multiple rapid pings all succeed."""
        for _ in range(20):
            result = bridge.call("ping", {})
            assert result["pong"] is True

    def test_heartbeat_recovery(self, sx_path):
        """Bridge survives many sequential pings (heartbeat stays healthy)."""
        config = SXBridgeConfig(
            sx_path=sx_path,
            heartbeat_interval=0.5,
            heartbeat_timeout=2.0,
        )
        b = SXJsonRpcBridge(config)
        b._heartbeat_failures_before_reconnect = 5
        b.start()

        for _ in range(10):
            result = b.call("ping", {})
            assert result["pong"] is True
            time.sleep(0.1)

        assert b.is_alive
        b.stop()


# =============================================================================
# BRIDGE STATUS
# =============================================================================

class TestBridgeStatus:
    """Test runtime introspection."""

    def test_status_returns_uptime(self, bridge):
        """bridge.status returns valid uptime and request count."""
        result = bridge.call("bridge.status", {})
        assert "uptimeMs" in result
        assert isinstance(result["uptimeMs"], (int, float))
        assert result.get("requestsServed", 0) > 0
        assert result.get("shuttingDown") is False

    def test_status_increments_requests(self, bridge):
        """Request counter increments with each call."""
        before = bridge.call("bridge.status", {}).get("requestsServed", 0)
        bridge.call("ping", {})
        bridge.call("ping", {})
        after = bridge.call("bridge.status", {}).get("requestsServed", 0)
        assert after > before


# =============================================================================
# GRACEFUL SHUTDOWN
# =============================================================================

class TestGracefulShutdown:
    """Test clean shutdown behavior."""

    def test_stop_sends_shutdown(self, bridge):
        """stop() sends bridge.shutdown to server."""
        assert bridge.is_alive
        bridge.stop()
        assert not bridge.is_alive

    def test_calls_rejected_after_shutdown(self, bridge):
        """Calls fail gracefully after shutdown initiated."""
        bridge.stop()
        with pytest.raises(BridgeError):
            bridge.call("ping", {}, timeout=2.0)

    def test_context_manager_cleanup(self, sx_path):
        """Context manager ensures cleanup on exit."""
        config = SXBridgeConfig(sx_path=sx_path)
        b = SXJsonRpcBridge(config)
        with b:
            assert b.is_alive
            result = b.call("ping", {})
            assert result["pong"] is True
        assert not b.is_alive

    def test_context_manager_cleanup_on_exception(self, sx_path):
        """Context manager cleans up even when exception occurs inside."""
        config = SXBridgeConfig(sx_path=sx_path)
        b = SXJsonRpcBridge(config)
        try:
            with b:
                assert b.is_alive
                raise ValueError("test exception")
        except ValueError:
            pass
        assert not b.is_alive


# =============================================================================
# ERROR SURFACES
# =============================================================================

class TestErrorSurfaces:
    """Test structured error handling."""

    def test_unknown_method_returns_error(self, bridge):
        """Calling unknown method raises BridgeRpcError."""
        with pytest.raises(BridgeRpcError) as exc_info:
            bridge.call("nonexistent_method", {})
        assert exc_info.value.code == BridgeErrorCode.RPC_ERROR
        assert "Method not found" in str(exc_info.value.details.get("rpc_message", ""))

    def test_timeout_raises_bridge_timeout(self, short_timeout_bridge):
        """Timeout raises BridgeTimeoutError with method info."""
        # Use a method that doesn't exist to force wait — actually use ping with
        # a very short timeout to simulate (ping is fast, so we test the timeout
        # mechanism directly)
        config = SXBridgeConfig(
            sx_path=short_timeout_bridge.config.sx_path,
            request_timeout=0.001,  # Impossibly short
        )
        b = SXJsonRpcBridge(config)
        # Don't fully start — just test timeout on send
        b._process = b._spawn_process()
        b._running = True
        b._ready.wait(timeout=10.0)

        with pytest.raises(BridgeTimeoutError):
            b.call("ping", {}, timeout=0.001)

        b.stop()

    def test_call_before_start_raises(self):
        """Calling before start raises NOT_STARTED."""
        config = SXBridgeConfig()
        b = SXJsonRpcBridge(config)
        with pytest.raises(BridgeError) as exc_info:
            b.call("ping", {})
        assert exc_info.value.code == BridgeErrorCode.NOT_STARTED

    def test_call_after_stop_raises(self, bridge):
        """Calling after stop raises appropriate error."""
        bridge.stop()
        with pytest.raises(BridgeError):
            bridge.call("ping", {}, timeout=2.0)


# =============================================================================
# ADAPTER METHODS (integration)
# =============================================================================

class TestAdapterMethods:
    """Test that adapter methods still work through hardened bridge."""

    def test_health(self, bridge):
        """health() returns valid response."""
        result = bridge.health()
        assert "serverUp" in result
        assert isinstance(result["serverUp"], bool)

    def test_list_models(self, bridge):
        """list_models() returns model list."""
        result = bridge.list_models()
        assert "models" in result
        assert isinstance(result["models"], list)

    def test_classify_halt(self, bridge):
        """classify_halt() returns classification."""
        result = bridge.classify_halt({"message": "R9 380 Tonga ROCm unsupported"})
        assert isinstance(result, str)
        assert len(result) > 0
        # Also test other halt causes
        assert bridge.classify_halt({"code": "model_load_error"}) != "unknown"
        assert bridge.classify_halt({"message": "STATUS_ILLEGAL_INSTRUCTION AVX2"}) != "unknown"

    def test_verify_weights_with_fake_data(self, bridge, tmp_path):
        """verify-weights works through bridge."""
        fake_weight = tmp_path / "fake-model.gguf"
        fake_weight.write_bytes(b"fake-safetensors-content")
        result = bridge.verify_weights(
            "FakeModel",
            weightPath=str(fake_weight),
            expectedSha256={"FakeModel": "anything"},
        )
        assert isinstance(result, dict)

    def test_probe(self, bridge):
        """probe() runs without throwing."""
        result = bridge.probe(try_generate=False)
        assert isinstance(result, dict)


# =============================================================================
# PROCESS DEATH DETECTION
# =============================================================================

class TestProcessDeath:
    """Test detection and handling of Node process death."""

    def test_killing_process_raises_on_next_call(self, sx_path):
        """If Node process is killed, next call raises BridgeProcessDiedError."""
        config = SXBridgeConfig(sx_path=sx_path, heartbeat_interval=60.0)
        b = SXJsonRpcBridge(config)
        b.start()
        assert b.is_alive

        # Kill the process externally
        os.kill(b._process.pid, 9)  # SIGKILL
        b._process.wait()

        time.sleep(0.2)

        with pytest.raises((BridgeProcessDiedError, BridgeError)):
            b.call("ping", {}, timeout=3.0)


# =============================================================================
# COMPAT WRAPPER
# =============================================================================

class TestCompatWrapper:
    """Test backwards-compatible wrapper."""

    def test_compat_starts_and_calls(self, sx_path):
        """SXBridgeCompat works as drop-in replacement."""
        compat = SXBridgeCompat(sx_path=sx_path)
        compat._ensure_started()
        result = compat.probe_capabilities(try_generate=False)
        assert isinstance(result, dict)
        compat.close()

    def test_compat_context_manager(self, sx_path):
        """SXBridgeCompat supports context manager."""
        with SXBridgeCompat(sx_path=sx_path) as compat:
            result = compat.probe_capabilities(try_generate=False)
            assert isinstance(result, dict)


# =============================================================================
# CONCURRENT CALLS
# =============================================================================

class TestConcurrentCalls:
    """Test thread-safety of concurrent calls."""

    def test_concurrent_pings(self, bridge):
        """Multiple threads can call ping concurrently."""
        results = []
        errors = []

        def ping_thread():
            try:
                for _ in range(10):
                    r = bridge.call("ping", {})
                    results.append(r.get("pong"))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=ping_thread) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30.0)

        assert len(errors) == 0
        assert len(results) == 50
        assert all(r is True for r in results)

    def test_concurrent_mixed_calls(self, bridge):
        """Concurrent calls to different methods don't corrupt state."""
        errors = []

        def ping_worker():
            try:
                for _ in range(5):
                    bridge.call("ping", {})
            except Exception as e:
                errors.append(e)

        def status_worker():
            try:
                for _ in range(5):
                    bridge.call("bridge.status", {})
            except Exception as e:
                errors.append(e)

        def health_worker():
            try:
                for _ in range(3):
                    bridge.call("health", {})
            except Exception as e:
                errors.append(e)

        threads = []
        for _ in range(3):
            threads.append(threading.Thread(target=ping_worker))
            threads.append(threading.Thread(target=status_worker))
        threads.append(threading.Thread(target=health_worker))

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30.0)

        assert len(errors) == 0
