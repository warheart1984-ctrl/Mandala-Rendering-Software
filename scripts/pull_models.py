#!/usr/bin/env python3
"""
Download models for SME from Hugging Face Hub.
Uses bartowski's GGUF repos which are verified to work (modern quantizations).
"""
import argparse
import hashlib
from pathlib import Path

from huggingface_hub import hf_hub_download


# Verified working GGUF models from bartowski (modern, reliable quantizations)
MODEL_REGISTRY = {
    # SME-TXT: Text models from bartowski (modern, reliable)
    "llama-3.2-1b": {
        "repo": "bartowski/Llama-3.2-1B-Instruct-GGUF",
        "files": {
            "Q4_K_M": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
            "Q5_K_M": "Llama-3.2-1B-Instruct-Q5_K_M.gguf",
        },
    },
    "llama-3.2-3b": {
        "repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "files": {
            "Q4_K_M": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            "Q5_K_M": "Llama-3.2-3B-Instruct-Q5_K_M.gguf",
        },
    },
    "phi-3-mini-4k": {
        "repo": "bartowski/Phi-3-mini-4k-instruct-GGUF",
        "files": {
            "Q4_K_M": "Phi-3-mini-4k-instruct-Q4_K_M.gguf",
            "Q5_K_M": "Phi-3-mini-4k-instruct-Q5_K_M.gguf",
        },
    },
    "phi-3.5-mini": {
        "repo": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "files": {
            "Q4_K_M": "Phi-3.5-mini-instruct-Q4_K_M.gguf",
            "Q5_K_M": "Phi-3.5-mini-instruct-Q5_K_M.gguf",
        },
    },
    "gemma-2-2b": {
        "repo": "bartowski/Gemma-2-2B-It-GGUF",
        "files": {
            "Q4_K_M": "Gemma-2-2B-It-Q4_K_M.gguf",
            "Q5_K_M": "Gemma-2-2B-It-Q5_K_M.gguf",
        },
    },
    "qwen2.5-0.5b": {
        "repo": "bartowski/Qwen2.5-0.5B-Instruct-GGUF",
        "files": {
            "Q4_K_M": "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
            "Q5_K_M": "Qwen2.5-0.5B-Instruct-Q5_K_M.gguf",
        },
    },
    "qwen2.5-1.5b": {
        "repo": "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
        "files": {
            "Q4_K_M": "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
            "Q5_K_M": "Qwen2.5-1.5B-Instruct-Q5_K_M.gguf",
        },
    },
    "smollm-360m": {
        "repo": "bartowski/SmolLM-360M-Instruct-GGUF",
        "files": {
            "Q4_K_M": "SmolLM-360M-Instruct-Q4_K_M.gguf",
            "Q5_K_M": "SmolLM-360M-Instruct-Q5_K_M.gguf",
        },
    },
    "tinyllama-1.1b": {
        "repo": "bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF",
        "files": {
            "Q4_K_M": "TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf",
            "Q5_K_M": "TinyLlama-1.1B-Chat-v1.0-Q5_K_M.gguf",
        },
    },
    "stablelm-2-1.6b": {
        "repo": "bartowski/StableLM-2-1.6B-Chat-GGUF",
        "files": {
            "Q4_K_M": "StableLM-2-1.6B-Chat-Q4_K_M.gguf",
            "Q5_K_M": "StableLM-2-1.6B-Chat-Q5_K_M.gguf",
        },
    },
    
    # SME-AUD: Whisper models from ggerganov/whisper.cpp (original fp16)
    "whisper-tiny": {
        "repo": "ggerganov/whisper.cpp",
        "files": {
            "base": "ggml-tiny.bin",
            "base_en": "ggml-tiny.en.bin",
        },
    },
    "whisper-base": {
        "repo": "ggerganov/whisper.cpp",
        "files": {
            "base": "ggml-base.bin",
            "base_en": "ggml-base.en.bin",
        },
    },
    "whisper-small": {
        "repo": "ggerganov/whisper.cpp",
        "files": {
            "base": "ggml-small.bin",
            "base_en": "ggml-small.en.bin",
        },
    },
    "whisper-medium": {
        "repo": "ggerganov/whisper.cpp",
        "files": {
            "base": "ggml-medium.bin",
            "base_en": "ggml-medium.en.bin",
        },
    },
    
    # SME-VIS: Vision models (PyTorch - need ONNX conversion)
    "mobilevit-xxs": {
        "repo": "apple/mobilevit-xxs",
        "files": {"pytorch_model.bin": "pytorch_model.bin"},
        "note": "Convert to ONNX: python -m torch.onnx.export",
    },
    "vit-tiny-patch16-224": {
        "repo": "google/vit-tiny-patch16-224",
        "files": {"pytorch_model.bin": "pytorch_model.bin"},
        "note": "Convert to ONNX",
    },
    "mobilenet-v3-small": {
        "repo": "pytorch/vision",
        "files": {"torchscript": "mobilenet_v3_small.pt"},
        "note": "Use torchvision + torch.onnx.export",
    },
    
    # SME-GEN: Diffusion (need ONNX conversion from diffusers)
    "sd15": {
        "repo": "runwayml/stable-diffusion-v1-5",
        "files": {"model_index.json": "model_index.json"},
        "note": "Convert with diffusers ONNX export",
    },
    "sdxl-turbo": {
        "repo": "stabilityai/sdxl-turbo",
        "files": {"model_index.json": "model_index.json"},
        "note": "Convert with diffusers ONNX export",
    },
    
    # SME-GEN: Piper TTS
    "piper-en_US-lessac-medium": {
        "repo": "rhasspy/piper-voices",
        "files": {
            "model": "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
            "config": "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
        },
    },
    "piper-en_GB-alan-medium": {
        "repo": "rhasspy/piper-voices",
        "files": {
            "model": "en/en_GB/alan/medium/en_GB-alan-medium.onnx",
            "config": "en/en_GB/alan/medium/en_GB-alan-medium.onnx.json",
        },
    },
}


