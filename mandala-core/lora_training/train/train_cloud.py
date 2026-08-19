#!/usr/bin/env python3
"""
Cloud LoRA Training Script
Run on RunPod/Vast.ai/Colab with any CUDA GPU.

Usage:
  RunPod:  pip install diffusers transformers safetensors accelerate peft && python train_cloud.py
  Vast.ai: Same
  Colab:   Same + upload training data to /content/training_data/

Supports: CUDA GPUs (RTX 3090, A100, T4, etc.)
Falls back to CPU if no GPU found.
"""

import os
import json
import hashlib
import sys
from pathlib import Path
from datetime import datetime

# ─── Auto-detect environment ───
IS_COLAB = os.path.exists("/content")
IS_RUNPOD = os.path.exists("/workspace")
IS_VAST = os.path.exists("/root")

if IS_COLAB:
    BASE_DIR = Path("/content")
    DATA_DIR = BASE_DIR / "training_data"
    OUTPUT_DIR = BASE_DIR / "lora_output"
    MODEL_CACHE = BASE_DIR / "model_cache"
elif IS_RUNPOD or IS_VAST:
    BASE_DIR = Path("/workspace")
    DATA_DIR = BASE_DIR / "training_data"
    OUTPUT_DIR = BASE_DIR / "lora_output"
    MODEL_CACHE = BASE_DIR / "model_cache"
else:
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "Anime Pictures for training" / "kohya_ready"
    OUTPUT_DIR = BASE_DIR / "Anime Pictures for training" / "lora_out" / "cloud"
    MODEL_CACHE = BASE_DIR / "models"

# ─── Config ───
MODEL_ID = "stable-diffusion-v1-5/stable-diffusion-v1-5"  # SD 1.5 base (SD Turbo is fine-tuned from this)
LORA_RANK = 16
LEARNING_RATE = 1e-4
BATCH_SIZE = 2       # Can go higher on cloud GPUs
NUM_EPOCHS = 10
SAVE_EVERY = 2
IMG_SIZE = 512       # Full resolution on cloud GPU
MAX_STEPS = 5000
GRAD_ACCUM_STEPS = 2  # Effective batch size = BATCH_SIZE * GRAD_ACCUM_STEPS
SEED = 42
MIXED_PRECISION = "fp16"  # fp16 for CUDA, no for CPU


def detect_device():
    """Auto-detect best available device."""
    import torch
    if torch.cuda.is_available():
        device = torch.device("cuda")
        name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_mem / 1e9
        print(f"[GPU] {name} — {vram:.1f} GB VRAM")
        precision = "fp16"
    else:
        device = torch.device("cpu")
        name = "CPU"
        vram = 0
        print("[CPU] No GPU found — training will be slow")
        precision = "no"
    return device, name, vram, precision


