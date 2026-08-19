#!/usr/bin/env python3
"""
Export merged model to GGUF format
For SD Turbo constitutional texture generation
"""

import os
import json
import yaml
import hashlib
import argparse
import struct
from pathlib import Path
from typing import Dict

import torch
from diffusers import StableDiffusionPipeline
import numpy as np


class GGUFExporter:
    GGUF_MAGIC = b"GGUF"
    GGUF_VERSION = 3

    def __init__(self, model_path: str):
        self.model_path = model_path

    def export(self, output_path: str, quantization: str = "f16"):
        print(f"Loading model: {self.model_path}...")
        pipe = StableDiffusionPipeline.from_pretrained(
            self.model_path,
            torch_dtype=torch.float16
        )

        print(f"Exporting to GGUF: {output_path}...")

        metadata = self.prepare_metadata(pipe)

        self.write_gguf(output_path, pipe, metadata, quantization)

        self.save_constitutional_metadata(output_path)

        print("GGUF export complete.")
        return output_path

    def prepare_metadata(self, pipe) -> Dict:
        metadata = {
            "architecture": "stable-diffusion",
            "name": "mandala-constitutional-sd-turbo",
            "quantization": "f16",
            "constitutional": True,
            "rt4d_compatible": True,
            "deterministic": True,
            "replay_token_seed": 42
        }

        if hasattr(pipe, "unet"):
            unet_config = pipe.unet.config
            metadata["unet"] = {
                "in_channels": unet_config.in_channels,
                "out_channels": unet_config.out_channels,
                "down_block_types": unet_config.down_block_types,
                "up_block_types": unet_config.up_block_types,
                "block_out_channels": unet_config.block_out_channels
            }

        if hasattr(pipe, "vae"):
            vae_config = pipe.vae.config
            metadata["vae"] = {
                "in_channels": vae_config.in_channels,
                "out_channels": vae_config.out_channels,
                "block_out_channels": vae_config.block_out_channels
            }

        return metadata

    def write_gguf(self, output_path: str, pipe, metadata: Dict, quantization: str):
        with open(output_path, "wb") as f:
            f.write(self.GGUF_MAGIC)
            f.write(struct.pack("<I", self.GGUF_VERSION))

            metadata_json = json.dumps(metadata).encode("utf-8")
            f.write(struct.pack("<Q", len(metadata_json)))
            f.write(metadata_json)

            self.write_tensors(f, pipe, quantization)

    def write_tensors(self, f, pipe, quantization: str):
        tensors = []

        if hasattr(pipe, "unet"):
            for name, param in pipe.unet.named_parameters():
                tensors.append((f"unet.{name}", param.data.cpu().numpy()))

        if hasattr(pipe, "vae"):
            for name, param in pipe.vae.named_parameters():
                tensors.append((f"vae.{name}", param.data.cpu().numpy()))

        f.write(struct.pack("<Q", len(tensors)))

        for name, tensor in tensors:
            name_bytes = name.encode("utf-8")
            f.write(struct.pack("<Q", len(name_bytes)))
            f.write(name_bytes)

            ndim = len(tensor.shape)
            f.write(struct.pack("<I", ndim))
            for dim in tensor.shape:
                f.write(struct.pack("<Q", dim))

            dtype_id = self.get_dtype_id(tensor.dtype, quantization)
            f.write(struct.pack("<I", dtype_id))

        for name, tensor in tensors:
            self.write_tensor_data(f, tensor, quantization)

    def get_dtype_id(self, dtype, quantization: str) -> int:
        if quantization == "f32":
            return 0
        elif quantization == "f16":
            return 1
        elif quantization == "q8_0":
            return 2
        elif quantization == "q4_0":
            return 3
        return 1

    def write_tensor_data(self, f, tensor: np.ndarray, quantization: str):
        if quantization == "f32":
            f.write(tensor.astype(np.float32).tobytes())
        elif quantization == "f16":
            f.write(tensor.astype(np.float16).tobytes())
        elif quantization == "q8_0":
            self.write_q8_0(f, tensor)
        elif quantization == "q4_0":
            self.write_q4_0(f, tensor)

    def write_q8_0(self, f, tensor: np.ndarray):
        flat = tensor.flatten()
        abs_max = np.max(np.abs(flat))
        scale = abs_max / 127.0 if abs_max > 0 else 1.0
        quantized = np.clip(np.round(flat / scale), -128, 127).astype(np.int8)
        f.write(struct.pack("<f", scale))
        f.write(quantized.tobytes())

    def write_q4_0(self, f, tensor: np.ndarray):
        flat = tensor.flatten()
        abs_max = np.max(np.abs(flat))
        scale = abs_max / 7.0 if abs_max > 0 else 1.0
        quantized = np.clip(np.round(flat / scale), -8, 7).astype(np.int8)
        f.write(struct.pack("<f", scale))
        f.write(quantized.tobytes())

    def save_constitutional_metadata(self, output_path: str):
        metadata = {
            "constitutional": True,
            "format": "gguf",
            "model_type": "sd_turbo_constitutional",
            "rt4d_compatible": True,
            "deterministic": True,
            "replay_token_seed": 42
        }

        metadata_path = Path(output_path).with_suffix(".gguf.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        print(f"Constitutional metadata saved: {metadata_path}")


def main():
    parser = argparse.ArgumentParser(description="Export model to GGUF format")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--model", type=str, required=True, help="Model path to export")
    parser.add_argument("--output", type=str, required=True, help="Output GGUF path")
    parser.add_argument("--quantization", type=str, default="f16",
                        choices=["f32", "f16", "q8_0", "q4_0"])
    args = parser.parse_args()

    exporter = GGUFExporter(model_path=args.model)
    exporter.export(
        output_path=args.output,
        quantization=args.quantization
    )


if __name__ == "__main__":
    main()
