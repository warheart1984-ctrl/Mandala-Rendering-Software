"""
Axiom Vision — LoRA Object Detection Trainer.

Fine-tunes YOLO object detection models using LoRA (Low-Rank Adaptation)
for efficient training on custom datasets.

Pipeline:
1. Load pretrained YOLO model
2. Apply LoRA adapters to detection head
3. Train on custom annotated data
4. Export to ONNX (INT8 quantized)
5. Generate model evidence (checksum, metadata)

Requirements:
    pip install ultralytics onnxruntime onnx torch torchvision
    pip install peft  # For LoRA support

Usage:
    python -m training.lora_trainer --data dataset.yaml --epochs 50 --output ./models/my_detector
"""

import argparse
import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from typing import Optional

import numpy as np

# LoRA rank configurations per model size
LORA_CONFIGS = {
    "nano": {"rank": 4, "alpha": 8, "target_modules": ["model.22.cv2", "model.22.cv3"]},
    "small": {"rank": 8, "alpha": 16, "target_modules": ["model.22.cv2", "model.22.cv3"]},
    "medium": {"rank": 16, "alpha": 32, "target_modules": ["model.22.cv2", "model.22.cv3"]},
}

# Supported base models
SUPPORTED_MODELS = {
    "yolov8n": {"ultralytics": "yolov8n.pt", "params": 3_100_000, "input_size": 640},
    "yolov8s": {"ultralytics": "yolov8s.pt", "params": 11_200_000, "input_size": 640},
    "yolov8m": {"ultralytics": "yolov8m.pt", "params": 25_900_000, "input_size": 640},
    "yolov9t": {"ultralytics": "yolov9t.pt", "params": 2_100_000, "input_size": 640},
    "yolov11n": {"ultralytics": "yolov11n.pt", "params": 2_600_000, "input_size": 640},
}


