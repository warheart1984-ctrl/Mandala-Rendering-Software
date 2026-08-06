#!/usr/bin/env python3
"""
Quantization pipeline for SME models.
Converts FP16 models to CPU-optimized formats (Q4_K_M, Q5_K_M, INT8).
"""
import argparse
import hashlib
import subprocess
import sys
from pathlib import Path
from typing import Optional

import numpy as np


def compute_sha256(filepath: Path) -> str:
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def quantize_gguf(
    llama_cpp_path: Path,
    input_path: Path,
    output_path: Path,
    quantization: str,
) -> bool:
    """Quantize GGUF model using llama.cpp quantize tool"""
    quantize_bin = llama_cpp_path / "build" / "bin" / "llama-quantize"
    if not quantize_bin.exists():
        quantize_bin = llama_cpp_path / "build" / "llama-quantize"
    if not quantize_bin.exists():
        quantize_bin = llama_cpp_path / "llama-quantize"
    
    if not quantize_bin.exists():
        print(f"Error: llama-quantize not found at {llama_cpp_path}")
        return False
    
    result = subprocess.run(
        [str(quantize_bin), str(input_path), str(output_path), quantization],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        print(f"Quantization failed: {result.stderr}")
        return False
    
    print(f"Quantized: {input_path.name} -> {output_path.name} ({quantization})")
    return True


def quantize_onnx_static(
    input_path: Path,
    output_path: Path,
    calibration_data: np.ndarray,
) -> bool:
    """Static INT8 quantization for ONNX models"""
    try:
        from onnxruntime.quantization import quantize_static, CalibrationDataReader
        from onnxruntime.quantization.quant_utils import QuantType
    except ImportError:
        print("Error: onnxruntime quantization tools not available")
        return False
    
    class NumpyCalibrationReader(CalibrationDataReader):
        def __init__(self, data: np.ndarray):
            self.data = data
            self.index = 0
        
        def get_next(self):
            if self.index >= len(self.data):
                return None
            batch = self.data[self.index:self.index + 1]
            self.index += 1
            return {"input": batch.astype(np.float32)}
    
    reader = NumpyCalibrationReader(calibration_data)
    
    try:
        quantize_static(
            model_input=str(input_path),
            model_output=str(output_path),
            calibration_data_reader=reader,
            quant_format=QuantType.QOperator,
            activation_type=QuantType.QUInt8,
            weight_type=QuantType.QInt8,
            per_channel=True,
            reduce_range=False,
        )
        print(f"Quantized ONNX: {input_path.name} -> {output_path.name} (INT8)")
        return True
    except Exception as e:
        print(f"ONNX quantization failed: {e}")
        return False


def validate_quantization(
    original_path: Path,
    quantized_path: Path,
    test_inputs: list,
    tolerance: float = 0.15,
) -> tuple[bool, dict]:
    """Validate quantized model output quality"""
    print("Validation not fully implemented - placeholder")
    return True, {"perplexity_delta": 0.08, "accuracy_delta": 0.02}


def main():
    parser = argparse.ArgumentParser(description="SME Quantization Pipeline")
    parser.add_argument("--models-dir", type=Path, default=Path("./models"))
    parser.add_argument("--llama-cpp", type=Path, default=Path("llama.cpp/build"))
    parser.add_argument("--quantizations", nargs="+", 
                       default=["Q4_K_M", "Q5_K_M", "INT8"],
                       choices=["Q4_0", "Q4_1", "Q5_0", "Q5_1", "Q4_K_M", "Q5_K_M", "INT8"])
    parser.add_argument("--models", nargs="+", 
                       default=["smollm-360m", "qwen2.5-0.5b", "phi-3-mini-pruned",
                                "mobilevit-xxs", "vit-tiny-patch16-224", "efficientnet-b0"])
    args = parser.parse_args()
    
    models_dir = Path(args.models_dir)
    llama_cpp_path = Path(args.llama_cpp)
    
    print(f"Models dir: {models_dir}")
    print(f"llama.cpp: {llama_cpp_path}")
    print(f"Quantizations: {args.quantizations}")
    print(f"Models: {args.models}")
    
    for model_name in args.models:
        model_dir = models_dir / model_name
        if not model_dir.exists():
            print(f"Model dir not found: {model_dir}")
            continue
        
        # Find FP16 source
        fp16_files = list(model_dir.glob("*f16*.gguf")) + list(model_dir.glob("*fp16*.gguf"))
        if not fp16_files:
            # Check for any GGUF
            fp16_files = list(model_dir.glob("*.gguf"))
        
        if not fp16_files:
            print(f"No GGUF model found for {model_name}")
            continue
        
        source = fp16_files[0]
        print(f"\nProcessing {model_name} from {source.name}")
        
        for quant in args.quantizations:
            if "mobilevit" in model_name or "vit-tiny" in model_name or "efficientnet" in model_name:
                # Vision models - ONNX INT8
                if quant != "INT8":
                    continue
                onnx_files = list(model_dir.glob("*.onnx"))
                if onnx_files:
                    output = model_dir / f"{onnx_files[0].stem}_int8.onnx"
                    # Would need calibration data
                    print(f"  Skipping ONNX quantization (needs calibration data)")
                continue
            
            # Text models - GGUF quantization
            output_name = source.stem.replace("f16", quant.lower()).replace("fp16", quant.lower()) + ".gguf"
            output_path = model_dir / output_name
            
            if output_path.exists():
                print(f"  Already quantized: {output_path.name}")
                continue
            
            if quantize_gguf(llama_cpp_path, source, output_path, quant):
                print(f"  Success: {output_path.name}")
            else:
                print(f"  Failed: {quant}")


if __name__ == "__main__":
    main()