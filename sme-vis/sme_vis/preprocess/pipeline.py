"""
SME-VIS — Image Preprocessing Pipeline
Constitutional Contract: contract.sme-vis.v1
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

import numpy as np
from PIL import Image


@dataclass
class PreprocessConfig:
    """Preprocessing configuration matching model requirements"""
    resize: tuple[int, int] = (224, 224)
    mean: list[float] = None
    std: list[float] = None
    interpolation: str = "bicubic"  # "bilinear", "bicubic", "lanczos"
    to_rgb: bool = True
    
    def __post_init__(self):
        if self.mean is None:
            self.mean = [0.485, 0.456, 0.406]  # ImageNet default
        if self.std is None:
            self.std = [0.229, 0.224, 0.225]


class ImagePreprocessor:
    """
    Constitutional image preprocessor.
    Produces deterministic, reproducible preprocessing for vision encoders.
    """
    
    def __init__(self, config: Optional[PreprocessConfig] = None):
        self.config = config or PreprocessConfig()
        self._interpolation_map = {
            "bilinear": Image.BILINEAR,
            "bicubic": Image.BICUBIC,
            "lanczos": Image.LANCZOS,
            "nearest": Image.NEAREST,
        }
    
    def preprocess(
        self,
        image: Union[Image.Image, np.ndarray, Path, bytes],
    ) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Preprocess single image to model input format.
        
        Returns:
            tensor: [1, 3, H, W] float32 normalized
            evidence: dict with preprocessing metadata
        """
        # Load image
        pil_image = self._load_image(image)
        
        # Convert to RGB
        if self.config.to_rgb and pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        
        original_size = pil_image.size
        
        # Resize
        interpolation = self._interpolation_map.get(
            self.config.interpolation, Image.BICUBIC
        )
        pil_image = pil_image.resize(self.config.resize, interpolation)
        
        # To numpy [H, W, 3]
        arr = np.array(pil_image, dtype=np.float32) / 255.0
        
        # Normalize: (x - mean) / std
        mean = np.array(self.config.mean, dtype=np.float32).reshape(1, 1, 3)
        std = np.array(self.config.std, dtype=np.float32).reshape(1, 1, 3)
        arr = (arr - mean) / std
        
        # Transpose to [3, H, W] and add batch dim [1, 3, H, W]
        tensor = arr.transpose(2, 0, 1)[None, ...]
        
        evidence = {
            "original_size": list(original_size),
            "resized_size": list(self.config.resize),
            "interpolation": self.config.interpolation,
            "mean": self.config.mean,
            "std": self.config.std,
            "input_range": [0.0, 1.0],
            "output_range": [
                float(tensor.min()),
                float(tensor.max()),
            ],
        }
        
        return tensor.astype(np.float32), evidence
    
    def preprocess_batch(
        self,
        images: list[Union[Image.Image, np.ndarray, Path, bytes]],
    ) -> tuple[np.ndarray, list[dict[str, Any]]]:
        """Preprocess batch of images"""
        tensors = []
        evidences = []
        
        for img in images:
            tensor, evidence = self.preprocess(img)
            tensors.append(tensor)
            evidences.append(evidence)
        
        batch = np.concatenate(tensors, axis=0)
        return batch, evidences
    
    def _load_image(
        self,
        image: Union[Image.Image, np.ndarray, Path, bytes],
    ) -> Image.Image:
        """Load image from various formats"""
        if isinstance(image, Image.Image):
            return image
        elif isinstance(image, np.ndarray):
            # Assume [H, W, 3] or [H, W, 4] uint8
            if image.dtype != np.uint8:
                image = (image * 255).astype(np.uint8)
            return Image.fromarray(image)
        elif isinstance(image, (Path, str)):
            return Image.open(image)
        elif isinstance(image, bytes):
            from io import BytesIO
            return Image.open(BytesIO(image))
        else:
            raise TypeError(f"Unsupported image type: {type(image)}")


class PreprocessorFactory:
    """Factory for creating model-specific preprocessors"""
    
    CONFIGS = {
        "mobilevit-xxs": PreprocessConfig(
            resize=(224, 224),
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
            interpolation="bicubic",
        ),
        "vit-tiny-patch16-224": PreprocessConfig(
            resize=(224, 224),
            mean=[0.5, 0.5, 0.5],
            std=[0.5, 0.5, 0.5],
            interpolation="bicubic",
        ),
        "efficientnet-b0": PreprocessConfig(
            resize=(224, 224),
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
            interpolation="bicubic",
        ),
    }
    
    @classmethod
    def create(cls, model_name: str) -> ImagePreprocessor:
        """Create preprocessor for model"""
        config = cls.CONFIGS.get(model_name, PreprocessConfig())
        return ImagePreprocessor(config)


if __name__ == "__main__":
    # Demo
    import tempfile
    
    # Create test image
    test_img = Image.new("RGB", (512, 512), color="red")
    
    for model in ["mobilevit-xxs", "vit-tiny-patch16-224", "efficientnet-b0"]:
        preprocessor = PreprocessorFactory.create(model)
        tensor, evidence = preprocessor.preprocess(test_img)
        
        print(f"{model}:")
        print(f"  Input shape: {tensor.shape}")
        print(f"  Range: [{evidence['output_range'][0]:.3f}, {evidence['output_range'][1]:.3f}]")
        print(f"  Evidence: {evidence}")