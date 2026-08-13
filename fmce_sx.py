"""
FMCE + Sovereign X Integration (JSON-RPC Bridge)

Updated to use persistent stdio JSON-RPC connection instead of subprocess spawn.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

# Import FMCE
from fmce import FMCE, ModelRole, EndpointConfig, RoleAssignment

# Import JSON-RPC bridge
from sx_jsonrpc_bridge import SXJsonRpcBridge, SXBridgeConfig


@dataclass
class SXCapabilityReport:
    """Result from Sovereign X capability probe."""
    adapter_id: str
    status: str
    server_up: bool
    generation_capable: bool
    downloaded_models: List[str]
    blockers: List[Dict[str, Any]]
    constitutional_log: Optional[Dict] = None
    images_status: str = ""
    raw: Dict = field(default_factory=dict)


@dataclass
class SXGenerateResult:
    """Result from Sovereign X image generation."""
    ok: bool
    status: str
    model: Optional[str]
    size: str
    steps: int
    byte_length: Optional[int]
    sha256: Optional[str]
    out_path: Optional[str]
    png_base64: Optional[str]
    attempts: List[Dict]
    provenance_gates: List[Dict]
    halt_cause_class: Optional[str]
    images_status: str
    constitutional_log: Optional[Dict]
    fallback_used: bool
    provider: str
    raw: Dict = field(default_factory=dict)


class FMCEWithSX(FMCE):
    """
    Extended FMCE that uses Sovereign X for image generation cascade.
    
    Uses persistent JSON-RPC bridge for zero-overhead Sovereign X calls.
    """
    
    def __init__(
        self,
        config_path: Optional[str] = None,
        auto_load: bool = True,
        sx_path: Optional[str] = None,
        sx_timeout: float = 120.0,
        sx_bridge_config: Optional[SXBridgeConfig] = None,
        **kwargs
    ):
        super().__init__(config_path=config_path, auto_load=auto_load, **kwargs)
        
        # Configure JSON-RPC bridge
        if sx_bridge_config:
            bridge_config = sx_bridge_config
            if sx_path:
                bridge_config.sx_path = sx_path
        else:
            bridge_config = SXBridgeConfig(
                sx_path=sx_path,
                request_timeout=sx_timeout,
            )
        
        self._sx_bridge = SXJsonRpcBridge(bridge_config)
        self._sx_available = None
        self._sx_started = False
    
    def _ensure_sx(self):
        """Lazy-start the bridge."""
        if not self._sx_started:
            self._sx_bridge.start()
            self._sx_started = True
    
    @property
    def sx_available(self) -> bool:
        """Check if Sovereign X is available (cached)."""
        if self._sx_available is None:
            try:
                self._ensure_sx()
                report = self._sx_bridge.health()
                self._sx_available = report.get("serverUp", False)
            except Exception:
                self._sx_available = False
        return self._sx_available
    
    def generate_image(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: str = "512x512",
        steps: int = 4,
        **kwargs
    ) -> Any:
        """
        Generate image using Sovereign X cascade if available,
        otherwise fall back to FMCE's default (single endpoint).
        """
        
        # Determine model
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            model, assignment = self._resolve_role_model(ModelRole.IMAGES)
            endpoint, model_id = self._parse_model(model)
        
        # If Lemonade endpoint and SX available, use cascade
        if endpoint == "lemonade" and self.sx_available:
            print(f"[FMCE+SX] Using Sovereign X cascade for {model_id}...")
            
            try:
                result = self._sx_bridge.generate(
                    prompt=prompt,
                    model=model_id,
                    size=size,
                    steps=steps,
                    use_cascade=True,
                    require_lawful_weights=kwargs.get("require_lawful_weights", True),
                )
                
                if result.get("ok") or result.get("pngBase64"):
                    # Return OpenAI-compatible format
                    class MockResponse:
                        def __init__(self, sx_result):
                            self.data = [{
                                "b64_json": sx_result.get("pngBase64"),
                                "url": None,
                            }]
                            self.sx_result = sx_result
                    
                    print(f"[FMCE+SX] ✓ Generated via {result.get('provider')} (fallback={result.get('fallbackUsed')})")
                    return MockResponse(result)
                
                print(f"[FMCE+SX] ✗ Cascade failed: {result.get('haltCauseClass')} - {result.get('imagesStatus')}")
                print("[FMCE+SX] Falling back to direct endpoint...")
                
            except Exception as e:
                print(f"[FMCE+SX] Bridge error: {e}")
                print("[FMCE+SX] Falling back to direct endpoint...")
        
        # Fallback to FMCE default (single endpoint)
        return super().generate_image(prompt, model, size, steps, **kwargs)
    
    def sx_probe(self, **kwargs) -> SXCapabilityReport:
        """Run Sovereign X capability probe."""
        self._ensure_sx()
        result = self._sx_bridge.probe(**kwargs)
        
        return SXCapabilityReport(
            adapter_id=result.get("adapterId", "sx.adapter.lemonade.sd"),
            status=result.get("status", "unknown"),
            server_up=result.get("serverUp", False),
            generation_capable=result.get("generationCapable", False),
            downloaded_models=result.get("downloadedImageModels", []),
            blockers=result.get("blockers", []),
            constitutional_log=result.get("constitutionalLog"),
            images_status=result.get("imagesStatus", ""),
            raw=result,
        )
    
    def sx_generate(self, **kwargs) -> SXGenerateResult:
        """Direct Sovereign X generation (bypasses FMCE role resolution)."""
        self._ensure_sx()
        result = self._sx_bridge.generate(**kwargs)
        
        return SXGenerateResult(
            ok=result.get("ok", False) or result.get("pixelsProduced", False),
            status=result.get("status", "unknown"),
            model=result.get("model"),
            size=result.get("size", kwargs.get("size", "512x512")),
            steps=result.get("steps", kwargs.get("steps", 4)),
            byte_length=result.get("byteLength"),
            sha256=result.get("sha256"),
            out_path=result.get("outPath"),
            png_base64=result.get("pngBase64"),
            attempts=result.get("attempts", []),
            provenance_gates=result.get("provenanceGates", []),
            halt_cause_class=result.get("haltCauseClass"),
            images_status=result.get("imagesStatus", ""),
            constitutional_log=result.get("constitutionalLog"),
            fallback_used=result.get("fallbackUsed", False),
            provider=result.get("imageGenProvider", result.get("provider", "unknown")),
            raw=result,
        )
    
    def sx_generate_direct(self, **kwargs) -> SXGenerateResult:
        """Direct Lemonade generation (no cascade)."""
        self._ensure_sx()
        result = self._sx_bridge.generate_direct(**kwargs)
        
        return SXGenerateResult(
            ok=result.get("ok", False),
            status=result.get("status", "unknown"),
            model=result.get("model"),
            size=result.get("size", kwargs.get("size", "512x512")),
            steps=result.get("steps", kwargs.get("steps", 4)),
            byte_length=result.get("byteLength"),
            sha256=result.get("sha256"),
            out_path=result.get("outPath"),
            png_base64=result.get("pngBase64"),
            attempts=result.get("attempts", []),
            provenance_gates=result.get("provenanceGates", []),
            halt_cause_class=result.get("haltCauseClass"),
            images_status=result.get("imagesStatus", ""),
            constitutional_log=result.get("constitutionalLog"),
            fallback_used=False,
            provider="lemonade-direct",
            raw=result,
        )
    
    def list_sx_models(self) -> List[str]:
        """List models available via Sovereign X cascade."""
        self._ensure_sx()
        result = self._sx_bridge.list_models()
        return result.get("models", [])
    
    def sx_health(self) -> Dict:
        """Quick health check."""
        self._ensure_sx()
        return self._sx_bridge.health()
    
    def sx_verify_weights(self, model_id: str, **kwargs) -> Dict:
        """Verify model weight checksums."""
        self._ensure_sx()
        return self._sx_bridge.verify_weights(model_id, **kwargs)
    
    def sx_classify_halt(self, error_info: Dict) -> str:
        """Classify halt cause from error."""
        self._ensure_sx()
        return self._sx_bridge.classify_halt(error_info)
    
    def close(self):
        """Close the bridge connection."""
        if self._sx_started:
            self._sx_bridge.stop()
            self._sx_started = False
    
    def __enter__(self) -> "FMCEWithSX":
        return self
    
    def __exit__(self, *args):
        self.close()
    
    def status(self) -> Dict[str, Any]:
        """Extended status including Sovereign X."""
        base_status = super().status()
        
        try:
            if self.sx_available:
                sx_report = self.sx_probe()
                base_status["sovereign_x"] = {
                    "available": True,
                    "bridge": "jsonrpc",
                    "server_up": sx_report.server_up,
                    "downloaded_models": sx_report.downloaded_models,
                    "generation_capable": sx_report.generation_capable,
                    "blockers": sx_report.blockers,
                    "images_status": sx_report.images_status,
                }
            else:
                base_status["sovereign_x"] = {
                    "available": False,
                    "bridge": "jsonrpc",
                    "reason": "Sovereign X not found or Lemonade server down",
                }
        except Exception as e:
            base_status["sovereign_x"] = {
                "available": False,
                "bridge": "jsonrpc",
                "error": str(e),
            }
        
        return base_status


# Convenience factory
def create_fmce_sx(
    config_path: Optional[str] = None,
    sx_path: Optional[str] = None,
    sx_timeout: float = 120.0,
    **overrides
) -> FMCEWithSX:
    """Create FMCE with Sovereign X integration (JSON-RPC bridge)."""
    fmce = FMCEWithSX(
        config_path=config_path,
        sx_path=sx_path,
        sx_timeout=sx_timeout,
        auto_load=True,
    )
    
    for ep_name, ep_overrides in overrides.items():
        if ep_name in fmce.config.endpoints:
            ep = fmce.config.endpoints[ep_name]
            for key, value in ep_overrides.items():
                if hasattr(ep, key):
                    setattr(ep, key, value)
    
    return fmce


# Demo
if __name__ == "__main__":
    print("=== FMCE + Sovereign X (JSON-RPC) Demo ===\n")
    
    with create_fmce_sx() as fmce:
        # Show status
        print("Status:")
        status = fmce.status()
        print(json.dumps(status, indent=2, default=str))
        
        # Probe SX capabilities
        if fmce.sx_available:
            print("\n=== Sovereign X Capability Probe ===")
            probe = fmce.sx_probe(try_generate=False)
            print(f"Server up: {probe.server_up}")
            print(f"Models: {probe.downloaded_models}")
            print(f"Generation capable: {probe.generation_capable}")
            print(f"Status: {probe.images_status}")
            
            # Test generation
            print("\n=== Test Generation (mandala pattern) ===")
            result = fmce.generate_image(
                "mandala pattern, geometric, sacred geometry, 4k, photorealistic",
                size="512x512",
                steps=4,
            )
            
            if hasattr(result, 'sx_result'):
                sx = result.sx_result
                print(f"Provider: {sx.get('provider')}")
                print(f"Fallback used: {sx.get('fallbackUsed')}")
                print(f"Model: {sx.get('model')}")
                print(f"SHA256: {sx.get('sha256')}")
                print(f"Constitutional log: {sx.get('constitutionalLog') is not None}")
            elif hasattr(result, 'data'):
                print("Generated via FMCE direct endpoint")
                print(f"Response keys: {result.data[0].keys()}")