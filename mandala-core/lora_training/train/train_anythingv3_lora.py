#!/usr/bin/env python3
"""
Train LoRA adapter for AnythingV3 stylized constitutional textures
Constitutional: deterministic, replayable, auditable
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
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
from peft import LoraConfig, get_peft_model, TaskType
from transformers import CLIPTextModel, CLIPTokenizer
from accelerate import Accelerator
from accelerate.utils import ProjectConfiguration, set_seed
import wandb


class StylizedTextureDataset(Dataset):
    def __init__(self, data_path: str, tokenizer, max_length: int = 512):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.samples = []

        with open(data_path, "r", encoding="utf-8") as f:
            for line in f:
                item = json.loads(line.strip())
                self.samples.append(item)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]
        caption = item["caption"]
        replay_token = item["replay_token"]

        tokens = self.tokenizer(
            caption,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )

        return {
            "input_ids": tokens["input_ids"].squeeze(),
            "attention_mask": tokens["attention_mask"].squeeze(),
            "replay_token": replay_token,
            "constitutional": item.get("constitutional", True)
        }


class StylizedConstitutionalLoss:
    def __init__(self, alpha: float = 1.0, beta: float = 0.15, gamma: float = 0.05):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma

    def __call__(self, outputs, labels, replay_tokens):
        base_loss = torch.nn.functional.cross_entropy(outputs, labels)
        token_consistency = self.compute_token_consistency(replay_tokens)
        style_reg = self.style_regularization(outputs)

        total_loss = self.alpha * base_loss + self.beta * token_consistency + self.gamma * style_reg

        return total_loss, base_loss, token_consistency, style_reg

    def compute_token_consistency(self, replay_tokens):
        unique_tokens = len(set(replay_tokens))
        total_tokens = len(replay_tokens)
        consistency = 1.0 - (unique_tokens / total_tokens)
        return torch.tensor(consistency, dtype=torch.float32)

    def style_regularization(self, outputs):
        logits_norm = torch.norm(outputs.logits, p=2, dim=-1).mean()
        return logits_norm


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
            project="mandala-constitutional-lora",
            config=config,
            name=f"anythingv3_lora_{config['training']['seed']}"
        )

    print(f"Loading model: {config['model']['name']}...")
    tokenizer = CLIPTokenizer.from_pretrained(
        config["model"]["name"],
        subfolder="tokenizer"
    )
    text_encoder = CLIPTextModel.from_pretrained(
        config["model"]["name"],
        subfolder="text_encoder",
        torch_dtype=torch.float16
    )

    lora_config = LoraConfig(
        r=config["lora"]["rank"],
        lora_alpha=config["lora"]["alpha"],
        lora_dropout=config["lora"]["dropout"],
        target_modules=config["lora"]["target_modules"],
        bias=config["lora"]["bias"],
        task_type=TaskType.CAUSAL_LM
    )

    text_encoder = get_peft_model(text_encoder, lora_config)
    text_encoder.print_trainable_parameters()

    print("Loading dataset...")
    train_dataset = StylizedTextureDataset(
        config["data"]["train_data"],
        tokenizer,
        config["data"]["max_length"]
    )
    val_dataset = StylizedTextureDataset(
        config["data"]["val_data"],
        tokenizer,
        config["data"]["max_length"]
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
        text_encoder.parameters(),
        lr=config["training"]["learning_rate"],
        betas=(config["training"]["adam_beta1"], config["training"]["adam_beta2"]),
        eps=config["training"]["adam_epsilon"]
    )

    text_encoder, optimizer, train_dataloader, val_dataloader = accelerator.prepare(
        text_encoder, optimizer, train_dataloader, val_dataloader
    )

    stylized_loss = StylizedConstitutionalLoss()

    global_step = 0
    best_val_loss = float("inf")

    print("Starting stylized constitutional training...")
    for epoch in range(config["training"]["num_train_epochs"]):
        text_encoder.train()
        epoch_loss = 0.0

        for batch_idx, batch in enumerate(train_dataloader):
            with accelerator.accumulate(text_encoder):
                outputs = text_encoder(
                    input_ids=batch["input_ids"],
                    attention_mask=batch["attention_mask"]
                )

                loss, base_loss, consistency, style_reg = stylized_loss(
                    outputs.logits,
                    batch["input_ids"],
                    batch["replay_token"]
                )

                accelerator.backward(loss)
                optimizer.step()
                optimizer.zero_grad()

                epoch_loss += loss.item()
                global_step += 1

                if global_step % config["training"]["log_every_n_steps"] == 0:
                    avg_loss = epoch_loss / (batch_idx + 1)
                    print(f"Epoch {epoch} | Step {global_step} | Loss: {avg_loss:.4f} | Base: {base_loss.item():.4f} | Style: {style_reg.item():.4f}")

                    if accelerator.is_main_process:
                        wandb.log({
                            "train/loss": avg_loss,
                            "train/base_loss": base_loss.item(),
                            "train/consistency": consistency.item(),
                            "train/style_reg": style_reg.item(),
                            "train/epoch": epoch,
                            "train/global_step": global_step
                        })

                if global_step % config["training"]["eval_every_n_steps"] == 0:
                    val_loss = evaluate(text_encoder, val_dataloader, stylized_loss, accelerator)
                    print(f"Validation Loss: {val_loss:.4f}")

                    if accelerator.is_main_process:
                        wandb.log({"val/loss": val_loss, "val/global_step": global_step})

                        if val_loss < best_val_loss:
                            best_val_loss = val_loss
                            save_checkpoint(text_encoder, config, global_step, "best")

                if global_step % config["training"]["save_every_n_steps"] == 0:
                    if accelerator.is_main_process:
                        save_checkpoint(text_encoder, config, global_step, f"step_{global_step}")

    if accelerator.is_main_process:
        save_checkpoint(text_encoder, config, global_step, "final")
        wandb.finish()

    print("Stylized constitutional training complete.")


def evaluate(model, dataloader, loss_fn, accelerator):
    model.eval()
    total_loss = 0.0
    num_batches = 0

    with torch.no_grad():
        for batch in dataloader:
            outputs = model(
                input_ids=batch["input_ids"],
                attention_mask=batch["attention_mask"]
            )
            loss, _, _, _ = loss_fn(outputs.logits, batch["input_ids"], batch["replay_token"])
            total_loss += loss.item()
            num_batches += 1

    return total_loss / max(num_batches, 1)


def save_checkpoint(model, config, step, name):
    output_dir = Path(config["training"]["output_dir"]) / name
    output_dir.mkdir(parents=True, exist_ok=True)

    model.save_pretrained(output_dir)

    metadata = {
        "step": step,
        "config": config,
        "constitutional": True,
        "model_type": "anythingv3",
        "replay_token_seed": config["training"]["seed"]
    }

    with open(output_dir / "constitutional_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Checkpoint saved: {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Train AnythingV3 LoRA for stylized constitutional textures")
    parser.add_argument("--config", type=str, required=True, help="Path to config YAML")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    args = parser.parse_args()

    train(args.config, args.resume)


if __name__ == "__main__":
    main()
