"""
SME-VIS — Vision Encoder (ONNXRuntime backend)
Constitutional Contract: contract.sme-vis.v1
Authority: encode
Status: declared
Mathematical Constraints (Appendix H §1.2):
- Parameters: ≤ 50M
- Embedding dimension: 512 (fixed)
- Quantization: INT8
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
import onnxruntime as ort
from pydantic import BaseModel, Field


class VisionModelName(str):
    MOBILEVIT_XXS = "mobilevit-xxs"
    VIT_TINY = "vit-tiny-patch16-224"
    EFFICIENTNET_B0 = "efficientnet-b0"


@dataclass(frozen=True)
class VisionModelMetadata:
    """Immutable vision model metadata for evidence/provenance"""
    name: str
    version: str
    parameter_count: int
    quantization: str  # "INT8"
    format: str = "onnx"
    checksum_sha256: str = ""
    input_shape: tuple[int, int, int, int] = (1, 3, 224, 224)  # NCHW
    embedding_dim: int = 512
    preprocessing: dict[str, Any] = field(default_factory=dict)
    
    def to_evidence_dict(self) -> dict[str, Any]:
        return {
            "model_name": self.name,
            "model_version": self.version,
            "parameter_count": self.parameter_count,
            "quantization": self.quantization,
            "format": self.format,
            "checksum_sha256": self.checksum_sha256,
            "input_shape": list(self.input_shape),
            "embedding_dim": self.embedding_dim,
            "preprocessing": self.preprocessing,
        }


# Supported models per Appendix H §1.2 (≤50M params, INT8 quantized)
VISION_MODEL_SPECS = {
    VisionModelName.MOBILEVIT_XXS: {
        "parameter_count": 1_300_000,
        "embedding_dim": 512,
        "input_shape": (1, 3, 224, 224),
        "preprocessing": {
            "resize": (224, 224),
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
            "interpolation": "bicubic",
        },
    },
    VisionModelName.VIT_TINY: {
        "parameter_count": 5_000_000,
        "embedding_dim": 512,  # Projected from 192
        "input_shape": (1, 3, 224, 224),
        "preprocessing": {
            "resize": (224, 224),
            "mean": [0.5, 0.5, 0.5],
            "std": [0.5, 0.5, 0.5],
            "interpolation": "bicubic",
        },
    },
    VisionModelName.EFFICIENTNET_B0: {
        "parameter_count": 5_300_000,
        "embedding_dim": 512,  # Projected from 1280
        "input_shape": (1, 3, 224, 224),
        "preprocessing": {
            "resize": (224, 224),
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
            "interpolation": "bicubic",
        },
    },
}


@dataclass
class OrtVisionConfig:
    """ONNXRuntime configuration for vision encoder"""
    providers: list[str] = field(default_factory=lambda: ["CPUExecutionProvider"])
    intra_op_threads: int = 0
    inter_op_threads: int = 0
    enable_mem_pattern: bool = True
    enable_cpu_mem_arena: bool = True
    graph_optimization_level: str = "all"
    
    def __post_init__(self):
        if self.intra_op_threads <= 0:
            self.intra_op_threads = os.cpu_count() or 4


class VisionEncoder:
    """
    ONNXRuntime vision encoder for SME-VIS.
    Supports MobileViT-XXS, ViT-Tiny, EfficientNet-B0 (all INT8 quantized).
    """
    
    def __init__(
        self,
        model_path: Path,
        metadata: VisionModelMetadata,
        config: Optional[OrtVisionConfig] = None,
    ):
        self.model_path = Path(model_path)
        self.metadata = metadata
        self.config = config or OrtVisionConfig()
        self._session: Optional[ort.InferenceSession] = None
        self._input_name: Optional[str] = None
        self._output_names: list[str] = []
        self._loaded = False
    
    def load(self) -> None:
        """Load ONNX model into ONNXRuntime session"""
        if self._loaded:
            return
        
        # Session options
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = self.config.intra_op_threads
        sess_options.inter_op_num_threads = self.config.inter_op_threads
        sess_options.enable_mem_pattern = self.config.enable_mem_pattern
        sess_options.enable_cpu_mem_arena = self.config.enable_cpu_mem_arena
        
        opt_levels = {
            "disable": ort.GraphOptimizationLevel.ORT_DISABLE_ALL,
            "basic": ort.GraphOptimizationLevel.ORT_ENABLE_BASIC,
            "extended": ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED,
            "all": ort.GraphOptimizationLevel.ORT_ENABLE_ALL,
        }
        sess_options.graph_optimization_level = opt_levels.get(
            self.config.graph_optimization_level,
            ort.GraphOptimizationLevel.ORT_ENABLE_ALL,
        )
        
        # Load session
        self._session = ort.InferenceSession(
            str(self.model_path),
            sess_options=sess_options,
            providers=self.config.providers,
        )
        
        # Get input/output names
        self._input_name = self._session.get_inputs()[0].name
        self._output_names = [out.name for out in self._session.get_outputs()]
        
        self._loaded = True
    
    def unload(self) -> None:
        if self._session:
            del self._session
            self._session = None
        self._loaded = False
    
    def encode(self, images: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Encode batch of images to embeddings.
        
        Args:
            images: Preprocessed images [B, 3, H, W] float32, normalized
            
        Returns:
            embeddings: [B, 512] float32
            evidence: dict with model metadata, timing, etc.
        """
        if not self._loaded:
            self.load()
        
        import time
        start = time.perf_counter()
        
        # Run inference
        outputs = self._session.run(
            self._output_names,
            {self._input_name: images.astype(np.float32)}
        )
        
        latency_ms = (time.perf_counter() - start) * 1000
        
        # Get embeddings (assume first output)
        embeddings = outputs[0]
        
        # Ensure 512-dim output (project if needed)
        if embeddings.shape[-1] != 512:
            # This would use a learned projection W_proj ∈ ℝ^{d_LLM × 512}
            # For now, we'll pad/truncate - in production use proper projection
            if embeddings.shape[-1] > 512:
                embeddings = embeddings[..., :512]
            else:
                pad_width = ((0, 0), (0, 512 - embeddings.shape[-1]))
                embeddings = np.pad(embeddings, pad_width, mode="constant")
        
        # L2 normalize
        norms = np.linalg.norm(embeddings, axis=-1, keepdims=True)
        embeddings = embeddings / (norms + 1e-8)
        
        evidence = {
            "model": self.metadata.to_evidence_dict(),
            "batch_size": images.shape[0],
            "input_shape": list(images.shape),
            "output_shape": list(embeddings.shape),
            "latency_ms": latency_ms,
            "embedding_dim": embeddings.shape[-1],
        }
        
        return embeddings.astype(np.float32), evidence
    
    @property
    def input_shape(self) -> tuple[int, int, int, int]:
        return self.metadata.input_shape


