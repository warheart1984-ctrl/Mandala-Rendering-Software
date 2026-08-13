# Axiom Vision — LoRA Object Detection Training

Fine-tune YOLO models on custom data using LoRA (Low-Rank Adaptation), then export to ONNX for the L3 detection bridge.

## Quick Start

### 1. Install dependencies

```bash
pip install ultralytics onnxruntime onnx torch torchvision numpy Pillow PyYAML
```

### 2. Prepare dataset

From COCO JSON:
```bash
python -m training.dataset_prepare coco \
    --input annotations.json \
    --images ./raw_images \
    --output ./dataset
```

From Pascal VOC XML:
```bash
python -m training.dataset_prepare voc \
    --input ./xml_annotations \
    --images ./raw_images \
    --output ./dataset
```

From directory structure (one folder per class):
```bash
python -m training.dataset_prepare dir \
    --input ./classified_images \
    --output ./dataset
```

Or create a template:
```bash
python -m training.lora_trainer init-dataset --output ./models
```

### 3. Train with LoRA

```bash
python -m training.lora_trainer train \
    --data ./dataset/dataset.yaml \
    --model yolov8n \
    --output ./models/my_detector \
    --rank 8 \
    --alpha 16 \
    --epochs 50 \
    --batch 16 \
    --device cpu \
    --export
```

### 4. Use the trained model

The export produces:
- `models/my_detector/onnx/yolov8n_lora.onnx` — the model
- `models/my_detector/onnx/yolov8n_lora.evidence.json` — constitutional evidence

Load in JS:
```js
import { ONNXDetectionProvider } from "axiom-vision";

const provider = new ONNXDetectionProvider({
  modelPath: "./models/my_detector/onnx/yolov8n_lora.onnx",
  modelEvidence: {
    model_name: "yolov8n-lora",
    model_version: "1.0.0",
    checksum_sha256: "a1b2c3...",
    quantization: "INT8",
    parameter_count: 3_100_000,
    input_shape: [1, 3, 640, 640],
    training_method: "lora",
    lora_rank: "8",
    base_model: "yolov8n",
  },
  classNames: ["person", "vehicle", "object"],
});
```

## Supported Base Models

| Model | Params | Size | Best For |
|-------|--------|------|----------|
| yolov8n | 3.1M | 6MB | Edge, real-time |
| yolov8s | 11.2M | 22MB | Balanced |
| yolov8m | 25.9M | 50MB | Accuracy |
| yolov9t | 2.1M | 4MB | Ultra-light |
| yolov11n | 2.6M | 5MB | Latest nano |

## LoRA Configuration

| Model Size | Rank | Alpha | Target Modules |
|-----------|------|-------|----------------|
| nano | 4 | 8 | model.22.cv2, model.22.cv3 |
| small | 8 | 16 | model.22.cv2, model.22.cv3 |
| medium | 16 | 32 | model.22.cv2, model.22.cv3 |

LoRA reduces trainable parameters by ~95% while retaining most of the fine-tuning benefit.

## Dataset Format (YOLO)

```
dataset/
├── dataset.yaml
├── images/
│   ├── train/
│   │   ├── img001.jpg
│   │   └── ...
│   └── val/
│       ├── img100.jpg
│       └── ...
└── labels/
    ├── train/
    │   ├── img001.txt
    │   └── ...
    └── val/
        ├── img100.txt
        └── ...
```

Each `.txt` file contains one line per object:
```
<class_id> <center_x> <center_y> <width> <height>
```
All values normalized to [0, 1].

## Constitutional Evidence

Every exported model includes a `.evidence.json` file with:
- Model checksum (SHA-256)
- Training method (LoRA rank, alpha, epochs)
- Base model provenance
- Quantization info
- Input shape

This evidence is attached to every L3 detection, creating an unbroken chain from pixels → detections → evidence.
