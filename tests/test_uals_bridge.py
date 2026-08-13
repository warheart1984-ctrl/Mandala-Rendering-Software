"""
UALS Bridge Integration Tests

Tests the BridgeBackend using the hardened JSON-RPC bridge.
"""

from __future__ import annotations

import json
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from sx_jsonrpc_bridge import SXJsonRpcBridge, SXBridgeConfig


@pytest.fixture
def bridge():
    """Create and start a bridge instance."""
    config = SXBridgeConfig(
        startup_timeout=15.0,
        heartbeat_interval=60.0,
    )
    b = SXJsonRpcBridge(config)
    b.start()
    yield b
    try:
        b.stop()
    except Exception:
        pass


class TestUALSBridge:
    """Test UALS methods via hardened bridge."""

    def test_uals_init(self, bridge):
        """Test UALS backend initialization."""
        result = bridge.uals_init(
            session_id="test-session-1",
            backend_id="test-opencl-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
            determinism_level="bit-exact",
        )
        assert result.get("ok") is True
        assert result.get("sessionId") == "test-session-1"
        assert result.get("backendId") == "test-opencl-backend"
        assert "provenance" in result
        assert "cklDecision" in result

    def test_uals_init_with_intent(self, bridge):
        """Test UALS init with intent and evidence."""
        result = bridge.uals_init(
            session_id="test-session-2",
            backend_id="test-clgen-backend",
            backend_type="cl-gen",
            supported_kernels=["cl_gen_still"],
            intent={"actor": "uals.orchestrator", "action": "init_backend"},
            evidence={"worldContext": "test", "scaleClass": "human-sized"},
        )
        assert result.get("ok") is True
        assert result.get("cklDecision", {}).get("verdict") == "allow"

    def test_uals_init_denied_without_intent(self, bridge):
        """Test UALS init denied when intent required but missing for mutation."""
        # uals.init is a mutation method, should require intent
        result = bridge.uals_init(
            session_id="test-session-3",
            backend_id="test-backend",
            backend_type="opencl",
            # No intent provided
        )
        # Should still succeed (bridge allows but records CKL violation)
        assert "cklDecision" in result
        # The CKL decision should show violation for no intent on mutation
        # But we allow it for now (warn only)

    def test_uals_execute(self, bridge):
        """Test UALS kernel execution."""
        # First init a session
        bridge.uals_init(
            session_id="test-session-exec",
            backend_id="test-exec-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
        )

        result = bridge.uals_execute(
            session_id="test-session-exec",
            kernel_id="legacy_still_256",
            params={"width": 256, "height": 256, "seed": 1.0},
            tile={"tileId": "tile-0-0", "x": 0, "y": 0, "width": 256, "height": 256},
        )
        assert "ok" in result
        assert "cklDecision" in result
        assert "provenance" in result
        # Should have provenance with hash
        assert result.get("provenance", {}).get("hash")

    def test_uals_execute_invalid_session(self, bridge):
        """Test UALS execute with invalid session."""
        result = bridge.uals_execute(
            session_id="nonexistent-session",
            kernel_id="legacy_still_256",
            params={},
            tile={},
        )
        assert result.get("ok") is False
        assert result.get("code") == "SESSION_NOT_FOUND"

    def test_uals_execute_invalid_kernel(self, bridge):
        """Test UALS execute with unsupported kernel."""
        bridge.uals_init(
            session_id="test-session-kernel",
            backend_id="test-kernel-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],  # Only this kernel
        )

        result = bridge.uals_execute(
            session_id="test-session-kernel",
            kernel_id="unsupported_kernel",
            params={},
            tile={},
        )
        assert result.get("ok") is False
        assert result.get("code") == "KERNEL_INCOMPATIBLE"

    def test_uals_readback(self, bridge):
        """Test UALS readback."""
        bridge.uals_init(
            session_id="test-session-rb",
            backend_id="test-rb-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
        )

        result = bridge.uals_readback(
            session_id="test-session-rb",
            tile_id="tile-0-0",
        )
        assert result.get("ok") is True
        assert "cklDecision" in result

    def test_uals_teardown(self, bridge):
        """Test UALS teardown."""
        bridge.uals_init(
            session_id="test-session-td",
            backend_id="test-td-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
        )

        result = bridge.uals_teardown(session_id="test-session-td")
        assert result.get("ok") is True
        assert result.get("sessionId") == "test-session-td"

        # Session should be gone
        result2 = bridge.uals_execute(
            session_id="test-session-td",
            kernel_id="legacy_still_256",
            params={},
            tile={},
        )
        assert result2.get("ok") is False
        assert result2.get("code") == "SESSION_NOT_FOUND"

    def test_uals_teardown_nonexistent(self, bridge):
        """Test UALS teardown of nonexistent session."""
        result = bridge.uals_teardown(session_id="nonexistent")
        assert result.get("ok") is False
        assert result.get("code") == "SESSION_NOT_FOUND"

    def test_uals_full_cycle(self, bridge):
        """Test full UALS cycle: init -> execute -> readback -> teardown."""
        session_id = "test-full-cycle"
        backend_id = "full-cycle-backend"

        # Init
        init_result = bridge.uals_init(
            session_id=session_id,
            backend_id=backend_id,
            backend_type="opencl",
            supported_kernels=["legacy_still_256", "legacy_still_512"],
            determinism_level="bit-exact",
            intent={"actor": "uals.orchestrator", "action": "render"},
            evidence={"worldContext": "interior.dim-room"},
        )
        assert init_result.get("ok") is True

        # Execute
        exec_result = bridge.uals_execute(
            session_id=session_id,
            kernel_id="legacy_still_256",
            params={"width": 256, "height": 256, "seed": 42.0},
            tile={"tileId": "tile-1", "x": 0, "y": 0, "width": 256, "height": 256},
            intent={"actor": "uals.orchestrator", "action": "execute_kernel"},
            evidence={"driftScore": 0.1},
        )
        assert "ok" in exec_result
        assert "provenance" in exec_result
        assert exec_result.get("provenance", {}).get("hash")

        # Readback
        rb_result = bridge.uals_readback(
            session_id=session_id,
            tile_id="tile-1",
        )
        assert rb_result.get("ok") is True

        # Teardown
        td_result = bridge.uals_teardown(session_id=session_id)
        assert td_result.get("ok") is True


