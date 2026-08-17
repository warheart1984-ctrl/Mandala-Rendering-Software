#!/usr/bin/env python3
"""
Constitutional LoRA Training — DirectML (AMD GPU)
Standalone script that trains SD Turbo LoRA on RX 580 via DirectML.
No kohya dependency — uses diffusers + PEFT directly.
"""

import os
import json
import hashlib
import math
from pathlib import Path
from typing import List, Dict

import torch
import torch_directml
from torch.utils.data import Dataset, DataLoader
from PIL import Image
from torchvision import transforms
from safetensors.torch import save_file

# ─── Config ──────────────────────────────────────────────────────────
BASE_MODEL = Path(r"E:\Mandala-Rendering-Software\models\sd_turbo.safetensors")
TRAIN_DIR = Path(r"E:\Mandala-Rendering-Software\Anime Pictures for training\kohya_ready")
OUTPUT_DIR = Path(r"E:\Mandala-Rendering-Software\Anime Pictures for training\lora_out\sd_turbo_dml")
CAPTIONS_FILE = Path(r"E:\Mandala-Rendering-Software\mandala-core\lora_training\processed\captions.jsonl")

LORA_RANK = 16
LEARNING_RATE = 1e-4
BATCH_SIZE = 1
NUM_EPOCHS = 10
SAVE_EVERY = 2
IMG_SIZE = 256  # Reduced for 4GB VRAM on RX 580
MAX_STEPS = 3000
SEED = 42


