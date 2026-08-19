#!/usr/bin/env python3
"""
Constitutional quality control using trained Vision QC LoRA
Detects artifacts: noise, banding, aliasing, flicker, ghosting, blur, exposure
"""

import os
import json
import yaml
import hashlib
import argparse
from pathlib import Path

import torch
from transformers import ViTForImageClassification, ViTImageProcessor
from peft import PeftModel
from PIL import Image
import numpy as np


class ConstitutionalQualityControl:
    ARTIFACT_LABELS = {
        0: "clean",
        1: "noise",
        2: "banding",
        3: "aliasing",
        4: "flicker",
        5: "ghosting",
        6: "blur",
        7: "overexposed",
        8: "underexposed",
        9: "compression"
    }

    def __init__(self, model_path: str, lora_path: str, device: str = "cuda"):
        self.device = torch.device(device)
        self.dtype = torch.float16

        print(f"Loading Vision QC model: {model_path}...")
        self.processor = ViTImageProcessor.from_pretrained(model_path)

        model = ViTForImageClassification.from_pretrained(
            model_path,
            torch_dtype=self.dtype
        )

        print(f"Loading LoRA adapter: {lora_path}...")
        model = PeftModel.from_pretrained(model, lora_path)

        self.model = model.to(self.device).eval()

    def analyze(self, image_path: str) -> dict:
        image = Image.open(image_path).convert("RGB")

        inputs = self.processor(images=image, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=-1)

        predicted_class = torch.argmax(probs, dim=-1).item()
        confidence = probs[0][predicted_class].item()

        artifact_scores = {}
        for idx, label in self.ARTIFACT_LABELS.items():
            artifact_scores[label] = probs[0][idx].item()

        is_clean = predicted_class == 0 and confidence > 0.85

        replay_token = self.compute_replay_token(image_path)

        return {
            "image_path": image_path,
            "predicted_class": self.ARTIFACT_LABELS[predicted_class],
            "confidence": confidence,
            "is_clean": is_clean,
            "artifact_scores": artifact_scores,
            "replay_token": replay_token,
            "constitutional": True,
            "passes_qc": is_clean
        }

    def compute_replay_token(self, image_path: str) -> str:
        return hashlib.sha256(image_path.encode()).hexdigest()[:16]

    def batch_analyze(self, image_paths: list) -> list:
        results = []
        for path in image_paths:
            print(f"Analyzing: {path}")
            result = self.analyze(path)
            results.append(result)
            status = "PASS" if result["passes_qc"] else "FAIL"
            print(f"  {status}: {result['predicted_class']} ({result['confidence']:.2%})")
        return results

    def generate_report(self, results: list) -> dict:
        total = len(results)
        passed = sum(1 for r in results if r["passes_qc"])
        failed = total - passed

        artifact_counts = {}
        for r in results:
            cls = r["predicted_class"]
            artifact_counts[cls] = artifact_counts.get(cls, 0) + 1

        report = {
            "total_analyzed": total,
            "passed_qc": passed,
            "failed_qc": failed,
            "pass_rate": passed / total if total > 0 else 0,
            "artifact_distribution": artifact_counts,
            "constitutional": True,
            "results": results
        }

        return report


def load_config(config_path: str) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="Constitutional quality control for rendered textures")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--image", type=str, default=None, help="Single image to analyze")
    parser.add_argument("--images_dir", type=str, default=None, help="Directory of images to analyze")
    parser.add_argument("--output", type=str, default="qc_report.json", help="Output report path")
    parser.add_argument("--device", type=str, default="cuda", help="Device to use")
    parser.add_argument("--reject_threshold", type=float, default=0.85, help="Confidence threshold for clean")
    args = parser.parse_args()

    config = load_config(args.config)

    model_path = config["model"]["name"]
    lora_path = config["training"]["output_dir"] + "/final"

    qc = ConstitutionalQualityControl(
        model_path=model_path,
        lora_path=lora_path,
        device=args.device
    )

    if args.image:
        image_paths = [args.image]
    elif args.images_dir:
        image_paths = [
            os.path.join(args.images_dir, f)
            for f in os.listdir(args.images_dir)
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff'))
        ]
    else:
        test_images = config.get("validation", {}).get("test_images", [])
        image_paths = [img for img in test_images if os.path.exists(img)]

    if not image_paths:
        print("No images found to analyze")
        return

    results = qc.batch_analyze(image_paths)

    report = qc.generate_report(results)

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n{'='*50}")
    print(f"Constitutional QC Report")
    print(f"{'='*50}")
    print(f"Total analyzed: {report['total_analyzed']}")
    print(f"Passed QC: {report['passed_qc']}")
    print(f"Failed QC: {report['failed_qc']}")
    print(f"Pass rate: {report['pass_rate']:.2%}")
    print(f"Report saved: {args.output}")


if __name__ == "__main__":
    main()
