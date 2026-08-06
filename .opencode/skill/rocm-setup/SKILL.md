---
name: rocm-setup
description: >
  Instalación y verificación de ROCm en GPUs AMD (MI300X, MI250, MI100, RX 7900,
  RX 9070) con detección automática de NVIDIA CUDA y fallback a CPU. Configura
  drivers y variables de entorno (HIP_VISIBLE_DEVICES, HSA_OVERRIDE_GFX_VERSION,
  ROCR_VISIBLE_DEVICES), verifica torch.cuda.is_available() para ROCm y CUDA, y
  ejecuta smoke tests con rocm-smi y rocminfo. Actívalo al instalar ROCm en
  servidores AMD para AI/ML, configurar GPUs multi-backend, detectar hardware
  AMD/NVIDIA, validar gfx942/gfx90a, verificar torch.cuda con HIP, o preparar
  PyTorch multi-GPU. Keywords: rocm, amd, gpu, pytorch, hip, setup, mi300x,
  detect-gpu, rocm-smi, rocminfo, cuda, check-rocm
license: Apache-2.0
metadata:
  version: "1.1.0"
  author: "yechua-silva"
  tags:
    - amd
    - rocm
    - gpu
    - setup
    - multi-gpu
    - detect
    - pytorch
    - hip
compatibility: >
  Compatible with Claude Code, OpenCode, Codex, Cursor, Cline, Roo Code,
  Windsurf, Gemini CLI, and Kiro CLI. Requires Linux Ubuntu 22.04/24.04
  with AMD or NVIDIA GPU and root access for driver installation.
---

# ROCm Setup Skill

## Purpose

This skill installs, verifies, and configures the AMD ROCm software stack on
Linux hosts for AI/ML workloads with PyTorch. It handles GPU detection across
AMD (ROCm) and NVIDIA (CUDA) backends, driver verification, environment
configuration, and smoke tests.  Falls back gracefully to CPU when no GPU is
available.

Use this skill whenever you need to prepare a server for GPU-accelerated
PyTorch, verify that an existing ROCm installation is healthy, or diagnose
why PyTorch is not detecting an AMD GPU.

## When to Use

The agent activates automatically when it detects keywords like:
- "Set up this AMD server for GPU workloads"
- "Install ROCm on Ubuntu 22.04"
- "Configure Docker for AMD GPU passthrough"
- "Verify my AMD MI300X is working"
- "Check if ROCm is properly installed"
- "Detect GPU and configure PyTorch"
- Keywords: rocm, amd, gpu, mi300x, mi250, mi350, rocm-smi, rocminfo,
  torch.cuda, hip, hip_visible_devices, rocr_visible_devices

Also activates for NVIDIA detection and CPU fallback scenarios.

## Prerequisites

- **Host**: Linux Ubuntu 22.04 or 24.04 (other distros may work but are not tested)
- **Access**: Root / sudo access for driver installation; at minimum a user
  in the `video` and `render` groups
- **Network**: Internet connection for package downloads
- **GPU** (optional): AMD GPU (MI300X, MI250, MI100, RX 7900, RX 9070 series)
  or NVIDIA GPU (any CUDA-capable card).  The skill works without a GPU (CPU fallback).

## Quickstart

### 1. Run the Detection Script

```bash
python3 scripts/detect-gpu.py
```

This detects your GPU backend (ROCm, CUDA, or CPU) and prints a summary.

### 2. Run the Health Check

```bash
bash scripts/check-rocm.sh
```

Verifies GPU detection, ROCm installation, PyTorch ROCm, environment
variables, and user groups. Exit code 0 = all good, 1 = warnings, 2 = errors.

### 3. Verify PyTorch GPU Access

```bash
python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device count: {torch.cuda.device_count()}'); print(f'Device name: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
```

## Step-by-Step Instructions

### 1. Detect GPU Backend

Run the Python detection script to identify your GPU backend:

```bash
python3 scripts/detect-gpu.py
```

The script scans in three levels:
1. **PyTorch** — checks `torch.cuda.is_available()` and reads `torch.version.hip`
   (ROCm) or `torch.version.cuda` (CUDA).  There is no `torch.rocm`; ROCm uses
   the standard `torch.cuda` API.
2. **System commands** — tries `nvidia-smi` for NVIDIA GPUs or `rocm-smi` /
   `rocminfo` for AMD GPUs.