def install_deps():
    """Install required packages."""
    import subprocess
    pkgs = ["diffusers>=0.25", "transformers>=4.36", "safetensors", "accelerate", "peft", "torchvision"]
    for pkg in pkgs:
        try:
            __import__(pkg.split(">=")[0].split("==")[0].replace("-", "_"))
        except ImportError:
            print(f"Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])


def main():
    print("=" * 60)
    print("  Constitutional LoRA Training — Cloud GPU")
    print("=" * 60)
    print(f"  Time: {datetime.now().isoformat()}")
    print(f"  Environment: {'Colab' if IS_COLAB else 'RunPod' if IS_RUNPOD else 'Vast.ai' if IS_VAST else 'Local'}")
    print()

    install_deps()

    import torch
    from torch.utils.data import Dataset, DataLoader
    from PIL import Image
    from torchvision import transforms
    from safetensors.torch import save_file

    device, device_name, vram, mixed_precision = detect_device()
    print()

    # ─── Load model ───
    from diffusers import StableDiffusionPipeline, DDPMScheduler

    print("Loading SD Turbo...")
    pipe = StableDiffusionPipeline.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5",
        torch_dtype=torch.float16 if device.type == "cuda" else torch.float32,
        safety_checker=None,
        cache_dir=str(MODEL_CACHE),
    )

    # Override scheduler with DDPM for training
    pipe.scheduler = DDPMScheduler.from_config(pipe.scheduler.config)

    pipe.to(device)
    print(f"Model loaded on {device}")

    # ─── Freeze + inject LoRA ───
    pipe.unet.requires_grad_(False)
    pipe.vae.requires_grad_(False)
    pipe.text_encoder.requires_grad_(False)

    from peft import LoraConfig, get_peft_model

    lora_config = LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_RANK,
        target_modules=["to_q", "to_k", "to_v", "to_out.0"],
        lora_dropout=0.05,
        bias="none",
    )
    pipe.unet = get_peft_model(pipe.unet, lora_config)
    pipe.unet.print_trainable_parameters()

    trainable = [p for p in pipe.unet.parameters() if p.requires_grad]
    trainable_count = sum(p.numel() for p in trainable)
    print(f"Trainable: {trainable_count:,} params")

    optimizer = torch.optim.AdamW(trainable, lr=LEARNING_RATE, weight_decay=0.01)

    # ─── Dataset ───
    class CloudDataset(Dataset):
        def __init__(self, data_dir, img_size):
            self.samples = []
            self.transform = transforms.Compose([
                transforms.Resize(img_size, interpolation=transforms.InterpolationMode.LANCZOS),
                transforms.CenterCrop(img_size),
                transforms.ToTensor(),
                transforms.Normalize([0.5], [0.5]),
            ])
            for class_dir in sorted(Path(data_dir).iterdir()):
                if not class_dir.is_dir():
                    continue
                for img_path in sorted(class_dir.glob("*.png")):
                    txt_path = img_path.with_suffix(".txt")
                    caption = txt_path.read_text(encoding="utf-8").strip() if txt_path.exists() else ""
                    if caption:
                        self.samples.append((img_path, caption))
            print(f"Dataset: {len(self.samples)} images")

        def __len__(self):
            return len(self.samples)

        def __getitem__(self, idx):
            img_path, caption = self.samples[idx]
            image = Image.open(img_path).convert("RGB")
            return {"pixel_values": self.transform(image), "caption": caption}

    if not DATA_DIR.exists():
        print(f"ERROR: Data dir not found: {DATA_DIR}")
        print("Upload training data to this path and retry.")
        sys.exit(1)

    dataset = CloudDataset(DATA_DIR, IMG_SIZE)
    if len(dataset) == 0:
        print("ERROR: No images with captions found")
        sys.exit(1)

    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True)

    # ─── Training ───
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nTraining: {NUM_EPOCHS} epochs, max {MAX_STEPS} steps")
    print(f"Batch: {BATCH_SIZE} x {GRAD_ACCUM_STEPS} grad accum = effective {BATCH_SIZE * GRAD_ACCUM_STEPS}")
    print("=" * 60)

    global_step = 0
    epoch_losses = []
    scaler = torch.amp.GradScaler("cuda") if device.type == "cuda" else None

    for epoch in range(NUM_EPOCHS):
        epoch_loss = 0.0
        epoch_steps = 0
        optimizer.zero_grad()

        for batch_idx, batch in enumerate(dataloader):
            if global_step >= MAX_STEPS:
                break

            pixel_values = batch["pixel_values"].to(device)

            with torch.no_grad():
                latents = pipe.vae.encode(pixel_values).latent_dist.sample()
                latents = latents * 0.18215

            noise = torch.randn_like(latents)
            timesteps = torch.randint(0, 1000, (latents.shape[0],), device=device, dtype=torch.long)
            noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)

            with torch.no_grad():
                tokens = pipe.tokenizer(
                    batch["caption"], return_tensors="pt",
                    padding=True, truncation=True, max_length=77
                ).input_ids.to(device)
                encoder_hidden_states = pipe.text_encoder(tokens).last_hidden_state

            with torch.amp.autocast("cuda", enabled=device.type == "cuda"):
                noise_pred = pipe.unet(
                    noisy_latents, timesteps,
                    encoder_hidden_states=encoder_hidden_states,
                ).sample
                loss = torch.nn.functional.mse_loss(noise_pred, noise) / GRAD_ACCUM_STEPS

            if scaler:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            if (batch_idx + 1) % GRAD_ACCUM_STEPS == 0:
                if scaler:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(trainable, 1.0)
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    torch.nn.utils.clip_grad_norm_(trainable, 1.0)
                    optimizer.step()
                optimizer.zero_grad()

            epoch_loss += loss.item() * GRAD_ACCUM_STEPS
            epoch_steps += 1
            global_step += 1

            if global_step % 50 == 0:
                print(f"  Step {global_step}/{MAX_STEPS} | Loss: {loss.item() * GRAD_ACCUM_STEPS:.6f}")

        if epoch_steps > 0:
            avg_loss = epoch_loss / epoch_steps
            epoch_losses.append(avg_loss)
            print(f"Epoch {epoch+1}/{NUM_EPOCHS} | Avg Loss: {avg_loss:.6f} | Steps: {epoch_steps}")

        if (epoch + 1) % SAVE_EVERY == 0 or epoch == NUM_EPOCHS - 1:
            ckpt_path = OUTPUT_DIR / f"lora_epoch{epoch+1}.safetensors"
            pipe.unet.save_pretrained(str(ckpt_path.parent / f"epoch{epoch+1}"))
            print(f"  Saved checkpoint: {ckpt_path}")

    # Save final
    final_dir = OUTPUT_DIR / "final_lora"
    pipe.unet.save_pretrained(str(final_dir))

    meta = {
        "base_model": "stable-diffusion-v1-5",
        "lora_rank": LORA_RANK,
        "learning_rate": LEARNING_RATE,
        "epochs": NUM_EPOCHS,
        "total_steps": global_step,
        "dataset_size": len(dataset),
        "device": device_name,
        "vram_gb": vram,
        "trainable_params": trainable_count,
        "final_loss": epoch_losses[-1] if epoch_losses else None,
        "constitutional": True,
        "environment": "cloud",
    }
    meta_path = OUTPUT_DIR / "training_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))

    print(f"\nFinal LoRA saved: {final_dir}")
    print(f"Metadata: {meta_path}")
    print(f"Total steps: {global_step}, Final loss: {epoch_losses[-1]:.6f}" if epoch_losses else "No epochs completed")


if __name__ == "__main__":
    main()