def compute_sha256(filepath: Path) -> str:
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def download_model(model_name: str, quant: str, models_dir: Path) -> Path:
    """Download a specific model quantization"""
    if model_name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model: {model_name}")
    
    registry = MODEL_REGISTRY[model_name]
    repo = registry["repo"]
    
    if quant not in registry["files"]:
        available = list(registry["files"].keys())
        raise ValueError(f"Quantization '{quant}' not available for {model_name}. Available: {available}")
    
    filename = registry["files"][quant]
    
    model_dir = models_dir / model_name
    model_dir.mkdir(parents=True, exist_ok=True)
    output_path = model_dir / filename
    
    if output_path.exists():
        print(f"Already exists: {output_path}")
        return output_path
    
    print(f"Downloading {model_name} ({quant}) from {repo}...")
    try:
        downloaded = hf_hub_download(
            repo_id=repo,
            filename=filename,
            local_dir=model_dir,
            local_dir_use_symlinks=False,
        )
    except Exception as e:
        print(f"Failed to download {model_name} ({quant}): {e}")
        raise
    
    actual = compute_sha256(Path(downloaded))
    print(f"Checksum: {actual[:16]}...")
    
    return Path(downloaded)


def compute_sha256(filepath: Path) -> str:
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def create_manifest(models_dir: Path, output_path: Path):
    """Create model manifest with checksums"""
    import json
    
    manifest = {"version": "1.0.0", "models": {}}
    
    for model_name, registry in MODEL_REGISTRY.items():
        model_dir = models_dir / model_name
        if not model_dir.exists():
            continue
        
        for quant, filename in registry["files"].items():
            filepath = model_dir / filename
            if filepath.exists():
                checksum = compute_sha256(filepath)
                key = f"{model_name}:{quant}"
                manifest["models"][key] = {
                    "model": model_name,
                    "quantization": quant,
                    "filename": filename,
                    "checksum_sha256": checksum,
                    "size_bytes": filepath.stat().st_size,
                }
    
    with open(output_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"Manifest created: {output_path}")
    print(f"Models in manifest: {len(manifest['models'])}")


def main():
    parser = argparse.ArgumentParser(description="Download SME models from Hugging Face Hub")
    parser.add_argument("--models-dir", type=Path, default=Path("./models"))
    parser.add_argument("--model", choices=list(MODEL_REGISTRY.keys()) + ["all"], default="all")
    parser.add_argument("--quant", default="all", help="Quantization/file to download")
    parser.add_argument("--manifest", type=Path, help="Output manifest path")
    args = parser.parse_args()
    
    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)
    
    models_to_download = list(MODEL_REGISTRY.keys()) if args.model == "all" else [args.model]
    
    for model_name in models_to_download:
        registry = MODEL_REGISTRY[model_name]
        
        if args.quant == "all":
            quants_to_download = list(registry["files"].keys())
        else:
            quants_to_download = [args.quant]
        
        for quant in quants_to_download:
            if quant in registry["files"]:
                try:
                    download_model(model_name, quant, models_dir)
                except Exception as e:
                    print(f"Error downloading {model_name} ({quant}): {e}")
            else:
                available = list(registry["files"].keys())
                print(f"File '{quant}' not available for {model_name}. Available: {available}")
    
    if args.manifest:
        create_manifest(models_dir, args.manifest)


if __name__ == "__main__":
    main()