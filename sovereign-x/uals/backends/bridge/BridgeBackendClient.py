/**
 * UALS Bridge Backend Client — Python side
 * Communicates with Node bridge server via JSON-RPC for UALS operations.
 */

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

# Import our hardened bridge client
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))

from sx_jsonrpc_bridge import SXJsonRpcBridge, SXBridgeConfig


class UALSBridgeClient:
    """
    Python client for UALS operations over the hardened JSON-RPC bridge.
    """

    def __init__(self, config: Optional[SXBridgeConfig] = None):
        self.config = config or SXBridgeConfig()
        self._bridge = SXJsonRpcBridge(self.config)
        self._started = False

    def start(self):
        if not self._started:
            self._bridge.start()
            self._started = True

    def stop(self):
        if self._started:
            self._bridge.stop()
            self._started = False

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def call(self, method: str, params: Dict) -> Dict:
        """Call a UALS method via the bridge."""
        if not self._started:
            self.start()
        return self._bridge.call(method, params)

    # UALS-specific methods

    def uals_init(
        self,
        session_id: str,
        backend_id: str,
        backend_type: str,
        max_tile_size: Dict,
        supported_kernels: list,
        determinism_level: str,
        context: Optional[Dict] = None,
    ) -> Dict:
        """Initialize UALS backend via bridge."""
        return self.call("uals.init", {
            "sessionId": session_id,
            "backendId": backend_id,
            "backendType": backend_type,
            "maxTileSize": max_tile_size,
            "supportedKernels": supported_kernels,
            "determinismLevel": determinism_level,
            "context": context or {},
        })

    def uals_execute(
        self,
        session_id: str,
        kernel_id: str,
        params: Dict,
        tile: Dict,
    ) -> Dict:
        """Execute kernel via bridge."""
        return self.call("uals.execute", {
            "sessionId": session_id,
            "kernelId": kernel_id,
            "params": params,
            "tile": tile,
        })

    def uals_readback(self, session_id: str, tile_id: str) -> Dict:
        """Readback output via bridge."""
        return self.call("uals.readback", {
            "sessionId": session_id,
            "tileId": tile_id,
        })

    def uals_teardown(self, session_id: str) -> Dict:
        """Teardown backend via bridge."""
        return self.call("uals.teardown", {
            "sessionId": session_id,
        })


async def createBridgeClient(config: Optional[Dict] = None) -> UALSBridgeClient:
    """
    Factory to create and start a UALS bridge client.
    """
    bridge_config = None
    if config:
        bridge_config = SXBridgeConfig(
            sx_path=config.get("sx_path", ""),
            node_cmd=config.get("node_cmd", "node"),
            startup_timeout=config.get("startup_timeout", 15.0),
            request_timeout=config.get("request_timeout", 120.0),
        )
    client = UALSBridgeClient(bridge_config)
    client.start()
    return client


# Sync wrapper for non-async usage
class SyncUALSBridgeClient(UALSBridgeClient):
    """Synchronous wrapper for BridgeBackend."""
    pass


if __name__ == "__main__":
    # Test the client
    print("=== UALS Bridge Client Demo ===")
    with SyncUALSBridgeClient() as client:
        print("Bridge started")
        result = client.uals_init(
            session_id="test-session",
            backend_id="test-backend",
            backend_type="opencl",
            max_tile_size={"width": 512, "height": 512},
            supported_kernels=["legacy_still_256"],
            determinism_level="bit-exact",
        )
        print(f"Init result: {result}")