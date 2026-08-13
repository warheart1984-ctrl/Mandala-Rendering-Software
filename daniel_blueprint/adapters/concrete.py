"""Concrete IRendererAdapter implementations (Section 2.2).

Each adapter translates universal RenderSettings into renderer-specific calls.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pathlib import Path

from .base import (
    IRendererAdapter, RenderSettings, RenderSettings,
    PassResult, AOVBuffer, SceneHandle,
    RendererInitError, SceneLoadError, SettingsValidationError,
    RenderPassError, AOVNotFoundError, TeardownError,
    register_adapter
)


# ============================================================
# Cycles Adapter (Blender)
# ============================================================

class CyclesAdapter(IRendererAdapter):
    """Cycles (Blender) adapter using bpy API."""

    @property
    def renderer_name(self) -> str:
        return "Cycles"

    @property
    def renderer_version(self) -> str:
        try:
            import bpy
            return f"Blender {bpy.app.version_string} / Cycles"
        except Exception:
            return "Cycles (bpy not available)"

    @property
    def supported_aovs(self) -> List[str]:
        return [
            "beauty", "diffuse_direct", "diffuse_indirect", "diffuse_color",
            "specular_direct", "specular_indirect", "specular_color",
            "glossy_direct", "glossy_indirect", "glossy_color",
            "transmission_direct", "transmission_indirect", "transmission_color",
            "subsurface_direct", "subsurface_indirect", "subsurface_color",
            "volume_direct", "volume_indirect", "volume_color",
            "emission", "background", "ao", "shadow_catcher",
            "normal", "position", "motion_vector", "depth",
            "cryptomatte", "material_index", "object_index",
            "crypto_asset", "crypto_object", "crypto_material",
        ]

    def initialize(self, config: Dict[str, Any]) -> bool:
        try:
            import bpy
            import os

            # Set working directory
            working_dir = config.get("working_dir", ".")
            os.chdir(working_dir)

            # Set render engine
            bpy.context.scene.render.engine = 'CYCLES'

            # Device selection
            device = config.get("device", "GPU")
            if device.upper() == "GPU":
                bpy.context.scene.cycles.device = 'GPU'
                prefs = bpy.context.preferences.addons['cycles'].preferences
                prefs.compute_device_type = 'CUDA'  # or 'OPTIX', 'HIP', 'METAL'
                bpy.context.scene.cycles.use_adaptive_sampling = True
            else:
                bpy.context.scene.cycles.device = 'CPU'

            # OCIO config
            ocio_path = config.get("ocio_config_path")
            if ocio_path and os.path.exists(ocio_path):
                bpy.context.scene.ocio_config = ocio_path

            # Log level
            log_level = config.get("log_level", "INFO")
            if hasattr(bpy.context.scene.cycles, "log_level"):
                bpy.context.scene.cycles.log_level = log_level

            return True
        except Exception as e:
            raise RendererInitError(f"Cycles initialization failed: {e}")

    def loadScene(self, scene_path: str, manifest: Dict[str, Any]) -> Any:
        try:
            import bpy

            # Clear existing scene
            bpy.ops.wm.read_factory_settings(use_empty=True)

            # Import scene based on extension
            ext = Path(scene_path).suffix.lower()
            if ext == ".blend":
                bpy.ops.wm.open_mainfile(filepath=scene_path)
            elif ext == ".usd" or ext == ".usda" or ext == ".usdc":
                bpy.ops.wm.usd_import(filepath=scene_path)
            elif ext == ".abc":
                bpy.ops.wm.alembic_import(filepath=scene_path)
            elif ext == ".fbx":
                bpy.ops.import_scene.fbx(filepath=scene_path)
            else:
                raise SceneLoadError(f"Unsupported scene format: {ext}")

            # Apply LOD policy from manifest
            lod_policy = manifest.get("lod_policy", {})
            self._apply_lod_policy(lod_policy)

            # Validate asset references
            self._validate_assets(manifest)

            return {
                "renderer_type": "Cycles",
                "scene_path": scene_path,
                "internal_handle": bpy.context.scene,
                "metadata": {"manifest": manifest},
            }
        except Exception as e:
            raise SceneLoadError(f"Cycles scene load failed: {e}")

    def _apply_lod_policy(self, lod_policy: Dict[str, Any]) -> None:
        """Apply LOD policy to scene objects."""
        import bpy
        # Implementation would select appropriate LOD meshes based on camera distance
        pass

    def _validate_assets(self, manifest: Dict[str, Any]) -> None:
        """Validate all asset references exist."""
        import os
        for asset in manifest.get("assets", []):
            path = asset.get("path")
            if path and not os.path.exists(path):
                raise SceneLoadError(f"Missing asset: {path}")

    def setRenderSettings(self, settings: RenderSettings) -> None:
        import bpy

        scene = bpy.context.scene
        cycles = scene.cycles

        # Samples
        cycles.samples = settings.primary_samples
        cycles.use_adaptive_sampling = True
        cycles.adaptive_threshold = 0.01
        cycles.adaptive_min_samples = max(16, settings.primary_samples // 32)

        # Ray depth
        cycles.max_bounces = settings.max_ray_depth
        cycles.diffuse_bounces = min(4, settings.max_ray_depth)
        cycles.glossy_bounces = min(4, settings.max_ray_depth)
        cycles.transmission_bounces = min(6, settings.max_ray_depth)
        cycles.volume_bounces = min(4, settings.max_ray_depth)

        # Clamp
        cycles.sample_clamp_direct = settings.clamp_value
        cycles.sample_clamp_indirect = settings.clamp_value

        # Seed
        cycles.seed = settings.random_seed

        # Resolution
        scene.render.resolution_x = settings.resolution[0]
        scene.render.resolution_y = settings.resolution[1]
        scene.render.resolution_percentage = 100

        # Color management
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.sequencer_colorspace_settings.name = settings.colorspace

        # Motion blur
        scene.render.use_motion_blur = True
        scene.render.motion_blur_shutter = 0.5  # shutter_open = -0.25, shutter_close = 0.25

        # AOV setup
        self._setup_aovs(settings.aov_manifest)

        # Camera invariants (Section 7)
        cam = bpy.context.scene.camera
        if cam:
            cam.data.lens = settings.focal_length_mm
            cam.data.dof.aperture_fstop = settings.aperture_fstop

        # Subdivision invariants (Section 7)
        for obj_name, level in settings.subdivision_levels.items():
            obj = bpy.data.objects.get(obj_name)
            if obj and obj.modifiers.get("Subdivision"):
                obj.modifiers["Subdivision"].levels = level
                obj.modifiers["Subdivision"].render_levels = level

        # Displacement amplitudes (Section 7)
        for mat_name, amp in settings.displacement_amplitudes.items():
            mat = bpy.data.materials.get(mat_name)
            if mat and mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type == 'DISPLACEMENT':
                        node.inputs['Scale'].default_value = amp

    def _setup_aovs(self, aov_list: List[str]) -> None:
        import bpy
        # Setup view layers and compositor nodes for AOVs
        view_layer = bpy.context.view_layer
        view_layer.use_pass_combined = True
        view_layer.use_pass_z = "depth" in aov_list
        view_layer.use_pass_normal = "normal" in aov_list
        view_layer.use_pass_vector = "motion_vector" in aov_list
        view_layer.use_pass_object_index = "object_index" in aov_list
        view_layer.use_pass_material_index = "material_index" in aov_list
        view_layer.use_pass_cryptomatte = any("crypto" in aov for aov in aov_list)
        view_layer.use_pass_cryptomatte_asset = "crypto_asset" in aov_list
        view_layer.use_pass_cryptomatte_object = "crypto_object" in aov_list
        view_layer.use_pass_cryptomatte_material = "crypto_material" in aov_list

    def executePass(self, pass_id: str, frame: int) -> PassResult:
        import bpy
        import time

        scene = bpy.context.scene
        scene.frame_set(frame)

        start_time = time.time()

        try:
            # Set output path
            output_dir = Path(bpy.context.scene.render.filepath).parent if bpy.context.scene.render.filepath else Path.cwd()
            output_path = output_dir / f"{pass_id}_{frame:04d}"

            # Configure output based on pass
            if pass_id == "primary_ray":
                scene.render.filepath = str(output_path) + "_beauty"
                scene.render.image_settings.file_format = 'OPEN_EXR'
                scene.render.image_settings.color_mode = 'RGBA'
                scene.render.image_settings.color_depth = '16'
            elif pass_id == "aovs":
                scene.render.filepath = str(output_path) + "_aovs"
                scene.render.image_settings.file_format = 'OPEN_EXR'
                scene.render.image_settings.color_mode = 'RGBA'
                scene.render.image_settings.color_depth = '16'
            elif pass_id == "denoise":
                # Denoising happens in compositor
                pass

            # Render
            bpy.ops.render.render(write_still=True)

            elapsed = time.time() - start_time

            # Collect output paths
            outputs = {}
            for aov in ["beauty", "diffuse_direct", "diffuse_indirect", "specular_direct", "specular_indirect",
                        "normal", "depth", "motion_vector", "albedo", "cryptomatte"]:
                path = output_dir / f"{pass_id}_{frame:04d}_{aov}.exr"
                if path.exists():
                    outputs[aov] = str(path)

            return PassResult(
                pass_id=pass_id,
                frame=frame,
                status="success",
                output_paths=outputs,
                render_time_seconds=elapsed,
                sample_count=bpy.context.scene.cycles.samples,
            )
        except Exception as e:
            return PassResult(
                pass_id=pass_id,
                frame=frame,
                status="failed",
                output_paths={},
                render_time_seconds=time.time() - start_time,
                sample_count=0,
                error=str(e),
            )

    def fetchAOV(self, aov_name: str, frame: int) -> AOVBuffer:
        import bpy
        import numpy as np
        from pathlib import Path

        # In practice, this would load from the rendered EXR
        output_dir = Path(bpy.context.scene.render.filepath).parent if bpy.context.scene.render.filepath else Path.cwd()
        path = output_dir / f"aovs_{frame:04d}_{aov_name}.exr"

        if not path.exists():
            raise AOVNotFoundError(f"AOV {aov_name} for frame {frame} not found at {path}")

        # Load EXR (would use OpenEXR or OpenImageIO in production)
        # For now, return metadata
        return AOVBuffer(
            aov_name=aov_name,
            frame=frame,
            width=bpy.context.scene.render.resolution_x,
            height=bpy.context.scene.render.resolution_y,
            channels=["R", "G", "B", "A"],
            bit_depth="half",
            data_ref=str(path),
        )

    def teardown(self) -> None:
        try:
            import bpy
            # Write session summary
            print(f"[CyclesAdapter] Session complete. Scene: {bpy.context.scene.name}")
        except Exception as e:
            print(f"[CyclesAdapter] Teardown warning: {e}")

    def get_seed(self) -> int:
        import bpy
        return bpy.context.scene.cycles.seed

    def get_shutter_open(self) -> float:
        import bpy
        return bpy.context.scene.render.motion_blur_shutter_open if hasattr(bpy.context.scene.render, 'motion_blur_shutter_open') else -0.25

    def get_shutter_close(self) -> float:
        import bpy
        return bpy.context.scene.render.motion_blur_shutter_close if hasattr(bpy.context.scene.render, 'motion_blur_shutter_close') else 0.25

    def get_mb_samples(self) -> int:
        import bpy
        return getattr(bpy.context.scene.cycles, 'motion_blur_samples', 5)

    def get_version(self) -> str:
        return self.renderer_version


# ============================================================
# Arnold Adapter (Placeholder - requires arnold Python API)
# ============================================================

class ArnoldAdapter(IRendererAdapter):
    """Arnold adapter using arnold Python API (ai)."""

    @property
    def renderer_name(self) -> str:
        return "Arnold"

    @property
    def renderer_version(self) -> str:
        try:
            import arnold as ai
            return f"Arnold {ai.AiGetVersion()}"
        except Exception:
            return "Arnold (api not available)"

    @property
    def supported_aovs(self) -> List[str]:
        return [
            "beauty", "diffuse_direct", "diffuse_indirect", "diffuse_albedo",
            "specular_direct", "specular_indirect", "specular_albedo",
            "transmission_direct", "transmission_indirect", "transmission_albedo",
            "sss_direct", "sss_indirect", "sss_albedo",
            "volume_direct", "volume_indirect", "volume_opacity",
            "emission", "background", "ambient_occlusion", "shadow_matte",
            "N", "P", "Pref", "motion_vector", "Z", "crypto_asset", "crypto_object", "crypto_material",
        ]

    def initialize(self, config: Dict[str, Any]) -> bool:
        try:
            import arnold as ai
            ai.AiBegin()
            ai.AiMsgSetConsoleFlags(ai.AI_LOG_ALL)
            # License handled via ARNOLD_LICENSE_HOST env var
            return True
        except Exception as e:
            raise RendererInitError(f"Arnold initialization failed: {e}")

    def loadScene(self, scene_path: str, manifest: Dict[str, Any]) -> Any:
        try:
            import arnold as ai
            ai.AiASSLoad(scene_path, ai.AI_NODE_ALL)
            # Apply LOD, validate assets
            return {
                "renderer_type": "Arnold",
                "scene_path": scene_path,
                "internal_handle": ai.AiUniverseGetOptions(),
                "metadata": {"manifest": manifest},
            }
        except Exception as e:
            raise SceneLoadError(f"Arnold scene load failed: {e}")

    def setRenderSettings(self, settings: RenderSettings) -> None:
        import arnold as ai
        options = ai.AiUniverseGetOptions()

        ai.AiNodeSetInt(options, "AA_samples", settings.primary_samples)
        ai.AiNodeSetInt(options, "GI_total_depth", settings.max_ray_depth)
        ai.AiNodeSetInt(options, "GI_diffuse_depth", 4)
        ai.AiNodeSetInt(options, "GI_specular_depth", 4)
        ai.AiNodeSetInt(options, "GI_transmission_depth", 6)
        ai.AiNodeSetInt(options, "GI_volume_depth", 4)
        ai.AiNodeSetFlt(options, "AA_sample_clamp", settings.clamp_value)
        ai.AiNodeSetInt(options, "AA_seed", settings.random_seed)

        # Resolution
        ai.AiNodeSetInt(options, "xres", settings.resolution[0])
        ai.AiNodeSetInt(options, "yres", settings.resolution[1])

        # Motion blur
        ai.AiNodeSetInt(options, "motion_blur_enable", True)
        ai.AiNodeSetFlt(options, "motion_blur_shutter_start", -0.25)
        ai.AiNodeSetFlt(options, "motion_blur_shutter_end", 0.25)

        # Camera invariants (Section 7)
        # Would need to find camera node and set focal length, aperture

        # Subdivision invariants (Section 7)
        # Would iterate objects and set subdivision_iterations

    def executePass(self, pass_id: str, frame: int) -> PassResult:
        import arnold as ai
        import time

        start_time = time.time()
        try:
            # Set frame
            # Render
            ai.AiRender()
            elapsed = time.time() - start_time

            return PassResult(
                pass_id=pass_id,
                frame=frame,
                status="success",
                output_paths={},  # Would be populated from driver outputs
                render_time_seconds=elapsed,
                sample_count=0,
            )
        except Exception as e:
            return PassResult(
                pass_id=pass_id,
                frame=frame,
                status="failed",
                output_paths={},
                render_time_seconds=time.time() - start_time,
                sample_count=0,
                error=str(e),
            )

    def fetchAOV(self, aov_name: str, frame: int) -> AOVBuffer:
        raise AOVNotFoundError(f"Arnold fetchAOV not implemented for {aov_name}")

    def teardown(self) -> None:
        import arnold as ai
        ai.AiEnd()

    def get_version(self) -> str:
        return self.renderer_version


# ============================================================
# Redshift Adapter (Placeholder)
# ============================================================

class RedshiftAdapter(IRendererAdapter):
    """Redshift adapter (requires Redshift Python API)."""

    @property
    def renderer_name(self) -> str:
        return "Redshift"

    @property
    def renderer_version(self) -> str:
        return "Redshift (placeholder)"

    @property
    def supported_aovs(self) -> List[str]:
        return [
            "beauty", "diffuse_direct", "diffuse_indirect", "specular_direct",
            "specular_indirect", "reflection", "refraction", "emission",
            "volume", "depth", "motion_vector", "normal", "cryptomatte",
        ]

    def initialize(self, config: Dict[str, Any]) -> bool:
        # Would initialize Redshift API
        return True

    def loadScene(self, scene_path: str, manifest: Dict[str, Any]) -> Any:
        return {"renderer_type": "Redshift", "scene_path": scene_path}

    def setRenderSettings(self, settings: RenderSettings) -> None:
        pass

    def executePass(self, pass_id: str, frame: int) -> PassResult:
        return PassResult(pass_id=pass_id, frame=frame, status="not_implemented", output_paths={}, render_time_seconds=0, sample_count=0)

    def fetchAOV(self, aov_name: str, frame: int) -> AOVBuffer:
        raise AOVNotFoundError("Redshift not implemented")

    def teardown(self) -> None:
        pass

    def get_version(self) -> str:
        return self.renderer_version


# ============================================================
# Karma (Houdini) Adapter (Placeholder)
# ============================================================

class KarmaAdapter(IRendererAdapter):
    """Karma (Houdini) adapter using hou module."""

    @property
    def renderer_name(self) -> str:
        return "Karma"

    @property
    def renderer_version(self) -> str:
        try:
            import hou
            return f"Houdini {hou.applicationVersionString()} / Karma"
        except Exception:
            return "Karma (hou not available)"

    @property
    def supported_aovs(self) -> List[str]:
        return [
            "beauty", "diffuse_direct", "diffuse_indirect", "specular_direct",
            "specular_indirect", "sss", "volume", "depth", "motion_vector",
            "normal", "albedo", "cryptomatte", "material_id", "object_id",
        ]

    def initialize(self, config: Dict[str, Any]) -> bool:
        try:
            import hou
            return True
        except Exception as e:
            raise RendererInitError(f"Houdini initialization failed: {e}")

    def loadScene(self, scene_path: str, manifest: Dict[str, Any]) -> Any:
        try:
            import hou
            hou.hipFile.load(scene_path)
            return {"renderer_type": "Karma", "scene_path": scene_path, "internal_handle": hou.node("/stage")}
        except Exception as e:
            raise SceneLoadError(f"Karma scene load failed: {e}")

    def setRenderSettings(self, settings: RenderSettings) -> None:
        pass

    def executePass(self, pass_id: str, frame: int) -> PassResult:
        return PassResult(pass_id=pass_id, frame=frame, status="not_implemented", output_paths={}, render_time_seconds=0, sample_count=0)

    def fetchAOV(self, aov_name: str, frame: int) -> AOVBuffer:
        raise AOVNotFoundError("Karma not implemented")

    def teardown(self) -> None:
        pass

    def get_version(self) -> str:
        return self.renderer_version


# ============================================================
# Register all adapters
# ============================================================

register_adapter("cycles", CyclesAdapter)
register_adapter("arnold", ArnoldAdapter)
register_adapter("redshift", RedshiftAdapter)
register_adapter("karma", KarmaAdapter)


if __name__ == "__main__":
    # Test registry
    print("Registered adapters:", list_adapters())
    for name in list_adapters():
        adapter_class = get_adapter(name)
        print(f"  {name}: {adapter_class().renderer_name} - {adapter_class().renderer_version}")
        print(f"    Supported AOVs: {len(adapter_class().supported_aovs)}")