class VisionEncoderFactory:
    """Factory for creating VisionEncoder instances"""
    
    def __init__(self, models_dir: Path):
        self.models_dir = Path(models_dir)
    
    def create(
        self,
        model_name: VisionModelName,
        config: Optional[OrtVisionConfig] = None,
    ) -> VisionEncoder:
        """Create and validate vision encoder"""
        if model_name not in VISION_MODEL_SPECS:
            raise ValueError(f"Unsupported model: {model_name}")
        
        spec = VISION_MODEL_SPECS[model_name]
        
        # Find model file
        model_dir = self.models_dir / model_name.value
        model_files = list(model_dir.glob("*.onnx"))
        
        if not model_files:
            raise FileNotFoundError(
                f"No ONNX model found for {model_name.value} in {model_dir}"
            )
        
        model_path = model_files[0]
        checksum = self._compute_sha256(model_path)
        
        metadata = VisionModelMetadata(
            name=model_name.value,
            version="1.0.0",
            parameter_count=spec["parameter_count"],
            quantization="INT8",
            format="onnx",
            checksum_sha256=checksum,
            input_shape=spec["input_shape"],
            embedding_dim=spec["embedding_dim"],
            preprocessing=spec["preprocessing"],
        )
        
        return VisionEncoder(model_path, metadata, config)
    
    def _compute_sha256(self, filepath: Path) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    factory = VisionEncoderFactory(models_dir)
    
    for model_name in [VisionModelName.MOBILEVIT_XXS, VisionModelName.VIT_TINY]:
        try:
            encoder = factory.create(model_name)
            print(f"Loaded {model_name.value}: {encoder.metadata.parameter_count/1e6:.1f}M params")
        except FileNotFoundError as e:
            print(f"{model_name.value}: NOT FOUND - {e}")
        except Exception as e:
            print(f"{model_name.value}: ERROR - {e}")