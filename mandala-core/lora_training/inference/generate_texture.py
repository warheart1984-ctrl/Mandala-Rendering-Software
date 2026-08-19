#!/usr/bin/env python3
"""
Generate constitutional textures using trained LoRA adapters
SD Turbo and AnythingV3 support
"""

import os
import json
import yaml
import hashlib
import argparse
from pathlib import Path

import torch
from diffusers import StableDiffusionPipeline, DDIMScheduler
from peft import PeftModel
from PIL import Image
import numpy as np


class ConstitutionalTextureGenerator:
    def __init__(self, model_path: str, lora_path: str, device: str = "cuda"):
        self.device = torch.device(device)
        self.dtype = torch.float16

        print(f"Loading base model: {model_path}...")
        self.pipe = StableDiffusionPipeline.from_pretrained(
            model_path,
            torch_dtype=self.dtype,
            safety_checker=None
        )
        self.pipe.scheduler = DDIMScheduler.from_config(self.pipe.scheduler.config)

        print(f"Loading LoRA adapter: {lora_path}...")
        self.pipe.unet = PeftModel.from_pretrained(self.pipe.unet, lora_path)
        self.pipe.text_encoder = PeftModel.from_pretrained(self.pipe.text_encoder, lora_path)

        self.pipe = self.pipe.to(self.device)

    def generate(
        self,
        prompt: str,
        seed: int = 42,
        num_inference_steps: int = 4,
        guidance_scale: float = 0.0,
        width: int = 512,
        height: int = 512
    ) -> dict:
        generator = torch.Generator(device=self.device).manual_seed(seed)

        result = self.pipe(
            prompt=prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            width=width,
            height=height,
            generator=generator
        )

        image = result.images[0]

        replay_token = self.compute_replay_token(prompt, seed)

        metadata = {
            "prompt": prompt,
            "seed": seed,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "replay_token": replay_token,
            "constitutional": True
        }

        return {
            "image": image,
            "metadata": metadata
        }

    def compute_replay_token(self, prompt: str, seed: int) -> str:
        data = f"{prompt}:{seed}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def generate_batch(
        self,
        prompts: list,
        seed: int = 42,
        output_dir: str = "outputs"
    ) -> list:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        results = []
        for i, prompt in enumerate(prompts):
            print(f"Generating {i+1}/{len(prompts)}: {prompt[:50]}...")
            result = self.generate(prompt=prompt, seed=seed)

            image_path = output_path / f"texture_{i:04d}.png"
            result["image"].save(image_path)

            metadata_path = output_path / f"texture_{i:04d}.json"
            with open(metadata_path, "w") as f:
                json.dump(result["metadata"], f, indent=2)

            results.append({
                "image_path": str(image_path),
                "metadata": result["metadata"]
            })

        return results


def load_config(config_path: str) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="Generate constitutional textures")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--model", type=str, choices=["sd_turbo", "anythingv3"], required=True)
    parser.add_argument("--prompt", type=str, default=None, help="Single prompt to generate")
    parser.add_argument("--prompts_file", type=str, default=None, help="File with prompts (one per line)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation")
    parser.add_argument("--output_dir", type=str, default="outputs", help="Output directory")
    parser.add_argument("--device", type=str, default="cuda", help="Device to use")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.model == "sd_turbo":
        model_path = config["model"]["name"]
        lora_path = config["training"]["output_dir"] + "/final"
    else:
        model_path = config["model"]["name"]
        lora_path = config["training"]["output_dir"] + "/final"

    generator = ConstitutionalTextureGenerator(
        model_path=model_path,
        lora_path=lora_path,
        device=args.device
    )

    if args.prompt:
        prompts = [args.prompt]
    elif args.prompts_file:
        with open(args.prompts_file, "r") as f:
            prompts = [line.strip() for line in f if line.strip()]
    else:
        prompts = config.get("validation", {}).get("prompts", [
            "frosted glass microflake BRDF",
            "ocean waves Gerstner",
            "hologram shader with scanlines"
        ])

    results = generator.generate_batch(
        prompts=prompts,
        seed=args.seed,
        output_dir=args.output_dir
    )

    print(f"\nGenerated {len(results)} constitutional textures")
    print(f"Output: {args.output_dir}")

    summary_path = Path(args.output_dir) / "generation_summary.json"
    with open(summary_path, "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
