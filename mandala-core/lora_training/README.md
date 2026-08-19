# Sovereign LoRA Training Pipeline

LoRA fine-tuning for SD Turbo GGUF, AnythingV3, and Vision QC models.
All outputs are constitutional: replayable, auditable, injectable into Mandala rendergraph.

## Models
- **SD Turbo LoRA**: Constitutional procedural textures
- **AnythingV3 LoRA**: Anime/stylized constitutional textures
- **Vision QC LoRA**: Artifact detection + quality control

## Quick Start
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Prepare training data
python data/prepare_shader_library.py
python data/prepare_texture_library.py
python data/caption_generator.py

# 3. Train models
python train/train_sd_turbo_lora.py --config configs/sd_turbo_lora.yaml
python train/train_anythingv3_lora.py --config configs/anythingv3_lora.yaml
python train/train_vision_qc.py --config configs/vision_qc.yaml

# 4. Generate textures
python inference/generate_texture.py --prompt "frosted glass microflake" --model sd_turbo

# 5. Quality control
python inference/quality_control.py --image output.png --model vision_qc

# 6. Export
python export/merge_lora.py --base sd_turbo --adapter checkpoints/sd_turbo_lora
python export/export_gguf.py --model merged_sd_turbo --output sd_turbo_constitutional.gguf
```

## Constitutional Rules
- All generated textures must pass RT4D validation
- Replay tokens embedded in metadata
- GPU assist-only: generation is evidence, CPU validates
- Byte-identical output across runs with same seed

## Directory Structure
```
lora_training/
├── configs/           # YAML configs for training
├── data/              # Data preparation scripts
├── train/             # Training scripts
├── inference/         # Generation + quality control
├── export/            # Merge + GGUF export
└── scripts/           # Utility scripts
```
