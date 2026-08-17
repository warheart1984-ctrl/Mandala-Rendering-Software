#!/usr/bin/env python3
"""
Test constitutional replay across Bradley's Node.js renderer and Rust rayon renderer
Verifies byte-identical output for same seed
"""

import json
import hashlib
import subprocess
import time
from pathlib import Path


def run_bradley_renderer(prompt, width, height, samples, seed, output_dir):
    cmd = [
        "node",
        "scripts/render-still-mt.mjs",
        "--prompt", prompt,
        "--width", str(width),
        "--height", str(height),
        "--samples", str(samples),
        "--seed", str(seed),
        "--output", str(Path(output_dir) / f"bradley_{seed}.png"),
        "--provenance", str(Path(output_dir) / f"bradley_{seed}.json")
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Bradley renderer failed: {result.stderr}")
        return None

    return json.loads(result.stdout)


def run_rayon_renderer(prompt, width, height, samples, seed, output_dir):
    cmd = [
        "cargo",
        "run",
        "--release",
        "--bin",
        "rayon_render",
        "--",
        "--prompt", prompt,
        "--width", str(width),
        "--height", str(height),
        "--samples", str(samples),
        "--seed", str(seed),
        "--output", str(Path(output_dir) / f"rayon_{seed}.png")
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Rayon renderer failed: {result.stderr}")
        return None

    return json.loads(result.stdout)


def compute_sha256(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def main():
    print("=" * 60)
    print("Constitutional Replay Verification")
    print("=" * 60)

    prompt = "cyan tesseract lattice"
    width = 640
    height = 480
    samples = 8
    seed = 42
    output_dir = Path("constitutional_test_output")
    output_dir.mkdir(exist_ok=True)

    print(f"\nTest Configuration:")
    print(f"  Prompt: {prompt}")
    print(f"  Size: {width}x{height}")
    print(f"  Samples: {samples}")
    print(f"  Seed: {seed}")

    print("\n1. Running Bradley's Node.js renderer...")
    bradley_result = run_bradley_renderer(prompt, width, height, samples, seed, output_dir)
    if bradley_result:
        print(f"   Bradley: {bradley_result['elapsed_ms']:.1f}ms, SHA256: {bradley_result['sha256'][:16]}...")

    print("\n2. Running Rust Rayon renderer...")
    rayon_result = run_rayon_renderer(prompt, width, height, samples, seed, output_dir)
    if rayon_result:
        print(f"   Rayon: {rayon_result['elapsed_ms']:.1f}ms, SHA256: {rayon_result['sha256'][:16]}...")

    print("\n3. Verifying constitutional replay...")
    bradley_file = output_dir / f"bradley_{seed}.png"
    rayon_file = output_dir / f"rayon_{seed}.png"

    if bradley_file.exists() and rayon_file.exists():
        bradley_sha = compute_sha256(bradley_file)
        rayon_sha = compute_sha256(rayon_file)

        print(f"   Bradley SHA256: {bradley_sha[:32]}...")
        print(f"   Rayon SHA256:   {rayon_sha[:32]}...")

        if bradley_sha == rayon_sha:
            print("\n   ✓ CONSTITUTIONAL REPLAY VERIFIED: Byte-identical output")
        else:
            print("\n   ✗ CONSTITUTIONAL REPLAY FAILED: Output differs")
            print("   Note: Different RNG streams may produce different noise patterns")
            print("         but the same seed should produce the same scene geometry")

    print("\n4. Testing deterministic replay (same seed, different runs)...")
    bradley_result2 = run_bradley_renderer(prompt, width, height, samples, seed, output_dir)
    if bradley_result and bradley_result2:
        if bradley_result['sha256'] == bradley_result2['sha256']:
            print("   ✓ Bradley: Deterministic replay verified")
        else:
            print("   ✗ Bradley: Non-deterministic output detected")

    print("\n" + "=" * 60)
    print("Constitutional replay verification complete")
    print("=" * 60)


if __name__ == "__main__":
    main()
