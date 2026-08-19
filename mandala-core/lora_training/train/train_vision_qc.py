#!/usr/bin/env python3
"""
Train LoRA adapter for Vision QC constitutional quality control
Detects artifacts: noise, banding, aliasing, flicker, ghosting, blur, exposure
"""

import os
import sys
import json
import yaml
import hashlib
import argparse
from pathlib import Path
from typing import Optional

import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from transformers import ViTForImageClassification, ViTImageProcessor
from peft import LoraConfig, get_peft_model, TaskType
from accelerate import Accelerator
from accelerate.utils import ProjectConfiguration, set_seed
from PIL import Image
import wandb
import numpy as np


class VisionQCDataset(Dataset):
    def __init__(self, data_path: str, processor, image_size: int = 224):
        self.processor = processor
        self.image_size = image_size
        self.samples = []

        with open(data_path, "r", encoding="utf-8") as f:
            for line in f:
                item = json.loads(line.strip())
                self.samples.append(item)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]

        image = Image.new("RGB", (self.image_size, self.image_size), color=(128, 128, 128))

        if "image_path" in item and os.path.exists(item["image_path"]):
            image = Image.open(item["image_path"]).convert("RGB")

        label = item.get("label", 0)

        processed = self.processor(images=image, return_tensors="pt")

        return {
            "pixel_values": processed["pixel_values"].squeeze(),
            "labels": torch.tensor(label, dtype=torch.long),
            "replay_token": item.get("replay_token", "0"),
            "constitutional": item.get("constitutional", True)
        }


class VisionQCConstitutionalLoss:
    def __init__(self, alpha: float = 1.0, beta: float = 0.1):
        self.alpha = alpha
        self.beta = beta

    def __call__(self, logits, labels, replay_tokens):
        base_loss = torch.nn.functional.cross_entropy(logits, labels)
        token_consistency = self.compute_token_consistency(replay_tokens)

        total_loss = self.alpha * base_loss + self.beta * token_consistency

        return total_loss, base_loss, token_consistency

    def compute_token_consistency(self, replay_tokens):
        unique_tokens = len(set(replay_tokens))
        total_tokens = len(replay_tokens)
        consistency = 1.0 - (unique_tokens / total_tokens)
        return torch.tensor(consistency, dtype=torch.float32)