3. **CPU fallback** — if neither PyTorch nor system commands detect a GPU,
   reports CPU-only mode.

**Example output (AMD ROCm):**
```
============================================================
  GPU Detection Report
============================================================
  Estado:    ✅ GPU DETECTADA
  Backend:   ROCM
  Device:    AMD Instinct MI300X
  Devices:   8
  Driver:    7.2.0
  Torch:     2.4.0+rocm6.1
  Torch CUDA: True
  HIP ver:   6.1.0
  GFX arch:  gfx942
============================================================
```

**Example output (CPU only):**
```
============================================================
  GPU Detection Report
============================================================
  Estado:    ⚠️  SOLO CPU
  Backend:   CPU
  Device:    N/A
  Devices:   0
  Torch:     2.4.0
  Torch CUDA: False
============================================================
```

### 2. Verify ROCm Installation

Check that ROCm is installed and working:

```bash
# Check installed ROCm packages
dpkg -l | grep rocm

# Verify AMD GPU is visible to the ROCm stack
sudo rocminfo | grep -E "Name:|gfx"

# Show GPU product name and metrics
rocm-smi --showproductname
rocm-smi --showmeminfo vram
```

If `rocminfo` or `rocm-smi` are not found, ROCm is not installed. Proceed to
step 3.

### 3. Install ROCm (if missing)

Install ROCm on Ubuntu 22.04 (Jammy) or 24.04 (Noble):

```bash
# Determine your Ubuntu version
UBUNTU_CODENAME=$(lsb_release -cs)

# Download the amdgpu-install package for your distro
wget https://repo.radeon.com/amdgpu-install/latest/ubuntu/${UBUNTU_CODENAME}/amdgpu-install_*.deb

# Install the repository package
sudo apt install ./amdgpu-install_*.deb

# Update package lists
sudo apt update

# Install ROCm (without DKMS if kernel modules are already present)
sudo amdgpu-install --usecase=rocm --no-dkms

# Add your user to the necessary groups
sudo usermod -a -G video,render $USER
```

> **Note**: Log out and back in after adding groups, or use `newgrp render`
> in the current shell.

### 4. Verify PyTorch ROCm Support

PyTorch with ROCm support must be installed from the AMD index — the default
`pip install torch` may pull a CUDA-only wheel.

```bash
# Install PyTorch with ROCm (match ROCm version, e.g. rocm6.2 for ROCm 7.2.x)
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/rocm6.2

# Verify ROCm support
python3 -c "
import torch
print(f'PyTorch version: {torch.__version__}')
print(f'CUDA available:  {torch.cuda.is_available()}')
print(f'HIP version:     {torch.version.hip}')
print(f'Device count:    {torch.cuda.device_count()}')
if torch.cuda.is_available():
    for i in range(torch.cuda.device_count()):
        print(f'  [{i}] {torch.cuda.get_device_name(i)}')
"
```

Expected output when ROCm is working:
```
PyTorch version: 2.4.0+rocm6.2
CUDA available:  True
HIP version:     6.2.0
Device count:    8
  [0] AMD Instinct MI300X
  [1] AMD Instinct MI300X
  ...
```

### 5. Configure Environment Variables

Set the following variables for optimal ROCm behaviour.  These can be placed
in `~/.bashrc` or in your container entrypoint.

```bash
# Select specific AMD GPUs (comma-separated indices)
export HIP_VISIBLE_DEVICES=0,1,2,3

# Alternative variable (same effect as HIP_VISIBLE_DEVICES)
export ROCR_VISIBLE_DEVICES=0,1,2,3

# ROCm installation root
export ROCM_PATH=/opt/rocm
export ROCM_HOME=/opt/rocm

# Override GFX architecture for newer GPUs on older ROCm (use with caution)
# RX 7900 XTX (gfx1100) → simulate gfx1030
# export HSA_OVERRIDE_GFX_VERSION=10.3.0

# HIPBLAS workspace configuration
export HIPBLAS_WORKSPACE_CONFIG=:512:8
```

> **Note**: `CUDA_VISIBLE_DEVICES` is also honoured by ROCm and is portable
> across NVIDIA and AMD.  Prefer `HIP_VISIBLE_DEVICES` or
> `ROCR_VISIBLE_DEVICES` on AMD-only systems.

### 6. Full Smoke Test

Run a complete end-to-end verification that exercises GPU memory allocation,
tensor operations, and PyTorch compilation:

