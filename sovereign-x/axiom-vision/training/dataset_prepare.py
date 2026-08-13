"""
Axiom Vision — Dataset Preparation Tool.

Converts common annotation formats to YOLO format for LoRA training.
Supports:
  - COCO JSON → YOLO
  - Pascal VOC XML → YOLO
  - CSV (x,y,w,h,label) → YOLO
  - Directory structure (one folder per class) → YOLO

Usage:
    python -m training.dataset_prepare --from coco --input annotations.json --images ./imgs --output ./dataset
    python -m training.dataset_prepare --from voc --input ./xmls --images ./imgs --output ./dataset
    python -m training.dataset_prepare --from dir --input ./classified_images --output ./dataset
"""

import argparse
import csv
import json
import os
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional


def coco_to_yolo(coco_json: Path, image_dir: Path, output_dir: Path):
    """Convert COCO JSON annotations to YOLO format."""
    with open(coco_json) as f:
        coco = json.load(f)

    # Build category map
    cat_map = {c["id"]: i for i, c in enumerate(coco["categories"])}
    cat_names = {c["id"]: c["name"] for c in coco["categories"]}

    # Build image map
    img_map = {img["id"]: img for img in coco["images"]}

    # Group annotations by image
    anns_by_image = {}
    for ann in coco["annotations"]:
        img_id = ann["image_id"]
        if img_id not in anns_by_image:
            anns_by_image[img_id] = []
        anns_by_image[img_id].append(ann)

    # Convert each annotation
    labels = {}
    for img_id, anns in anns_by_image.items():
        img = img_map[img_id]
        w, h = img["width"], img["height"]
        lines = []

        for ann in anns:
            cat_id = ann["category_id"]
            class_idx = cat_map[cat_id]

            # COCO bbox: [x, y, w, h] (top-left origin)
            x, y, bw, bh = ann["bbox"]

            # Convert to YOLO: [cx, cy, w, h] (normalized, center origin)
            cx = (x + bw / 2) / w
            cy = (y + bh / 2) / h
            nw = bw / w
            nh = bh / h

            lines.append(f"{class_idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

        labels[img["file_name"]] = lines

    # Write output
    write_yolo_dataset(labels, image_dir, output_dir, list(cat_names.values()))


def voc_to_yolo(xml_dir: Path, image_dir: Path, output_dir: Path):
    """Convert Pascal VOC XML annotations to YOLO format."""
    classes = set()
    labels = {}

    for xml_file in xml_dir.glob("*.xml"):
        tree = ET.parse(xml_file)
        root = tree.getroot()

        img_name = root.find("filename").text
        size = root.find("size")
        w = int(size.find("width").text)
        h = int(size.find("height").text)

        lines = []
        for obj in root.findall("object"):
            cls_name = obj.find("name").text
            classes.add(cls_name)

            bbox = obj.find("bndbox")
            xmin = float(bbox.find("xmin").text)
            ymin = float(bbox.find("ymin").text)
            xmax = float(bbox.find("xmax").text)
            ymax = float(bbox.find("ymax").text)

            cx = ((xmin + xmax) / 2) / w
            cy = ((ymin + ymax) / 2) / h
            nw = (xmax - xmin) / w
            nh = (ymax - ymin) / h

            lines.append(f"{cls_name} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

        labels[img_name] = lines

    # Assign class indices
    class_list = sorted(classes)
    class_map = {name: i for i, name in enumerate(class_list)}

    # Replace class names with indices
    for img_name, lines in labels.items():
        new_lines = []
        for line in lines:
            parts = line.split()
            cls_name = parts[0]
            cls_idx = class_map[cls_name]
            new_lines.append(f"{cls_idx} {' '.join(parts[1:])}")
        labels[img_name] = new_lines

    write_yolo_dataset(labels, image_dir, output_dir, class_list)


def dir_to_yolo(input_dir: Path, output_dir: Path):
    """
    Convert directory-based classification to YOLO format.
    Assumes each subfolder is a class containing images.
    Creates full-image bounding boxes (for classification tasks).
    """
    classes = []
    labels = {}

    for cls_dir in sorted(input_dir.iterdir()):
        if not cls_dir.is_dir():
            continue
        classes.append(cls_dir.name)

    class_map = {name: i for i, name in enumerate(sorted(classes))}

    for cls_dir in sorted(input_dir.iterdir()):
        if not cls_dir.is_dir():
            continue
        cls_idx = class_map[cls_dir.name]

        for img_file in cls_dir.iterdir():
            if img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp", ".bmp"]:
                # Full-image bounding box
                labels[img_file.name] = [f"{cls_idx} 0.500000 0.500000 1.000000 1.000000"]

    # Copy images to output
    image_dir = output_dir / "images" / "train"
    image_dir.mkdir(parents=True, exist_ok=True)
    for cls_dir in input_dir.iterdir():
        if cls_dir.is_dir():
            for img_file in cls_dir.iterdir():
                if img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp", ".bmp"]:
                    shutil.copy2(img_file, image_dir / img_file.name)

    write_yolo_labels(labels, output_dir, list(class_map.keys()))

    # Create dataset.yaml
    create_dataset_yaml(output_dir, class_map.keys())


def csv_to_yolo(csv_file: Path, image_dir: Path, output_dir: Path):
    """
    Convert CSV annotations to YOLO format.
    Expected columns: filename, class, x, y, w, h (or xmin, ymin, xmax, ymax)
    """
    labels = {}
    classes = set()

    with open(csv_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            filename = row.get("filename") or row.get("image") or row.get("file")
            cls_name = row.get("class") or row.get("label") or row.get("category")
            classes.add(cls_name)

            if "xmin" in row:
                xmin = float(row["xmin"])
                ymin = float(row["ymin"])
                xmax = float(row["xmax"])
                ymax = float(row["ymax"])
                # Need image dimensions — assume from filename lookup or default
                cx = (xmin + xmax) / 2
                cy = (ymin + ymax) / 2
                w = xmax - xmin
                h = ymax - ymin
                line = f"{cls_name} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"
            else:
                cx = float(row.get("cx", row.get("x", 0)))
                cy = float(row.get("cy", row.get("y", 0)))
                w = float(row.get("w", row.get("width", 0)))
                h = float(row.get("h", row.get("height", 0)))
                line = f"{cls_name} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"

            if filename not in labels:
                labels[filename] = []
            labels[filename].append(line)

    # Assign class indices
    class_list = sorted(classes)
    class_map = {name: i for i, name in enumerate(class_list)}

    for filename, lines in labels.items():
        new_lines = []
        for line in lines:
            parts = line.split()
            cls_name = parts[0]
            cls_idx = class_map[cls_name]
            new_lines.append(f"{cls_idx} {' '.join(parts[1:])}")
        labels[filename] = new_lines

    write_yolo_dataset(labels, image_dir, output_dir, class_list)


def write_yolo_dataset(labels: dict, image_dir: Path, output_dir: Path, class_names: list):
    """Write images and labels in YOLO dataset structure."""
    # Create structure
    for split in ["train", "val"]:
        (output_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Split 80/20
    items = list(labels.keys())
    random.shuffle(items)
    split_idx = int(len(items) * 0.8)

    for i, img_name in enumerate(items):
        split = "train" if i < split_idx else "val"
        label_lines = labels[img_name]

        # Copy image
        src_img = image_dir / img_name
        if src_img.exists():
            shutil.copy2(src_img, output_dir / "images" / split / img_name)
        else:
            print(f"Warning: Image not found: {src_img}")

        # Write label
        label_path = output_dir / "labels" / split / f"{Path(img_name).stem}.txt"
        with open(label_path, "w") as f:
            f.write("\n".join(label_lines))

    # Create dataset.yaml
    create_dataset_yaml(output_dir, class_names)

    print(f"Dataset created: {output_dir}")
    print(f"  Train: {split_idx} images")
    print(f"  Val: {len(items) - split_idx} images")
    print(f"  Classes: {len(class_names)}")


def write_yolo_labels(labels: dict, output_dir: Path, class_names: list):
    """Write only labels (for dir_to_yolo where images are already copied)."""
    label_dir = output_dir / "labels" / "train"
    label_dir.mkdir(parents=True, exist_ok=True)

    for img_name, lines in labels.items():
        label_path = label_dir / f"{Path(img_name).stem}.txt"
        with open(label_path, "w") as f:
            f.write("\n".join(lines))


def create_dataset_yaml(output_dir: Path, class_names):
    """Create YOLO dataset.yaml configuration."""
    yaml_content = f"""# Axiom Vision Dataset Configuration
path: {output_dir.absolute()}
train: images/train
val: images/val
test: images/test

nc: {len(class_names)}
names: {list(class_names)}
"""
    yaml_path = output_dir / "dataset.yaml"
    with open(yaml_path, "w") as f:
        f.write(yaml_content)

    print(f"  Config: {yaml_path}")


def split_dataset(input_dir: Path, output_dir: Path, train_ratio=0.8, val_ratio=0.15):
    """Split existing YOLO dataset into train/val/test."""
    images_dir = input_dir / "images"
    labels_dir = input_dir / "labels"

    if not images_dir.exists():
        print(f"Error: No images directory found in {input_dir}")
        return

    # Get all image files
    images = []
    for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp"]:
        images.extend(images_dir.glob(ext))

    random.shuffle(images)

    n_train = int(len(images) * train_ratio)
    n_val = int(len(images) * val_ratio)

    splits = {
        "train": images[:n_train],
        "val": images[n_train:n_train + n_val],
        "test": images[n_train + n_val:],
    }

    for split_name, split_images in splits.items():
        img_out = output_dir / "images" / split_name
        lbl_out = output_dir / "labels" / split_name
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img_path in split_images:
            shutil.move(str(img_path), str(img_out / img_path.name))

            # Move corresponding label
            lbl_path = labels_dir / f"{img_path.stem}.txt"
            if lbl_path.exists():
                shutil.move(str(lbl_path), str(lbl_out / lbl_path.name))

    print(f"Dataset split complete:")
    for name, imgs in splits.items():
        print(f"  {name}: {len(imgs)} images")


def main():
    parser = argparse.ArgumentParser(description="Axiom Vision Dataset Preparation")
    subparsers = parser.add_subparsers(dest="command")

    # COCO conversion
    coco_parser = subparsers.add_parser("coco", help="Convert COCO JSON to YOLO")
    coco_parser.add_argument("--input", required=True, help="Path to COCO JSON file")
    coco_parser.add_argument("--images", required=True, help="Path to images directory")
    coco_parser.add_argument("--output", required=True, help="Output dataset directory")

    # VOC conversion
    voc_parser = subparsers.add_parser("voc", help="Convert Pascal VOC XML to YOLO")
    voc_parser.add_argument("--input", required=True, help="Path to XML directory")
    voc_parser.add_argument("--images", required=True, help="Path to images directory")
    voc_parser.add_argument("--output", required=True, help="Output dataset directory")

    # Directory conversion
    dir_parser = subparsers.add_parser("dir", help="Convert directory-based to YOLO")
    dir_parser.add_argument("--input", required=True, help="Path to class directories")
    dir_parser.add_argument("--output", required=True, help="Output dataset directory")

    # CSV conversion
    csv_parser = subparsers.add_parser("csv", help="Convert CSV to YOLO")
    csv_parser.add_argument("--input", required=True, help="Path to CSV file")
    csv_parser.add_argument("--images", required=True, help="Path to images directory")
    csv_parser.add_argument("--output", required=True, help="Output dataset directory")

    # Split command
    split_parser = subparsers.add_parser("split", help="Split dataset into train/val/test")
    split_parser.add_argument("--input", required=True, help="Path to existing dataset")
    split_parser.add_argument("--output", required=True, help="Output directory")
    split_parser.add_argument("--train", type=float, default=0.8)
    split_parser.add_argument("--val", type=float, default=0.15)

    args = parser.parse_args()

    if args.command == "coco":
        coco_to_yolo(Path(args.input), Path(args.images), Path(args.output))
    elif args.command == "voc":
        voc_to_yolo(Path(args.input), Path(args.images), Path(args.output))
    elif args.command == "dir":
        dir_to_yolo(Path(args.input), Path(args.output))
    elif args.command == "csv":
        csv_to_yolo(Path(args.input), Path(args.images), Path(args.output))
    elif args.command == "split":
        split_dataset(Path(args.input), Path(args.output), args.train, args.val)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
