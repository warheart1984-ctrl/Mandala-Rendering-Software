from __future__ import annotations

import json
import subprocess
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class QuantizationFormat(str):
    Q4_1 = "Q4_1"
    Q5_1 = "Q5_1"
    Q8_0 = "Q8_0"


def build_llama_cpp(model_path: Path, quant_format: QuantizationFormat = QuantizationFormat.Q4_1, verbose: bool = False) -> bool:
    """Build/load llama.cpp model from GGUF file"""
    try:
        # In production: invoke llama.cpp loader
        # For now: validate the GGUF file exists and is readable
        if not model_path.exists():
            return False
        if quant_format == QuantizationFormat.Q4_1:
            # Q4_1 is the default for smollm-360m
            return True
        return False
    except Exception:
        return False


def download_model(url: str, dest: Path, progress: bool = True) -> bool:
    """Download a model from HF hub"""
    import urllib.request
    try:
        urllib.request.urlretrieve(url, dest)
        return dest.exists()
    except Exception:
        return False


def quantize_all_models(source_dir: Path, target_dir: Path, formats: list[QuantizationFormat] | None = None) -> bool:
    """Quantize all GGUF models in a directory"""
    import shutil
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        for gguf_file in source_dir.glob("*.gguf"):
            for fmt in (formats or [QuantizationFormat.Q4_1]):
                # In production: invoke llama.cpp quantization
                target_dir.joinpath(gguf_file.name).touch()
        return True
    except Exception:
        return False


def validate_models(model_dir: Path, min_params: int = 1_000_000) -> dict[str, bool]:
    """Validate GGUF models in a directory"""
    results: dict[str, bool] = {}
    try:
        for gguf_file in model_dir.glob("*.gguf"):
            size_mb = gguf_file.stat().st_size / (1024 * 1024)
            results[gguf_file.name] = size_mb > 0.1  # placeholder validation
    except Exception:
        pass
    return results
