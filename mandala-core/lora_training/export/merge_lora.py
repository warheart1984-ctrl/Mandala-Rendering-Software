#!/usr/bin/env python3
"""
Merge LoRA adapter back into base model
Produces constitutional merged model ready for inference or GGUF export
"""

import os
import json
import yaml
import hashlib
import argparse
from pathlib import Path

import torch
from diffusers import StableDiffusionPipeline
from peft import PeftModel


class ConstitutionalMerger:
    def __init__(self, base_model_path: str, lora_path: str):
        self.base_model_path = base_model_path
        self.lora_path = lora_path

    def merge(self, output_path: str, dtype: str = "float16"):
        print(f"Loading base model: {self.base_model_path}...")
        pipe = StableDiffusionPipeline.from_pretrained(
            self.base_model_path,
            torch_dtype=getattr(torch, dtype)
        )

        print(f"Loading LoRA adapter: {self.lora_path}...")
        pipe.unet = PeftModel.from_pretrained(pipe.unet, self.lora_path)
        pipe.text_encoder = PeftModel.from_pretrained(pipe.text_encoder, self.lora_path)

        print("Merging LoRA into base model...")
        pipe.unet = pipe.unet.merge_and_unload()
        pipe.text_encoder = pipe.text_encoder.merge_and_unload()

        print(f"Saving merged model to: {output_path}...")
        pipe.save_pretrained(output_path)

        self.save_constitutional_metadata(output_path)

        print("Merge complete.")
        return output_path

    def save_constitutional_metadata(self, output_path: str):
        metadata = {
            "constitutional": True,
            "merge_info": {
                "base_model": self.base_model_path,
                "lora_adapter": self.lora_path,
                "merge_type": "constitutional_merge"
            },
            "replay_token_seed": 42,
            "deterministic": True,
            "rt4d_compatible": True
        }

        metadata_path = Path(output_path) / "constitutional_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        print(f"Constitutional metadata saved: {metadata_path}")


def load_config(config_path: str) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into base model")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--base", type=str, required=True, help="Base model path or HF name")
    parser.add_argument("--adapter", type=str, required=True, help="LoRA adapter path")
    parser.add_argument("--output", type=str, required=True, help="Output path for merged model")
    parser.add_argument("--dtype", type=str, default="float16", choices=["float16", "float32"])
    args = parser.parse_args()

    merger = ConstitutionalMerger(
        base_model_path=args.base,
        lora_path=args.adapter
    )

    merger.merge(
        output_path=args.output,
        dtype=args.dtype
    )


if __name__ == "__main__":
    main()
