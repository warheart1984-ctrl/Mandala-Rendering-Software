"""
Axiom Vision — Training Module.

LoRA fine-tuning pipeline for custom object detection models.
Produces ONNX models with constitutional evidence for the L3 detection bridge.
"""

from .lora_trainer import LoRATrainer, SUPPORTED_MODELS, LORA_CONFIGS, compute_sha256
from .dataset_prepare import (
    coco_to_yolo,
    voc_to_yolo,
    dir_to_yolo,
    csv_to_yolo,
    create_dataset_yaml,
)

__all__ = [
    "LoRATrainer",
    "SUPPORTED_MODELS",
    "LORA_CONFIGS",
    "compute_sha256",
    "coco_to_yolo",
    "voc_to_yolo",
    "dir_to_yolo",
    "csv_to_yolo",
    "create_dataset_yaml",
]