```bash
python3 -c "
import torch
import sys

# 1. Check availability
if not torch.cuda.is_available():
    print('❌ torch.cuda.is_available() is False')
    sys.exit(1)
print('✅ torch.cuda.is_available() = True')

# 2. Detect backend
backend = 'rocm' if (hasattr(torch.version, 'hip') and torch.version.hip) else 'cuda'
print(f'✅ Backend: {backend}')

# 3. Device count
count = torch.cuda.device_count()
print(f'✅ Device count: {count}')

# 4. Device name
name = torch.cuda.get_device_name(0)
print(f'✅ Device 0: {name}')

# 5. Tensor allocation
x = torch.randn(1000, 1000, device='cuda')
print(f'✅ Allocated 1000x1000 tensor on {x.device}')

# 6. Simple matmul (exercises GPU kernels)
y = torch.randn(1000, 1000, device='cuda')
z = torch.mm(x, y)
print(f'✅ matmul result shape: {z.shape}')

# 7. Memory info
free, total = torch.cuda.mem_get_info(0)
print(f'✅ GPU memory: {free/1e9:.2f} GB free / {total/1e9:.2f} GB total')

# 8. TF32 toggle (NVIDIA only)
if backend == 'cuda':
    torch.backends.cuda.matmul.allow_tf32 = True
    print('✅ TF32 enabled')

print()
print('🎯 All smoke tests passed!')
"
```

## Reference Documents

| Document | Description |
|----------|-------------|
| [references/supported-gpus.md](references/supported-gpus.md) | Complete AMD GPU compatibility table with GFX architectures, VRAM, and minimum ROCm versions |
| [references/troubleshooting.md](references/troubleshooting.md) | 8+ common issues with detailed solutions |

## Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/detect-gpu.py` | Multi-backend GPU detection (PyTorch → system commands → CPU fallback). Outputs JSON and human-readable report. Exit code 0 = GPU, 1 = CPU only. | `python3 scripts/detect-gpu.py` |
| `scripts/check-rocm.sh` | Comprehensive ROCm health check: GPU detection, ROCm version, PyTorch ROCm, env vars, user groups. Exit code 0 = OK, 1 = warnings, 2 = errors. | `bash scripts/check-rocm.sh` |

## Common Issues

### 1. GPU Not Detected by ROCm

- **Cause**: amdgpu kernel module not loaded, GPU not visible via PCIe.
- **Solution**: `sudo modprobe amdgpu` and check `lspci | grep -i amd`.
  Ensure BIOS has Above 4G Decoding and Resizable BAR enabled.

### 2. `torch.cuda.is_available()` Returns False

- **Cause**: PyTorch wheel is CUDA-only, or ROCm version mismatch.
- **Solution**: Install from the AMD index:
  `pip install torch --index-url https://download.pytorch.org/whl/rocm6.2`
  Match ROCm ↔ PyTorch ROCm versions (see troubleshooting reference).

### 3. Permission Denied on `/dev/kfd`

- **Cause**: User is not in the `video` or `render` group.
- **Solution**: `sudo usermod -a -G video,render $USER && newgrp render`

### 4. Docker Container Does Not See AMD GPU

- **Cause**: Using `--gpus all` (NVIDIA syntax) instead of device passthrough.
- **Solution**: Use `--device=/dev/kfd --device=/dev/dri --group-add=render`
  or `--group-add=video`.  Do NOT use `--gpus all`.

### 5. ROCm Version Mismatch with PyTorch

- **Cause**: ROCm drivers are one version (e.g. 6.1) but PyTorch was compiled
  for another (e.g. 6.2).
- **Solution**: Check `dpkg -l rocm-libs` and `python3 -c "import torch; print(torch.version.hip)"`. Install matching versions.

### 6. `HSA_OVERRIDE_GFX_VERSION` Errors or Crashes

- **Cause**: Incorrect override value or incompatible GPU architecture.
- **Solution**: Remove the override or set the correct value for your GPU.
   See [references/supported-gpus.md](references/supported-gpus.md) for
   architecture mappings.  Prefer an official ROCm release when available.

## Related Skills

- [`rocm-docker`](../rocm-docker/SKILL.md) — Docker with AMD GPU passthrough
- [`rocm-troubleshoot`](../rocm-troubleshoot/SKILL.md) — Diagnostics and troubleshooting
- [`rocm-benchmark`](../rocm-benchmark/SKILL.md) — GPU benchmarking and monitoring
