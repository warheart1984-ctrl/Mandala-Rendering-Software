#!/usr/bin/env python3
"""Sovereign X Kernel — Live Demo Client.

Usage:
    python demo/sx_demo.py [--prompt "glowing tesseract mandala"]
                           [--url http://localhost:8080]
                           [--save-dir .]
                           [--open]

Submits a prompt to the SX Kernel /api/sx/schedule endpoint, displays
the full constitutional governance trace, and saves the result image.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import webbrowser
from pathlib import Path
from urllib import request as urllib_request
from urllib.error import URLError


BASE_URL = os.getenv("SX_API_URL", "http://localhost:8080")
SAVE_DIR = Path.cwd()


def _api_post(url: str, body: dict, timeout: int = 120) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        print(f"  ERROR  could not reach {url}: {e}")
        sys.exit(1)


def _health_check(base: str) -> dict:
    try:
        req = urllib_request.Request(f"{base}/health")
        with urllib_request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except URLError:
        return {}


def run_demo(prompt: str, base_url: str, save_dir: Path, open_image: bool):
    sx_url = f"{base_url}/api/sx/schedule"

    print()
    print("=" * 58)
    print("  SOVEREIGN X KERNEL -- LIVE CONSTITUTIONAL DEMO")
    print("=" * 58)
    print()

    # -- Health check --
    sys.stdout.write(f"  * Checking server at {base_url} ... ")
    sys.stdout.flush()
    health = _health_check(base_url)
    if health.get("status") == "ok":
        print("online")
        sx_info = health.get("sx_kernel", {})
        if sx_info:
            pi = (
                sx_info.get("governed_throughput", {})
                .get("governed_throughput_tflops_per_second", "?")
            )
            print(f"    SX Kernel:   {sx_info.get('version', '?')}")
            print(f"    CIS:         {', '.join(sx_info.get('cis', []))}")
            print(f"    Pi Throughput: {pi} TFLOP/s")
    else:
        print("OFFLINE")
        print()
        print("  Start the server with:")
        print("    SX_DEMO_MODE=1 uvicorn app.main:app --host 127.0.0.1 --port 8080")
        print()
        return

    # -- Submit prompt --
    print()
    print("  * Submitting prompt ...")
    print(f"    Prompt:  \"{prompt}\"")
    print(f"    Mode:    dispatch=true (full CIS pipeline)")
    print()

    t0 = time.monotonic()
    result = _api_post(sx_url, {"prompt": prompt, "dispatch": True})
    elapsed_wall = time.monotonic() - t0

    # -- Verdict --
    verdict = result.get("verdict", "?")
    print(f"  * Constitutional Verdict: {verdict.upper()}")
    if result.get("error"):
        print(f"    Error: {result['error']}")
    print()

    # -- CIS Pipeline Trace --
    instructions = result.get("instructions", [])
    print("  * CIS Pipeline Trace:")
    for i, instr in enumerate(instructions):
        prefix = "  +--" if i == len(instructions) - 1 else "  |--"
        print(f"    {prefix} {instr}")
    print()

    # -- Governance Metrics --
    throughput = result.get("governed_throughput", {})
    energy = result.get("mandala_energy", {})
    tp_params = throughput.get("params", {})
    pi_basis = throughput.get("basis", "theoretical")
    mel_basis = energy.get("basis", "theoretical")
    print("  * Governance Metrics (theoretical model — not measured hardware):")
    pi_val = throughput.get("governed_throughput_tflops_per_second", 0)
    if isinstance(pi_val, (int, float)):
        print(f"    |-- Pi Governed Throughput:  {pi_val:>12.2f} TFLOP/s [{pi_basis}]")
    else:
        print(f"    |-- Pi Governed Throughput:  {pi_val} [{pi_basis}]")
    mel_val = energy.get("total_lawful_energy", 0)
    if isinstance(mel_val, (int, float)):
        print(f"    |-- MEL Lawful Energy:      {mel_val:>12.2f} kW [{mel_basis}]")
    else:
        print(f"    |-- MEL Lawful Energy:      {mel_val} [{mel_basis}]")
    for label, key in [
        ("Router Latency", "router_latency_ns"),
        ("Governance Overhead", "governance_overhead_ns"),
    ]:
        val = tp_params.get(key, "?")
        if isinstance(val, (int, float)):
            print(f"    |-- {label + ':':27s} {val:>12.2f} ns")
        else:
            print(f"    |-- {label + ':':27s} {val}")
    pe_val = tp_params.get("power_efficiency_tflops_per_w", "?")
    if isinstance(pe_val, (int, float)):
        print(f"    +-- Power Efficiency:        {pe_val:>12.2f}")
    else:
        print(f"    +-- Power Efficiency:        {pe_val}")
    print()

    # -- Timing --
    kernel_ns = result.get("elapsed_ns", 0)
    print("  * Timing:")
    print(f"    |-- Kernel CIS:   {kernel_ns / 1_000_000:.2f} ms ({kernel_ns:.0f} ns)")
    print(f"    +-- Wall-clock:   {elapsed_wall * 1000:.0f} ms")
    print()

    # -- Receipt --
    receipt = result.get("receipt", {})
    if receipt:
        print("  * Audit Receipt:")
        print(f"    |-- UID:         {receipt.get('uid', '?')}")
        print(f"    |-- Authority:   {receipt.get('authority_id', '?')}")
        print(f"    |-- Executed At: {receipt.get('executed_at', '?')}")
        print(f"    +-- Run ID:      {receipt.get('result', {}).get('run_id', '?')}")
    print()

    # -- Image Result --
    exec_result = receipt.get("result", {}) if receipt else {}
    image_b64 = exec_result.get("image_base64")
    preview_url = exec_result.get("preview_url")

    if image_b64:
        print("  * Image Result:")
        header, b64_data = (
            image_b64.split(",", 1) if "," in image_b64 else ("", image_b64)
        )
        img_bytes = base64.b64decode(b64_data)
        ext = "png"
        filename = f"sx_demo_{exec_result.get('run_id', 'result')}.{ext}"
        save_path = save_dir / filename
        save_path.write_bytes(img_bytes)
        print(f"    |-- Saved to:  {save_path}")
        print(f"    |-- Model:     {exec_result.get('model', '?')}")
        print(f"    |-- Provider:  {exec_result.get('provider', '?')}")
        print(f"    |-- Status:    {exec_result.get('status', '?')}")
        print(f"    +-- Size:      {len(img_bytes)} bytes")
        print()

        if open_image:
            webbrowser.open(save_path.as_uri())
            print("  (Opened in browser)")
            print()
    elif preview_url:
        print("  * Image Result:")
        print(f"    +-- Preview URL: {preview_url}")
        print()
    else:
        print("  * No image data (dry run or dispatch=false)")
        print()

    # -- Summary --
    print("=" * 58)
    print(f"  DEMO COMPLETE -- {verdict.upper()} -- {elapsed_wall:.2f}s wall time")
    print("=" * 58)
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Sovereign X Kernel Demo")
    parser.add_argument(
        "--prompt",
        default=(
            "glowing tesseract mandala, 4D hypercube, "
            "sacred geometry, cyan and gold"
        ),
        help="Prompt to render",
    )
    parser.add_argument("--url", default=BASE_URL, help="Server base URL")
    parser.add_argument(
        "--save-dir",
        default=str(SAVE_DIR),
        help="Directory to save result images",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the result image in browser",
    )
    args = parser.parse_args()

    run_demo(
        prompt=args.prompt,
        base_url=args.url.rstrip("/"),
        save_dir=Path(args.save_dir),
        open_image=args.open,
    )