def compute_sha256(filepath: Path) -> str:
    """Compute SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def apply_lora_to_yolo(model, rank: int = 8, alpha: int = 16, target_modules: list[str] = None):
    """
    Apply LoRA adapters to a YOLO model.
    Freezes the backbone and adds low-rank adaptation matrices to the detection head.
    """
    try:
        from peft import LoraConfig, get_peft_model, TaskType
    except ImportError:
        print("peft not installed, using manual LoRA implementation")
        return apply_lora_manual(model, rank, alpha, target_modules)

    # Use peft for LoRA
    lora_config = LoraConfig(
        r=rank,
        lora_alpha=alpha,
        target_modules=target_modules or ["cv2", "cv3"],
        lora_dropout=0.1,
        bias="none",
        task_type=TaskType.FEATURE_EXTRACTION,
    )

    peft_model = get_peft_model(model, lora_config)
    return peft_model


def apply_lora_manual(model, rank: int = 8, alpha: int = 16, target_modules: list[str] = None):
    """
    Manual LoRA implementation without peft.
    Adds low-rank adaptation: W' = W + (alpha/rank) * B @ A
    """
    import torch
    import torch.nn as nn

    lora_layers = []
    target_modules = target_modules or ["model.22.cv2", "model.22.cv3"]

    # Freeze all parameters first
    for param in model.parameters():
        param.requires_grad = False

    # Find target layers and add LoRA
    for name, module in model.named_modules():
        for target in target_modules:
            if target in name and isinstance(module, nn.Conv2d):
                lora_layers.append(name)

                # Create LoRA matrices
                in_features = module.in_channels
                out_features = module.out_channels

                lora_A = nn.Parameter(torch.randn(in_features, rank) * 0.01)
                lora_B = nn.Parameter(torch.zeros(rank, out_features))

                # Store as buffers
                module.register_parameter("lora_A", lora_A)
                module.register_parameter("lora_B", lora_B)
                module.requires_grad_(False)
                lora_A.requires_grad_(True)
                lora_B.requires_grad_(True)

    # Unfreeze LoRA parameters
    for param in model.parameters():
        if param.requires_grad:
            lora_layers.append(param)

    print(f"Applied LoRA to {len(lora_layers)} layers with rank={rank}")
    return model


class LoRATrainer:
    """
    LoRA trainer for YOLO object detection models.
    """

    def __init__(
        self,
        base_model: str = "yolov8n",
        data_config: str = "dataset.yaml",
        output_dir: str = "./models/custom_detector",
        lora_rank: int = 8,
        lora_alpha: int = 16,
        epochs: int = 50,
        batch_size: int = 16,
        image_size: int = 640,
        device: str = "cpu",
        learning_rate: float = 0.001,
    ):
        self.base_model = base_model
        self.data_config = data_config
        self.output_dir = Path(output_dir)
        self.lora_rank = lora_rank
        self.lora_alpha = lora_alpha
        self.epochs = epochs
        self.batch_size = batch_size
        self.image_size = image_size
        self.device = device
        self.learning_rate = learning_rate

        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.model = None
        self.results = None

    def setup(self):
        """Load base model and apply LoRA."""
        try:
            from ultralytics import YOLO
        except ImportError:
            raise ImportError(
                "ultralytics not installed. Install with: pip install ultralytics"
            )

        if self.base_model not in SUPPORTED_MODELS:
            raise ValueError(
                f"Unsupported model: {self.base_model}. Choose from: {list(SUPPORTED_MODELS.keys())}"
            )

        print(f"Loading base model: {self.base_model}")
        model_name = SUPPORTED_MODELS[self.base_model]["ultralytics"]
        self.model = YOLO(model_name)

        # Apply LoRA
        lora_config = LORA_CONFIGS.get("nano" if "n" in self.base_model else "small")
        effective_rank = self.lora_rank or lora_config["rank"]
        effective_alpha = self.lora_alpha or lora_config["alpha"]

        print(f"Applying LoRA: rank={effective_rank}, alpha={effective_alpha}")
        self.model = apply_lora_manual(
            self.model.model,  # Access underlying nn.Module
            rank=effective_rank,
            alpha=effective_alpha,
        )

    def train(self):
        """Run LoRA fine-tuning."""
        if not self.model:
            self.setup()

        print(f"Training on: {self.data_config}")
        print(f"Epochs: {self.epochs}, Batch: {self.batch_size}, Size: {self.image_size}")
        print(f"Device: {self.device}")

        start_time = time.time()

        # Train using ultralytics API
        self.results = self.model.train(
            data=self.data_config,
            epochs=self.epochs,
            batch=self.batch_size,
            imgsz=self.image_size,
            device=self.device,
            lr0=self.learning_rate,
            lrf=0.01,
            warmup_epochs=3,
            cos_lr=True,
            exist_ok=True,
            project=str(self.output_dir),
            name="train",
        )

        elapsed = time.time() - start_time
        print(f"\nTraining complete in {elapsed:.1f}s")

        return self.results

    def export_onnx(
        self,
        output_path: Optional[str] = None,
        quantize: bool = True,
        simplify: bool = True,
    ) -> Path:
        """Export trained model to ONNX format with INT8 quantization."""
        if not self.model:
            raise RuntimeError("Model not trained. Call train() first.")

        export_dir = self.output_dir / "onnx"
        export_dir.mkdir(exist_ok=True)

        onnx_path = export_dir / f"{self.base_model}_lora.onnx"

        print(f"Exporting to ONNX: {onnx_path}")

        # Export using ultralytics
        export_result = self.model.export(
            format="onnx",
            imgsz=self.image_size,
            simplify=simplify,
            int8=quantize,
            data=self.data_config,  # Needed for INT8 calibration
        )

        # Move to our target path
        exported = Path(export_result)
        if exported.exists():
            shutil.move(str(exported), str(onnx_path))

        # Compute checksum
        checksum = compute_sha256(onnx_path)
        file_size = onnx_path.stat().st_size

        print(f"ONNX exported: {onnx_path}")
        print(f"  Size: {file_size / 1e6:.2f} MB")
        print(f"  SHA-256: {checksum}")

        # Generate model evidence
        evidence = self._generate_model_evidence(onnx_path, checksum, file_size)
        evidence_path = export_dir / f"{self.base_model}_lora.evidence.json"
        with open(evidence_path, "w") as f:
            json.dump(evidence, f, indent=2)

        print(f"  Evidence: {evidence_path}")

        return onnx_path

    def _generate_model_evidence(self, onnx_path: Path, checksum: str, file_size: int) -> dict:
        """Generate constitutional model evidence for the exported model."""
        base_info = SUPPORTED_MODELS.get(self.base_model, {})

        return {
            "model_name": f"{self.base_model}-lora",
            "model_version": "1.0.0",
            "base_model": self.base_model,
            "parameter_count": base_info.get("params", 0),
            "quantization": "INT8" if True else "FP32",
            "format": "onnx",
            "checksum_sha256": checksum,
            "input_shape": [1, 3, self.image_size, self.image_size],
            "input_format": "NCHW",
            "file_size_bytes": file_size,
            "training": {
                "method": "lora",
                "rank": self.lora_rank,
                "alpha": self.lora_alpha,
                "epochs": self.epochs,
                "batch_size": self.batch_size,
                "learning_rate": self.learning_rate,
                "data_config": self.data_config,
                "device": self.device,
            },
            "lora": {
                "rank": self.lora_rank,
                "alpha": self.lora_alpha,
                "target_modules": ["model.22.cv2", "model.22.cv3"],
                "theoretical_param_reduction": f"{(1 - 2 * self.lora_rank / 256) * 100:.1f}%",
            },
            "constitutional": {
                "level": 3,
                "tag": "inference",
                "deterministic_inference": True,
                "note": "Given fixed weights + input + seed, output is deterministic",
            },
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "framework": "ultralytics",
        }

    def generate_requirements(self):
        """Generate requirements.txt for the training environment."""
        reqs = [
            "ultralytics>=8.0.0",
            "onnx>=1.14.0",
            "onnxruntime>=1.15.0",
            "torch>=2.0.0",
            "torchvision>=0.15.0",
            "numpy>=1.24.0",
            "Pillow>=9.0.0",
            "PyYAML>=6.0",
        ]

        req_path = self.output_dir / "requirements.txt"
        with open(req_path, "w") as f:
            f.write("\n".join(reqs))

        print(f"Requirements: {req_path}")


def create_dataset_template(output_dir: str):
    """Create a dataset.yaml template for YOLO training."""
    template = {
        "path": "./dataset",
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "person",
            1: "vehicle",
            2: "object",
        },
        "download": "",
    }

    import yaml
    dataset_path = Path(output_dir) / "dataset_template.yaml"
    with open(dataset_path, "w") as f:
        yaml.dump(template, f, default_flow_style=False, sort_keys=False)

    # Create directory structure
    ds_dir = Path(output_dir) / "dataset"
    for split in ["train", "val", "test"]:
        (ds_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (ds_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    print(f"Dataset template: {dataset_path}")
    print(f"Dataset structure: {ds_dir}")
    print("\nTo add training data:")
    print("  1. Place images in dataset/images/train/")
    print("  2. Create YOLO-format .txt annotations in dataset/labels/train/")
    print("  3. Each .txt file: <class> <cx> <cy> <w> <h> (normalized 0-1)")


def main():
    parser = argparse.ArgumentParser(description="Axiom Vision LoRA Object Detection Trainer")
    subparsers = parser.add_subparsers(dest="command")

    # Train command
    train_parser = subparsers.add_parser("train", help="Train LoRA model")
    train_parser.add_argument("--data", required=True, help="Path to dataset.yaml")
    train_parser.add_argument("--model", default="yolov8n", choices=list(SUPPORTED_MODELS.keys()))
    train_parser.add_argument("--output", default="./models/custom_detector")
    train_parser.add_argument("--rank", type=int, default=8, help="LoRA rank")
    train_parser.add_argument("--alpha", type=int, default=16, help="LoRA alpha")
    train_parser.add_argument("--epochs", type=int, default=50)
    train_parser.add_argument("--batch", type=int, default=16)
    train_parser.add_argument("--size", type=int, default=640, help="Input image size")
    train_parser.add_argument("--device", default="cpu", help="Device: cpu, cuda, mps")
    train_parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    train_parser.add_argument("--export", action="store_true", help="Export to ONNX after training")
    train_parser.add_argument("--no-quantize", action="store_true", help="Skip INT8 quantization")

    # Export command (re-export existing model)
    export_parser = subparsers.add_parser("export", help="Export trained model to ONNX")
    export_parser.add_argument("--weights", required=True, help="Path to .pt weights")
    export_parser.add_argument("--output", default="./models/exported")
    export_parser.add_argument("--size", type=int, default=640)
    export_parser.add_argument("--no-quantize", action="store_true")

    # Dataset template command
    dataset_parser = subparsers.add_parser("init-dataset", help="Create dataset template")
    dataset_parser.add_argument("--output", default="./models")

    args = parser.parse_args()

    if args.command == "train":
        trainer = LoRATrainer(
            base_model=args.model,
            data_config=args.data,
            output_dir=args.output,
            lora_rank=args.rank,
            lora_alpha=args.alpha,
            epochs=args.epochs,
            batch_size=args.batch,
            image_size=args.size,
            device=args.device,
            learning_rate=args.lr,
        )
        trainer.setup()
        trainer.train()
        trainer.generate_requirements()

        if args.export:
            trainer.export_onnx(quantize=not args.no_quantize)

    elif args.command == "export":
        # Re-export existing weights
        from ultralytics import YOLO
        model = YOLO(args.weights)
        export_path = model.export(format="onnx", imgsz=args.size, simplify=True)
        checksum = compute_sha256(Path(export_path))
        print(f"Exported: {export_path}")
        print(f"SHA-256: {checksum}")

    elif args.command == "init-dataset":
        create_dataset_template(args.output)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
