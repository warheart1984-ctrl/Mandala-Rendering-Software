#!/usr/bin/env python3
"""
Constitutional validation for generated textures
RT4D pre-validation: replay tokens, deterministic output, metadata embedding
"""

import json
import hashlib
import argparse
from pathlib import Path
from typing import Dict, List

from PIL import Image
import numpy as np


class ConstitutionalValidator:
    def __init__(self):
        self.validation_results = []

    def validate_replay_token(self, metadata: dict) -> bool:
        prompt = metadata.get("prompt", "")
        seed = metadata.get("seed", 0)
        expected_token = hashlib.sha256(f"{prompt}:{seed}".encode()).hexdigest()[:16]
        actual_token = metadata.get("replay_token", "")
        return expected_token == actual_token

    def validate_determinism(self, image1_path: str, image2_path: str, seed: int = 42) -> bool:
        img1 = np.array(Image.open(image1_path).convert("RGB"))
        img2 = np.array(Image.open(image2_path).convert("RGB"))

        if img1.shape != img2.shape:
            return False

        diff = np.abs(img1.astype(float) - img2.astype(float))
        mse = np.mean(diff ** 2)

        return mse < 1e-6

    def validate_metadata(self, metadata: dict) -> Dict:
        checks = {
            "has_prompt": bool(metadata.get("prompt")),
            "has_seed": isinstance(metadata.get("seed"), int),
            "has_replay_token": bool(metadata.get("replay_token")),
            "constitutional_flag": metadata.get("constitutional", False),
            "replay_token_valid": self.validate_replay_token(metadata)
        }

        all_passed = all(checks.values())

        return {
            "checks": checks,
            "all_passed": all_passed,
            "replay_token": metadata.get("replay_token", "")
        }

    def validate_image_properties(self, image_path: str) -> Dict:
        try:
            image = Image.open(image_path)
            return {
                "valid": True,
                "size": image.size,
                "mode": image.mode,
                "format": image.format
            }
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }

    def full_validation(self, image_path: str, metadata_path: str) -> Dict:
        results = {
            "image_path": image_path,
            "metadata_path": metadata_path,
            "validations": {}
        }

        if Path(metadata_path).exists():
            with open(metadata_path, "r") as f:
                metadata = json.load(f)
            results["validations"]["metadata"] = self.validate_metadata(metadata)
        else:
            results["validations"]["metadata"] = {"error": "No metadata file"}

        results["validations"]["image"] = self.validate_image_properties(image_path)

        image_valid = results["validations"]["image"]["valid"]
        metadata_valid = results["validations"]["metadata"].get("all_passed", False)

        results["constitutional"] = image_valid and metadata_valid

        self.validation_results.append(results)
        return results

    def batch_validate(self, directory: str) -> List[Dict]:
        dir_path = Path(directory)
        results = []

        for metadata_file in sorted(dir_path.glob("*.json")):
            image_file = metadata_file.with_suffix(".png")
            if not image_file.exists():
                image_file = metadata_file.with_suffix(".jpg")

            if image_file.exists():
                result = self.full_validation(str(image_file), str(metadata_file))
                results.append(result)

        return results

    def generate_report(self) -> Dict:
        total = len(self.validation_results)
        valid = sum(1 for r in self.validation_results if r["constitutional"])

        return {
            "total_validated": total,
            "valid": valid,
            "invalid": total - valid,
            "pass_rate": valid / total if total > 0 else 0,
            "constitutional": True,
            "results": self.validation_results
        }


def main():
    parser = argparse.ArgumentParser(description="Constitutional validation for generated textures")
    parser.add_argument("--image", type=str, help="Image to validate")
    parser.add_argument("--metadata", type=str, help="Metadata JSON to validate")
    parser.add_argument("--directory", type=str, help="Directory of images/metadata to validate")
    parser.add_argument("--output", type=str, default="validation_report.json", help="Output report")
    args = parser.parse_args()

    validator = ConstitutionalValidator()

    if args.image and args.metadata:
        result = validator.full_validation(args.image, args.metadata)
        print(json.dumps(result, indent=2))
    elif args.directory:
        results = validator.batch_validate(args.directory)
        report = validator.generate_report()

        with open(args.output, "w") as f:
            json.dump(report, f, indent=2)

        print(f"\nConstitutional Validation Report")
        print(f"Total: {report['total_validated']}")
        print(f"Valid: {report['valid']}")
        print(f"Invalid: {report['invalid']}")
        print(f"Pass rate: {report['pass_rate']:.2%}")
    else:
        print("Provide --image + --metadata or --directory")


if __name__ == "__main__":
    main()
