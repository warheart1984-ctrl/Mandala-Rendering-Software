from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional


class QuantizationFormat(str, Enum):
    """Supported quantization formats (budget-limited per SME-SPEC Appendix H)."""
    Q4_0 = "Q4_0"
    Q4_1 = "Q4_1"
    Q5_0 = "Q5_0"
    Q5_1 = "Q5_1"
    INT8 = "INT8"

    @classmethod
    def validate_format(cls, fmt: str) -> "QuantizationFormat":
        """Resolve a format string to a supported QuantizationFormat.

        Q8_0 and FP16 are explicitly rejected as over budget.
        """
        try:
            return cls[str(fmt).strip().upper()]
        except KeyError:
            raise ValueError(
                f"Unsupported quantization format: {fmt}. "
                f"Supported: {', '.join(m.name for m in cls)}"
            )


class ModelFormat(str, Enum):
    """Supported model file formats."""
    GGUF = "gguf"
    SAFETENSORS = "safetensors"


@dataclass
class ModelMetadata:
    """Immutable model metadata for evidence/provenance"""
    name: str
    version: str
    parameter_count: int
    quantization: QuantizationFormat = QuantizationFormat.Q4_1
    format: str = "gguf"
    checksum_sha256: str = ""
    flop_per_token: int = 720_000_000
    context_window: int = 4096
    hidden_dim: int = 960
    num_heads: int = 12
    num_layers: int = 24
    vocab_size: int = 49152

    def to_evidence_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "parameter_count": self.parameter_count,
            "quantization": self.quantization.value,
            "format": self.format,
            "checksum_sha256": self.checksum_sha256,
        }


@dataclass
class ModelBudget:
    """Budget constraints for model loading"""
    flop_per_token: int = 720_000_000
    model_size_bytes: int = 180_000_000
    kv_cache_bytes_per_token: int = 1024
    max_context_tokens: int = 8192
    max_inference_seconds: float = 60.0

    def estimate_flops(self, num_tokens: int) -> int:
        """Estimate total FLOPs for generating `num_tokens` tokens."""
        return self.flop_per_token * num_tokens

    def fits_in_budget(
        self,
        num_tokens: int,
        cpu_budget_gflops: float = 2400.0,
    ) -> tuple[bool, str]:
        """Check whether generating `num_tokens` tokens fits the budget.

        Returns (fits, message). Fails if the sequence exceeds the context
        window or the estimated inference time exceeds the time budget.
        """
        if num_tokens > self.max_context_tokens:
            return False, (
                f"context window exceeded: {num_tokens} tokens > "
                f"{self.max_context_tokens}"
            )

        flops = self.estimate_flops(num_tokens)
        est_seconds = flops / (cpu_budget_gflops * 1e9)
        if est_seconds > self.max_inference_seconds:
            return False, (
                f"estimated inference time {est_seconds:.1f}s exceeds "
                f"{self.max_inference_seconds:.1f}s budget"
            )

        return True, f"fits budget (est {est_seconds:.2f}s @ {num_tokens} tokens)"

    def check_budget(self, metadata: ModelMetadata) -> bool:
        """Legacy check: does the model fit within budget constraints?"""
        return (
            metadata.flop_per_token <= self.flop_per_token
            and metadata.context_window <= self.max_context_tokens
        )


@dataclass
class ModelResolution:
    """A resolved model file on disk."""
    metadata: ModelMetadata
    path: Path


class ModelLoader:
    """Locates model files on disk and validates them against budget."""

    def __init__(
        self,
        models_dir: Path,
        default_budget: ModelBudget | None = None,
    ):
        self.models_dir = Path(models_dir)
        self.default_budget = default_budget or ModelBudget()

    def find_model(
        self,
        model_name: str,
        quantization: QuantizationFormat | None = None,
    ) -> ModelResolution:
        """Find a model file for the given name/quantization."""
        candidates: list[Path] = []

        quant = quantization or QuantizationFormat.Q4_1
        for pattern in (
            f"{model_name}*{quant.value.lower()}*",
            f"{model_name}*",
            f"{model_name}.gguf",
        ):
            candidates.extend(self.models_dir.glob(pattern))

        # Deduplicate preserving order
        seen: set[Path] = set()
        unique = [p for p in candidates if not (p in seen or seen.add(p))]
        if not unique:
            raise FileNotFoundError(
                f"No model file found for '{model_name}' in {self.models_dir}"
            )

        path = unique[0]
        metadata = self._metadata_for(path, model_name, quant)
        return ModelResolution(metadata=metadata, path=path)

    def get_budget(self, model_name: str) -> ModelBudget:
        """Return the budget applicable to a model."""
        return self.default_budget

    def validate_budget(
        self,
        model_name: str,
        num_tokens: int,
    ) -> tuple[bool, str]:
        """Validate a token count against the model's budget."""
        return self.default_budget.fits_in_budget(num_tokens)

    def _metadata_for(
        self,
        path: Path,
        model_name: str,
        quantization: QuantizationFormat,
    ) -> ModelMetadata:
        """Derive ModelMetadata from a file on disk (size-based estimate)."""
        size_bytes = path.stat().st_size if path.exists() else 0
        parameter_count = max(int(size_bytes / 0.5), 1)
        return ModelMetadata(
            name=model_name,
            version="1.0.0",
            parameter_count=parameter_count,
            quantization=quantization,
            format="gguf" if path.suffix.lower() == ".gguf" else path.suffix.lower().lstrip("."),
            checksum_sha256="",
            flop_per_token=self.default_budget.flop_per_token,
            context_window=self.default_budget.max_context_tokens,
        )


def create_model_manifest(metadata: ModelMetadata) -> dict[str, Any]:
    """Create a model manifest for evidence tracking"""
    return metadata.to_evidence_dict()
