"""Constitutional Render Session — SovereignXBridge integration.

Wires SovereignXBridge into render session lifecycle per Section 7 (Deterministic Runtime Invariants)
and the Constitutional Engine (engine/governance/).
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable

from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema
from daniel_blueprint.adapters import get_adapter, IRendererAdapter, RenderSettings, PassResult
from daniel_blueprint.schemas.envlock import EnvLock


@dataclass
class InvariantSet:
    """Section 7 invariants locked for a render session."""
    # Seed Invariants (7.1)
    random_seed: int
    # Geometry Invariants (7.2)
    subdivision_levels: Dict[str, int] = field(default_factory=dict)
    displacement_amplitudes: Dict[str, float] = field(default_factory=dict)
    # Shading Invariants (7.3)
    texture_filter_mode: str = "trilinear"
    texture_mip_bias: float = 0.0
    brdf_model: str = "GGX"
    brdf_version: str = "1.0"
    # Lighting Invariants (7.4)
    ies_hashes: Dict[str, str] = field(default_factory=dict)
    hdri_sha256: str = ""
    sky_model: str = "hosek-wilkie"
    sky_model_version: str = "1.0"
    # Camera Invariants (7.5)
    focal_length_mm: float = 35.0
    aperture_fstop: float = 2.8
    sensor_width_mm: float = 24.9
    sensor_height_mm: float = 18.7
    projection_matrix: List[float] = field(default_factory=list)  # 16 floats
    # Temporal Invariants (7.6)
    frame_rate: str = "24000/1001"
    shutter_open: float = -0.25
    shutter_close: float = 0.25
    motion_blur_samples: int = 5
    # Renderer Invariants
    renderer_version: str = ""
    renderer_name: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "random_seed": self.random_seed,
            "subdivision_levels": self.subdivision_levels,
            "displacement_amplitudes": self.displacement_amplitudes,
            "texture_filter_mode": self.texture_filter_mode,
            "texture_mip_bias": self.texture_mip_bias,
            "brdf_model": self.brdf_model,
            "brdf_version": self.brdf_version,
            "ies_hashes": self.ies_hashes,
            "hdri_sha256": self.hdri_sha256,
            "sky_model": self.sky_model,
            "sky_model_version": self.sky_model_version,
            "focal_length_mm": self.focal_length_mm,
            "aperture_fstop": self.aperture_fstop,
            "sensor_width_mm": self.sensor_width_mm,
            "sensor_height_mm": self.sensor_height_mm,
            "projection_matrix": self.projection_matrix,
            "frame_rate": self.frame_rate,
            "shutter_open": self.shutter_open,
            "shutter_close": self.shutter_close,
            "motion_blur_samples": self.motion_blur_samples,
            "renderer_version": self.renderer_version,
            "renderer_name": self.renderer_name,
        }
    
    @classmethod
    def from_prompt_schema(cls, schema: RenderPromptSchema, envlock: EnvLock, renderer: IRendererAdapter) -> "InvariantSet":
        """Build invariants from prompt schema, envlock, and renderer."""
        cam = schema.camera
        light = schema.primary_light_source
        
        # Map sensor size enum to dimensions
        sensor_dims = {
            "Super35": (24.9, 18.7),
            "FullFrame": (36.0, 24.0),
            "IMAX": (70.4, 52.6),
        }
        sensor_w, sensor_h = sensor_dims.get(cam.sensor_size.value, (24.9, 18.7))
        
        # Compute projection matrix
        proj_matrix = compute_projection_matrix(
            cam.focal_length_mm,
            sensor_w,
            sensor_h,
            cam.aperture_fstop,
        )
        
        return cls(
            random_seed=schema.random_seed or 0xDEADBEEF,
            subdivision_levels={},  # Populated from scene
            displacement_amplitudes={},  # Populated from materials
            texture_filter_mode="trilinear",
            texture_mip_bias=0.0,
            brdf_model="GGX",
            brdf_version="1.0",
            ies_hashes=envlock.ies_hashes,
            hdri_sha256=envlock.hdri_sha256,
            sky_model=envlock.sky_model,
            sky_model_version=envlock.sky_model_version,
            focal_length_mm=cam.focal_length_mm,
            aperture_fstop=cam.aperture_fstop,
            sensor_width_mm=sensor_w,
            sensor_height_mm=sensor_h,
            projection_matrix=proj_matrix,
            frame_rate="24000/1001",
            shutter_open=-0.25,
            shutter_close=0.25,
            motion_blur_samples=5,
            renderer_version=renderer.renderer_version,
            renderer_name=renderer.renderer_name,
        )


@dataclass
class RenderSession:
    """Constitutional render session with SovereignXBridge governance."""
    session_id: str
    intent_id: str
    prompt_schema: RenderPromptSchema
    envlock: EnvLock
    adapter: IRendererAdapter
    invariants: InvariantSet
    start_time: float = field(default_factory=time.time)
    frames_completed: List[int] = field(default_factory=list)
    frames_failed: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    # SovereignXBridge state
    bridge_connected: bool = False
    authority_token: Optional[str] = None
    ledger_entries: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "intent_id": self.intent_id,
            "shot_id": self.prompt_schema.shot_id,
            "project_id": self.prompt_schema.project_id,
            "start_time": self.start_time,
            "frames_completed": self.frames_completed,
            "frames_failed": self.frames_failed,
            "warnings": self.warnings,
            "invariants": self.invariants.to_dict(),
            "envlock_id": self.envlock.lock_id,
            "bridge_connected": self.bridge_connected,
        }


class ConstitutionalRenderSession:
    """Manages a constitutionally-governed render session."""
    
    def __init__(
        self,
        prompt_schema: RenderPromptSchema,
        envlock: EnvLock,
        adapter_name: str = "axiom_x",
        cache_dir: str = "./tmp/axiom_x_cache",
    ):
        self.prompt_schema = prompt_schema
        self.envlock = envlock
        self.adapter_name = adapter_name
        self.cache_dir = cache_dir
        
        # Initialize adapter
        self.adapter = get_adapter(adapter_name)()
        
        # Initialize invariants
        self.invariants = InvariantSet.from_prompt_schema(prompt_schema, envlock, self.adapter)
        
        # Session ID
        self.session_id = f"sess-{uuid.uuid4().hex[:12]}"
        self.intent_id = f"intent-{prompt_schema.project_id}-{prompt_schema.shot_id}-{int(time.time())}"
        
        # Session state
        self.session: Optional[RenderSession] = None
        self._bridge = None
    
    def initialize(self) -> bool:
        """Initialize session with SovereignXBridge."""
        # Connect to SovereignXBridge
        try:
            from axiom_x.bridge import SovereignXBridge
            print("[DEBUG] Creating SovereignXBridge...")
            self._bridge = SovereignXBridge()
            print("[DEBUG] Connecting bridge...")
            if not self._bridge.connect():
                print("[ERROR] Bridge connect failed")
                return False
            
            # Declare intent
            print("[DEBUG] Declaring intent...")
            authority_token = self._bridge.declare_intent(
                action="render_session",
                world_id=self.envlock.project_id,
                timeline_id=self.envlock.scene_id,
                parameters={
                    "session_id": self.session_id,
                    "intent_id": self.intent_id,
                    "invariants": self.invariants.to_dict(),
                    "envlock_id": self.envlock.lock_id,
                    "adapter": self.adapter_name,
                    "prompt_schema": self.prompt_schema.model_dump(),
                }
            )
            print(f"[DEBUG] Authority token: {authority_token}")
            
            # Create session
            self.session = RenderSession(
                session_id=self.session_id,
                intent_id=self.intent_id,
                prompt_schema=self.prompt_schema,
                envlock=self.envlock,
                adapter=self.adapter,
                invariants=self.invariants,
            )
            self.session.bridge_connected = True
            self.session.authority_token = authority_token
            
            # Initialize adapter
            print("[DEBUG] Initializing adapter...")
            init_config = {
                "cache_dir": self.cache_dir,
                "device": "GPU",
                "log_level": "INFO",
            }
            if not self.adapter.initialize(init_config):
                print("[ERROR] Adapter initialization failed")
                return False
            
            # Load scene
            scene_path = self.prompt_schema.scene_path if hasattr(self.prompt_schema, 'scene_path') else ""
            print(f"[DEBUG] Loading scene: {scene_path}")
            self.adapter.loadScene(scene_path, {"assets": []})
            
            # Apply render settings
            print("[DEBUG] Applying render settings...")
            settings = self._build_render_settings()
            self.adapter.setRenderSettings(settings)
            
            # Verify invariants with bridge
            print("[DEBUG] Verifying invariants...")
            if not self._verify_invariants():
                print("[WARN] Invariant verification failed")
                return False
            
            return True
            
        except Exception as e:
            print(f"[ERROR] Session initialization failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _build_render_settings(self) -> RenderSettings:
        """Build RenderSettings from invariants and schema."""
        cam = self.prompt_schema.camera
        
        return RenderSettings(
            primary_samples=self.prompt_schema.primary_samples if hasattr(self.prompt_schema, 'primary_samples') else 512,
            max_ray_depth=8,
            clamp_value=10.0,
            resolution=(1920, 1080),
            colorspace="ACES_AP1_Linear",
            aov_manifest=self._get_aov_manifest(),
            frame_range=(1, 1),
            output_dir="./output",
            random_seed=self.invariants.random_seed,
            focal_length_mm=self.invariants.focal_length_mm,
            aperture_fstop=self.invariants.aperture_fstop,
            shutter_open=self.invariants.shutter_open,
            shutter_close=self.invariants.shutter_close,
            motion_blur_samples=self.invariants.motion_blur_samples,
            subdivision_levels=self.invariants.subdivision_levels,
            displacement_amplitudes=self.invariants.displacement_amplitudes,
        )
    
    def _get_aov_manifest(self) -> List[str]:
        """Get AOV manifest including 4D extensions."""
        from daniel_blueprint.schemas.aov_manifest_4d import get_aov_manifest_for_renderer
        return get_aov_manifest_for_renderer(self.adapter_name, include_4d=True)
    
    def _verify_invariants(self) -> bool:
        """Verify all invariants via SovereignXBridge."""
        if not self._bridge:
            return True
        
        # Query adapter for actual values
        actual = {
            "random_seed": self.adapter.get_seed(),
            "shutter_open": self.adapter.get_shutter_open(),
            "shutter_close": self.adapter.get_shutter_close(),
            "motion_blur_samples": self.adapter.get_mb_samples(),
            "renderer_version": self.adapter.get_version(),
        }
        
        expected = {
            "random_seed": self.invariants.random_seed,
            "shutter_open": self.invariants.shutter_open,
            "shutter_close": self.invariants.shutter_close,
            "motion_blur_samples": self.invariants.motion_blur_samples,
            "renderer_version": self.invariants.renderer_version,
        }
        
        # Verify via bridge
        result = self._bridge.verify_invariants(
            intent_id=self.intent_id,
            expected=expected,
            actual=actual,
        )
        
        if not result["passed"]:
            for failure in result["failures"]:
                self.session.warnings.append(f"INVARIANT VIOLATION: {failure}")
            return False
        
        return True
    
    def render_frame(self, frame: int, passes: Optional[List[str]] = None) -> Dict[str, Any]:
        """Render a single frame with full constitutional governance."""
        if not self.session:
            raise RuntimeError("Session not initialized")
        
        if passes is None:
            passes = ["project_4d_to_3d", "primary_ray", "gi", "volume", "denoise", "composite"]
        
        frame_result = {
            "frame": frame,
            "passes": [],
            "start_time": time.time(),
            "status": "pending",
        }
        
        # Declare frame intent
        frame_intent = f"{self.intent_id}-frame-{frame:04d}"
        if self._bridge:
            self._bridge.declare_intent(
                action="render_frame",
                world_id=self.envlock.project_id,
                timeline_id=self.envlock.scene_id,
                parameters={
                    "parent_intent": self.intent_id,
                    "frame": frame,
                    "passes": passes,
                    "invariants": self.invariants.to_dict(),
                }
            )
        
        # Execute passes
        for pass_id in passes:
            pass_start = time.time()
            result = self.adapter.executePass(pass_id, frame)
            
            pass_result = {
                "pass_id": pass_id,
                "status": result.status,
                "render_time_seconds": time.time() - pass_start,
                "sample_count": result.sample_count,
                "output_paths": result.output_paths,
            }
            
            if result.status != "success":
                frame_result["status"] = "failed"
                frame_result["error"] = result.error
                self.session.frames_failed.append({
                    "frame": frame,
                    "pass": pass_id,
                    "error": result.error,
                })
                break
            
            frame_result["passes"].append(pass_result)
            
            # Verify frame output with bridge
            if self._bridge and result.output_paths:
                self._bridge.verify_frame_output(
                    intent_id=f"{frame_intent}-{pass_id}",
                    output_paths=result.output_paths,
                    invariants=self.invariants.to_dict(),
                )
        
        frame_result["total_time"] = time.time() - frame_result["start_time"]
        frame_result["status"] = "success" if frame_result["status"] != "failed" else "failed"
        
        if frame_result["status"] == "success":
            self.session.frames_completed.append(frame)
        
        return frame_result
    
    def render_sequence(self, frames: List[int], passes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Render sequence of frames."""
        results = []
        for frame in frames:
            result = self.render_frame(frame, passes)
            results.append(result)
            if result["status"] == "failed":
                # Continue or abort based on policy
                pass
        return results
    
    def finalize(self) -> Dict[str, Any]:
        """Finalize session and write ledger."""
        if self.session:
            self.session.end_time = time.time()
            
            # Write session ledger via bridge
            if self._bridge:
                self._bridge.close_intent(
                    intent_id=self.intent_id,
                    result={
                        "frames_completed": self.session.frames_completed,
                        "frames_failed": self.session.frames_failed,
                        "warnings": self.session.warnings,
                    }
                )
                self._bridge.disconnect()
            
            # Teardown adapter
            self.adapter.teardown()
            
            return self.session.to_dict()
        return {}
    
    def _log_error(self, phase: str, error: str):
        """Log error to session."""
        if self.session:
            self.session.warnings.append(f"{phase}: {error}")
    
    def __enter__(self):
        self.initialize()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.finalize()


# Convenience function for CLI integration
def create_constitutional_session(
    schema_path: str,
    envlock_path: str,
    adapter_name: str = "axiom_x",
) -> ConstitutionalRenderSession:
    """Create constitutional render session from files."""
    from daniel_blueprint.schemas.prompt_schema import RenderPromptSchema
    from daniel_blueprint.schemas.envlock import EnvLock
    
    schema = RenderPromptSchema.from_yaml(schema_path)
    envlock = EnvLock.from_json(envlock_path)
    
    return ConstitutionalRenderSession(schema, envlock, adapter_name)


def compute_projection_matrix(focal_mm: float, sensor_w: float, sensor_h: float, aperture: float) -> List[float]:
    """Compute 4x4 projection matrix (column-major)."""
    import math
    aspect = sensor_w / sensor_h
    fov = 2 * math.atan(sensor_w / (2 * focal_mm))
    
    # Simple perspective matrix
    f = 1.0 / math.tan(fov / 2)
    near = 0.1
    far = 10000.0
    
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
    ]


if __name__ == "__main__":
    # Test constitutional session creation
    print("Constitutional Render Session module loaded")
    print("  ConstitutionalRenderSession class available")
    print("  InvariantSet class available")
    print("  compute_projection_matrix() function available")