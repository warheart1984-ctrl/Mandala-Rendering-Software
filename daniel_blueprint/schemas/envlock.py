"""EnvLock — Environment locking schema (Section 5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import json


@dataclass
class HDRIConfig:
    file: str
    sha256: str
    rotation_y_deg: float = 0.0
    intensity_multiplier: float = 1.0
    colorspace: str = "linear_rec709"


@dataclass
class SunConfig:
    enabled: bool = False
    azimuth_deg: float = 0.0
    elevation_deg: float = 0.0
    intensity_lux: float = 0.0


@dataclass
class SkyModelConfig:
    model: str = "hosek-wilkie"
    turbidity: float = 6.5
    albedo: float = 0.1
    sun_disk_visible: bool = False


@dataclass
class FogSettings:
    enabled: bool = True
    density: float = 0.0
    scattering_coefficient: float = 0.0
    absorption_coefficient: float = 0.0
    color_linear_rgb: List[float] = field(default_factory=lambda: [0.1, 0.1, 0.1])
    height_falloff: float = 0.3
    rain_streak_density: float = 0.0


@dataclass
class PracticalLight:
    light_id: str
    type: str
    color_temp_K: int
    intensity_lux: float
    position_xyz: List[float]
    direction_xyz: List[float]
    file: Optional[str] = None
    ies_sha256: Optional[str] = None


@dataclass
class GroundPlaneShader:
    file: str
    sha256: str
    puddle_mask_file: Optional[str] = None
    puddle_mask_sha256: Optional[str] = None


@dataclass
class EnvLock:
    lock_id: str
    lock_tier: int = 2
    lock_tier_name: str = "HARD_LOCK"
    project_id: str = ""
    scene_id: str = ""
    version: str = "v001"
    environment: Dict[str, Any] = field(default_factory=dict)
    changelog: List[Dict[str, Any]] = field(default_factory=list)
    
    # Parsed fields for easy access
    hdri_sha256: str = ""
    ies_hashes: Dict[str, str] = field(default_factory=dict)
    sky_model: str = "hosek-wilkie"
    sky_model_version: str = "1.0"
    
    @classmethod
    def from_json(cls, path: str) -> "EnvLock":
        """Load EnvLock from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        
        lock = cls(
            lock_id=data.get("lock_id", ""),
            lock_tier=data.get("lock_tier", 2),
            lock_tier_name=data.get("lock_tier_name", "HARD_LOCK"),
            project_id=data.get("project_id", ""),
            scene_id=data.get("scene_id", ""),
            version=data.get("version", "v001"),
            environment=data.get("environment", {}),
            changelog=data.get("changelog", []),
        )
        
        # Parse environment for easy access
        env = data.get("environment", {})
        
        # HDRI
        if "hdri" in env:
            lock.hdri_sha256 = env["hdri"].get("sha256", "")
        
        # Practical lights IES hashes
        for light in env.get("practical_lights", []):
            if "ies_sha256" in light:
                lock.ies_hashes[light["light_id"]] = light["ies_sha256"]
        
        # Sky model
        if "sky_model" in env:
            lock.sky_model = env["sky_model"].get("model", "hosek-wilkie")
        
        return lock
    
    def to_json(self) -> str:
        """Serialize to JSON."""
        return json.dumps(self.__dict__, indent=2, default=str)
    
    def save(self, path: str):
        """Save to file."""
        with open(path, "w") as f:
            f.write(self.to_json())


if __name__ == "__main__":
    # Test
    print("EnvLock class defined")