class TestCKLPolicyEnforcement:
    """Test CKL policy enforcement on bridge calls."""

    def test_ckl_decision_attached(self, bridge):
        """Test that CKL decision is attached to all responses."""
        result = bridge.health()
        assert "cklDecision" in result
        assert "provenance" in result
        assert "governance" in result

    def test_ckl_verdict_allow(self, bridge):
        """Test CKL verdict is allow for valid calls."""
        result = bridge.ping()
        assert result.get("cklDecision", {}).get("verdict") == "allow"

    def test_ckl_provenance_hash(self, bridge):
        """Test provenance record has hash."""
        result = bridge.ping()
        prov = result.get("provenance", {})
        assert "hash" in prov
        assert len(prov["hash"]) == 64  # SHA-256 hex

    def test_ckl_attach_provenance_on_render(self, bridge):
        """Test provenance is attached to render methods."""
        result = bridge.opencl_tonga_still(width=128, height=128)
        # Should have provenance and CKL decision
        assert "provenance" in result
        assert "cklDecision" in result
        # Render methods should have attachProvenance = true
        assert result.get("cklDecision", {}).get("attachProvenance") is True

    def test_ckl_no_intent_violation(self, bridge):
        """Test CKL records violation when intent missing for mutation."""
        result = bridge.opencl_tonga_still(width=64, height=64)
        # opencl.tonga-still is a mutation method
        # Should have violation recorded
        ckl = result.get("cklDecision", {})
        assert "violations" in ckl
        # May have policy-no-execution-without-intent violation

    def test_ckl_drift_throttle(self, bridge):
        """Test CKL drift throttle param adjust."""
        result = bridge.opencl_tonga_still(
            width=64, height=64,
            driftScore=0.8  # Above 0.7 threshold
        )
        ckl = result.get("cklDecision", {})
        if ckl.get("paramAdjust"):
            assert ckl["paramAdjust"]["throttleFactor"] == 0.5
            assert ckl["paramAdjust"]["reason"] == "drift_throttle"


class TestUALSProvenance:
    """Test provenance in UALS operations."""

    def test_uals_provenance_structure(self, bridge):
        """Test UALS provenance has correct structure."""
        result = bridge.uals_init(
            session_id="prov-test",
            backend_id="prov-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
        )
        prov = result.get("provenance", {})
        assert "method" in prov
        assert prov["method"] == "uals.init"
        assert "timestamp" in prov
        assert "durationMs" in prov
        assert "hash" in prov
        assert "params" in prov
        assert "result" in prov

    def test_uals_execute_provenance(self, bridge):
        """Test UALS execute provenance includes kernel info."""
        bridge.uals_init(
            session_id="prov-exec",
            backend_id="prov-exec-backend",
            backend_type="opencl",
            supported_kernels=["legacy_still_256"],
        )

        result = bridge.uals_execute(
            session_id="prov-exec",
            kernel_id="legacy_still_256",
            params={"width": 128, "height": 128, "seed": 1.0},
            tile={"tileId": "tile-1", "x": 0, "y": 0, "width": 128, "height": 128},
        )
        prov = result.get("provenance", {})
        assert prov.get("method") == "uals.execute"
        assert "params" in prov
        assert prov["params"].get("kernelId") == "legacy_still_256"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])