def replay_token(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ─── Dataset ──────────────────────────────────────────────────────────

class LoRADataset(Dataset):
    def __init__(self, train_dir: Path, captions_file: Path, img_size: int = 512):
        self.samples = []
        self.transform = transforms.Compose([
            transforms.Resize(img_size, interpolation=transforms.InterpolationMode.LANCZOS),
            transforms.CenterCrop(img_size),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])

        # Load captions
        captions = {}
        with open(captions_file, "r", encoding="utf-8") as f:
            for line in f:
                entry = json.loads(line.strip())
                captions[entry["image"]] = entry["caption"]

        # Find all images
        for class_dir in sorted(train_dir.iterdir()):
            if not class_dir.is_dir():
                continue
            for img_path in sorted(class_dir.glob("*.png")):
                caption = captions.get(img_path.stem + ".png", "")
                if not caption:
                    # Try reading .txt file
                    txt_path = img_path.with_suffix(".txt")
                    if txt_path.exists():
                        caption = txt_path.read_text(encoding="utf-8").strip()
                if caption:
                    self.samples.append((img_path, caption))

        print(f"Dataset: {len(self.samples)} images with captions")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, caption = self.samples[idx]
        image = Image.open(img_path).convert("RGB")
        pixel_values = self.transform(image)
        return {"pixel_values": pixel_values, "caption": caption}


# ─── LoRA Implementation ─────────────────────────────────────────────

class LoRALinear(torch.nn.Module):
    """Low-Rank Adaptation for Linear layers."""
    def __init__(self, original_linear: torch.nn.Linear, rank: int = 16, alpha: float = 16):
        super().__init__()
        self.original = original_linear
        self.original.weight.requires_grad_(False)

        in_features = original_linear.in_features
        out_features = original_linear.out_features

        self.lora_A = torch.nn.Parameter(torch.randn(in_features, rank) * 0.01)
        self.lora_B = torch.nn.Parameter(torch.zeros(rank, out_features))
        self.scaling = alpha / rank

    def forward(self, x):
        original_out = self.original(x)
        lora_out = (x @ self.lora_A @ self.lora_B) * self.scaling
        return original_out + lora_out


def inject_lora(model, rank=16):
    """Inject LoRA into attention projection layers."""
    lora_modules = []
    count = 0

    for name, module in model.named_modules():
        if hasattr(module, "to_q") and isinstance(module.to_q, torch.nn.Linear):
            module.to_q = LoRALinear(module.to_q, rank)
            lora_modules.append(module.to_q)
            count += 1
        if hasattr(module, "to_k") and isinstance(module.to_k, torch.nn.Linear):
            module.to_k = LoRALinear(module.to_k, rank)
            lora_modules.append(module.to_k)
            count += 1
        if hasattr(module, "to_v") and isinstance(module.to_v, torch.nn.Linear):
            module.to_v = LoRALinear(module.to_v, rank)
            lora_modules.append(module.to_v)
            count += 1
        if hasattr(module, "to_out") and hasattr(module.to_out, "0"):
            if isinstance(module.to_out[0], torch.nn.Linear):
                module.to_out[0] = LoRALinear(module.to_out[0], rank)
                lora_modules.append(module.to_out[0])
                count += 1

    print(f"Injected LoRA into {count} layers (rank={rank})")
    return lora_modules


# ─── Training ─────────────────────────────────────────────────────────

def train():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    device = torch_directml.device()
    print(f"Device: {torch_directml.device_name(0)}")
    print(f"PyTorch: {torch.__version__}")
    print(f"Base model: {BASE_MODEL}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    # Load model
    print("Loading SD Turbo...")
    from diffusers import StableDiffusionPipeline

    CONFIG_DIR = Path(r"E:\Mandala-Rendering-Software\models\sd_turbo_diffusers")

    pipe = StableDiffusionPipeline.from_single_file(
        str(BASE_MODEL),
        torch_dtype=torch.float16,
        load_safety_checker=False,
        config=str(CONFIG_DIR),
    )
    pipe.to(device)

    # Freeze everything, inject LoRA
    pipe.unet.requires_grad_(False)
    pipe.vae.requires_grad_(False)
    pipe.text_encoder.requires_grad_(False)

    lora_params = inject_lora(pipe.unet, rank=LORA_RANK)
    trainable = []
    for mod in lora_params:
        for p in mod.parameters():
            if p.requires_grad:
                trainable.append(p)

    trainable_count = sum(p.numel() for p in trainable)
    print(f"Trainable params: {trainable_count:,}")

    optimizer = torch.optim.AdamW(trainable, lr=LEARNING_RATE, weight_decay=0.01)

    # Dataset
    dataset = LoRADataset(TRAIN_DIR, CAPTIONS_FILE, IMG_SIZE)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)

    # Training loop
    print(f"\nTraining: {NUM_EPOCHS} epochs, max {MAX_STEPS} steps")
    print("=" * 60)

    global_step = 0
    epoch_losses = []

    for epoch in range(NUM_EPOCHS):
        epoch_loss = 0.0
        epoch_steps = 0

        for batch in dataloader:
            if global_step >= MAX_STEPS:
                break

            pixel_values = batch["pixel_values"].to(device)

            # Encode to latent space
            with torch.no_grad():
                latents = pipe.vae.encode(pixel_values.half()).latent_dist.sample()
                latents = (latents * 0.18215).to(dtype=torch.float32)

            # Random noise
            noise = torch.randn_like(latents)
            timesteps = torch.randint(0, 1000, (latents.shape[0],), device=device, dtype=torch.long)

            # Add noise
            noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)

            # Text encoding
            with torch.no_grad():
                tokens = pipe.tokenizer(
                    batch["caption"],
                    return_tensors="pt",
                    padding=True,
                    truncation=True,
                    max_length=77
                ).input_ids.to(device)
                encoder_hidden_states = pipe.text_encoder(tokens).last_hidden_state

            # Predict noise
            noise_pred = pipe.unet(
                noisy_latents,
                timesteps,
                encoder_hidden_states=encoder_hidden_states,
            ).sample

            # MSE loss
            loss = torch.nn.functional.mse_loss(noise_pred, noise)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()

            epoch_loss += loss.item()
            epoch_steps += 1
            global_step += 1

            if global_step % 50 == 0:
                print(f"  Step {global_step}/{MAX_STEPS} | Loss: {loss.item():.6f}")

        if epoch_steps > 0:
            avg_loss = epoch_loss / epoch_steps
            epoch_losses.append(avg_loss)
            print(f"Epoch {epoch+1}/{NUM_EPOCHS} | Avg Loss: {avg_loss:.6f} | Steps: {epoch_steps}")

        # Save checkpoint
        if (epoch + 1) % SAVE_EVERY == 0 or epoch == NUM_EPOCHS - 1:
            ckpt_path = OUTPUT_DIR / f"lora_epoch{epoch+1}.safetensors"
            state = {}
            for mod in lora_params:
                for name, param in mod.named_parameters():
                    if param.requires_grad:
                        state[f"lora.{name}"] = param.data.cpu()
            save_file(state, str(ckpt_path))
            print(f"  Saved: {ckpt_path}")

    # Save final
    final_path = OUTPUT_DIR / "mandala_lora_final.safetensors"
    state = {}
    for mod in lora_params:
        for name, param in mod.named_parameters():
            if param.requires_grad:
                state[f"lora.{name}"] = param.data.cpu()
    save_file(state, str(final_path))
    print(f"\nFinal LoRA: {final_path}")
    print(f"Trainable params: {trainable_count:,}")
    print(f"Total steps: {global_step}")

    # Save training metadata
    meta = {
        "base_model": str(BASE_MODEL),
        "lora_rank": LORA_RANK,
        "learning_rate": LEARNING_RATE,
        "epochs": NUM_EPOCHS,
        "total_steps": global_step,
        "dataset_size": len(dataset),
        "device": torch_directml.device_name(0),
        "trainable_params": trainable_count,
        "final_loss": epoch_losses[-1] if epoch_losses else None,
        "constitutional": True,
    }
    meta_path = OUTPUT_DIR / "training_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Metadata: {meta_path}")


if __name__ == "__main__":
    train()