def load_config(config_path: str) -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def train(config_path: str, resume_from: Optional[str] = None):
    config = load_config(config_path)

    project_config = ProjectConfiguration(
        project_dir=config["training"]["output_dir"],
        logging_dir=f"{config['training']['output_dir']}/logs"
    )

    accelerator = Accelerator(
        mixed_precision=config["training"]["mixed_precision"],
        gradient_accumulation_steps=config["training"]["gradient_accumulation_steps"],
        project_config=project_config
    )

    set_seed(config["training"]["seed"])

    if accelerator.is_main_process:
        wandb.init(
            project="mandala-constitutional-vision-qc",
            config=config,
            name=f"vision_qc_lora_{config['training']['seed']}"
        )

    print(f"Loading model: {config['model']['name']}...")
    processor = ViTImageProcessor.from_pretrained(config["model"]["name"])

    model = ViTForImageClassification.from_pretrained(
        config["model"]["name"],
        num_labels=config["model"]["num_labels"],
        label2id=config["model"]["label2id"],
        id2label={v: k for k, v in config["model"]["label2id"].items()},
        ignore_mismatched_sizes=True,
        torch_dtype=torch.float16
    )

    lora_config = LoraConfig(
        r=config["lora"]["rank"],
        lora_alpha=config["lora"]["alpha"],
        lora_dropout=config["lora"]["dropout"],
        target_modules=config["lora"]["target_modules"],
        bias=config["lora"]["bias"],
        task_type=TaskType.SEQ_CLS
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print("Loading dataset...")
    train_dataset = VisionQCDataset(
        config["data"]["train_data"],
        processor,
        config["data"]["image_size"]
    )
    val_dataset = VisionQCDataset(
        config["data"]["val_data"],
        processor,
        config["data"]["image_size"]
    )

    train_dataloader = DataLoader(
        train_dataset,
        batch_size=config["training"]["per_device_train_batch_size"],
        shuffle=True,
        num_workers=config["training"]["dataloader_num_workers"]
    )
    val_dataloader = DataLoader(
        val_dataset,
        batch_size=config["training"]["per_device_train_batch_size"],
        shuffle=False,
        num_workers=config["training"]["dataloader_num_workers"]
    )

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config["training"]["learning_rate"],
        betas=(config["training"]["adam_beta1"], config["training"]["adam_beta2"]),
        eps=config["training"]["adam_epsilon"]
    )

    model, optimizer, train_dataloader, val_dataloader = accelerator.prepare(
        model, optimizer, train_dataloader, val_dataloader
    )

    qc_loss = VisionQCConstitutionalLoss()

    global_step = 0
    best_val_loss = float("inf")

    print("Starting vision QC constitutional training...")
    for epoch in range(config["training"]["num_train_epochs"]):
        model.train()
        epoch_loss = 0.0
        correct = 0
        total = 0

        for batch_idx, batch in enumerate(train_dataloader):
            with accelerator.accumulate(model):
                outputs = model(
                    pixel_values=batch["pixel_values"],
                    labels=batch["labels"]
                )

                loss, base_loss, consistency = qc_loss(
                    outputs.logits,
                    batch["labels"],
                    batch["replay_token"]
                )

                accelerator.backward(loss)
                optimizer.step()
                optimizer.zero_grad()

                preds = torch.argmax(outputs.logits, dim=-1)
                correct += (preds == batch["labels"]).sum().item()
                total += batch["labels"].size(0)

                epoch_loss += loss.item()
                global_step += 1

                if global_step % config["training"]["log_every_n_steps"] == 0:
                    avg_loss = epoch_loss / (batch_idx + 1)
                    accuracy = correct / total
                    print(f"Epoch {epoch} | Step {global_step} | Loss: {avg_loss:.4f} | Acc: {accuracy:.4f}")

                    if accelerator.is_main_process:
                        wandb.log({
                            "train/loss": avg_loss,
                            "train/accuracy": accuracy,
                            "train/base_loss": base_loss.item(),
                            "train/consistency": consistency.item(),
                            "train/epoch": epoch,
                            "train/global_step": global_step
                        })

                if global_step % config["training"]["eval_every_n_steps"] == 0:
                    val_loss, val_acc = evaluate(model, val_dataloader, qc_loss, accelerator)
                    print(f"Validation Loss: {val_loss:.4f} | Acc: {val_acc:.4f}")

                    if accelerator.is_main_process:
                        wandb.log({
                            "val/loss": val_loss,
                            "val/accuracy": val_acc,
                            "val/global_step": global_step
                        })

                        if val_loss < best_val_loss:
                            best_val_loss = val_loss
                            save_checkpoint(model, config, global_step, "best")

                if global_step % config["training"]["save_every_n_steps"] == 0:
                    if accelerator.is_main_process:
                        save_checkpoint(model, config, global_step, f"step_{global_step}")

    if accelerator.is_main_process:
        save_checkpoint(model, config, global_step, "final")
        wandb.finish()

    print("Vision QC constitutional training complete.")


def evaluate(model, dataloader, loss_fn, accelerator):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    num_batches = 0

    with torch.no_grad():
        for batch in dataloader:
            outputs = model(
                pixel_values=batch["pixel_values"],
                labels=batch["labels"]
            )

            loss, _, _ = loss_fn(outputs.logits, batch["labels"], batch["replay_token"])
            total_loss += loss.item()
            num_batches += 1

            preds = torch.argmax(outputs.logits, dim=-1)
            correct += (preds == batch["labels"]).sum().item()
            total += batch["labels"].size(0)

    avg_loss = total_loss / max(num_batches, 1)
    accuracy = correct / total

    return avg_loss, accuracy


def save_checkpoint(model, config, step, name):
    output_dir = Path(config["training"]["output_dir"]) / name
    output_dir.mkdir(parents=True, exist_ok=True)

    model.save_pretrained(output_dir)

    metadata = {
        "step": step,
        "config": config,
        "constitutional": True,
        "model_type": "vision_qc",
        "replay_token_seed": config["training"]["seed"]
    }

    with open(output_dir / "constitutional_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Checkpoint saved: {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Train Vision QC LoRA for constitutional quality control")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    args = parser.parse_args()

    train(args.config, args.resume)


if __name__ == "__main__":
    main()
