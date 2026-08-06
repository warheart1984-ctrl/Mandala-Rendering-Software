#!/bin/bash
# ============================================================
# check-rocm.sh — ROCm Health Check
#
# Verifica el estado de ROCm en el sistema: detección de GPU,
# instalación ROCm, versión, PyTorch ROCm, variables de entorno
# y grupos de usuario.
#
# Exit codes:
#   0 = todo OK
#   1 = warnings (GPU detectada pero algo no óptimo)
#   2 = errores (GPU no detectada o componentes críticos faltan)
#
# Compatible con: Ubuntu 22.04, 24.04
# Backends: AMD ROCm, NVIDIA CUDA, CPU fallback
# ============================================================

set -euo pipefail

# ── Constants ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
PASS="${GREEN}✅${NC}"
WARN="${YELLOW}⚠️${NC}"
FAIL="${RED}❌${NC}"

EXIT=0

# ── Helper functions ───────────────────────────────────────
pass() { echo -e "  ${PASS} $1"; }
warn() { echo -e "  ${WARN} $1"; EXIT=1; }
fail() { echo -e "  ${FAIL} $1"; EXIT=2; }

header() {
    echo ""
    echo "─── $1 ───"
}

print_summary() {
    echo ""
    echo "═══════════════════════════════════════════"
    echo "  ROCm Health Check Summary"
    echo "═══════════════════════════════════════════"
    case $EXIT in
        0) echo -e "  ${PASS} All checks passed";;
        1) echo -e "  ${WARN} Passed with warnings";;
        2) echo -e "  ${FAIL} Errors detected";;
    esac
    echo "═══════════════════════════════════════════"
    exit $EXIT
}

# ── Main ──────────────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║       ROCm Health Check         ║"
echo "╚══════════════════════════════════════════╝"

# ============================================================
# 1. GPU Detection
# ============================================================
header "GPU Detection"

GPU_FOUND=false
GPU_BACKEND=""

# Check via nvidia-smi (NVIDIA)
if command -v nvidia-smi &>/dev/null; then
    NVIDIA_OUT=$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null | head -1 || true)
    if [ -n "$NVIDIA_OUT" ]; then
        GPU_FOUND=true
        GPU_BACKEND="nvidia"
        pass "NVIDIA GPU detected: $(echo "$NVIDIA_OUT" | cut -d',' -f1)"
        pass "NVIDIA driver: $(echo "$NVIDIA_OUT" | cut -d',' -f2)"
    fi
fi

# Check via rocm-smi (AMD)
if command -v rocm-smi &>/dev/null; then
    ROCM_OUT=$(rocm-smi --showproductname 2>/dev/null | grep -E "^[0-9]+:" | head -1 || true)
    if [ -n "$ROCM_OUT" ]; then
        GPU_FOUND=true
        GPU_BACKEND="rocm"
        pass "AMD GPU detected via rocm-smi"
        rocm-smi --showproductname 2>/dev/null | head -5 || true
    fi
fi

# Check via rocminfo (AMD, more detailed)
if command -v rocminfo &>/dev/null; then
    ROCM_INFO_GFX=$(rocminfo 2>/dev/null | grep -E "^\s*Name:\s+gfx" | head -3 || true)
    if [ -n "$ROCM_INFO_GFX" ]; then
        GPU_FOUND=true
        GPU_BACKEND="rocm"
        pass "AMD GPU detected via rocminfo"
        echo "$ROCM_INFO_GFX" | while read -r line; do
            echo "           $line"
        done
    fi
fi

# Check via lspci as last resort
if ! $GPU_FOUND; then
    if command -v lspci &>/dev/null; then
        AMD_PCI=$(lspci 2>/dev/null | grep -iE "amd|radeon" | grep -iE "vga|display|3d" || true)
        NVIDIA_PCI=$(lspci 2>/dev/null | grep -i nvidia | grep -iE "vga|display|3d" || true)
        if [ -n "$AMD_PCI" ]; then
            GPU_FOUND=true
            GPU_BACKEND="rocm"
            pass "AMD GPU detected via lspci (but rocminfo/rocm-smi not found)"
            echo "           $AMD_PCI"
            warn "ROCm tools (rocminfo/rocm-smi) not found — ROCm may not be installed"
        elif [ -n "$NVIDIA_PCI" ]; then
            GPU_FOUND=true
            GPU_BACKEND="nvidia"
            pass "NVIDIA GPU detected via lspci (but nvidia-smi not found)"
            echo "           $NVIDIA_PCI"
            warn "nvidia-smi not found — NVIDIA driver may not be installed"
        fi
    fi
fi

if ! $GPU_FOUND; then
    fail "No GPU detected (checked nvidia-smi, rocm-smi, rocminfo, lspci)"
fi

# ============================================================
# 2. ROCm Installation
# ============================================================
header "ROCm Installation"

if [ -d /opt/rocm ]; then
    pass "/opt/rocm directory exists"
else
    fail "/opt/rocm directory not found — ROCm is not installed"
fi

# Check rocminfo
if command -v rocminfo &>/dev/null; then
    pass "rocminfo available"
else
    if [ "$GPU_BACKEND" = "rocm" ]; then
        fail "rocminfo not found — ROCm runtime may be missing"
    else
        warn "rocminfo not found (expected for non-ROCm backend)"
    fi
fi

# Check rocm-smi
if command -v rocm-smi &>/dev/null; then
    pass "rocm-smi available"
else
    if [ "$GPU_BACKEND" = "rocm" ]; then
        fail "rocm-smi not found — ROCm tools may be missing"
    else
        warn "rocm-smi not found (expected for non-ROCm backend)"
    fi
fi

# ============================================================
# 3. ROCm Version
# ============================================================
header "ROCm Version"

ROCM_VERSION=""
if [ -f /opt/rocm/share/doc/rocm-version/version ]; then
    ROCM_VERSION=$(cat /opt/rocm/share/doc/rocm-version/version)
    pass "ROCm version: ${ROCM_VERSION}"
elif command -v dpkg &>/dev/null; then
    ROCM_DPKG=$(dpkg -l rocm-libs 2>/dev/null | grep rocm-libs | awk '{print $3}' || true)
    if [ -n "$ROCM_DPKG" ]; then
        ROCM_VERSION="${ROCM_DPKG}"
        pass "ROCm version (dpkg): ${ROCM_DPKG}"
    else
        warn "Cannot determine ROCm version (rocm-libs not installed via dpkg)"
    fi
else
    warn "Cannot determine ROCm version (no version file, no dpkg)"
fi

# ============================================================
# 4. PyTorch ROCm Support
# ============================================================
header "PyTorch ROCm"

PYTORCH_INSTALLED=false
if python3 -c "import torch; print(torch.__version__)" &>/dev/null; then
    PYTORCH_INSTALLED=true
    TORCH_VER=$(python3 -c "import torch; print(torch.__version__)")
    pass "PyTorch ${TORCH_VER} installed"
else
    fail "PyTorch is not installed"
fi

if $PYTORCH_INSTALLED; then
    # Check CUDA availability
    CUDA_AVAIL=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null || echo "error")
    if [ "$CUDA_AVAIL" = "True" ]; then
        pass "torch.cuda.is_available() = True"

        # Detect backend
        HIP_VER=$(python3 -c "import torch; v=getattr(torch.version,'hip',None); print(v or 'none')" 2>/dev/null || echo "none")
        CUDA_VER=$(python3 -c "import torch; v=getattr(torch.version,'cuda',None); print(v or 'none')" 2>/dev/null || echo "none")

        if [ "$HIP_VER" != "none" ]; then
            pass "Backend: ROCm (HIP version: ${HIP_VER})"
        elif [ "$CUDA_VER" != "none" ]; then
            pass "Backend: CUDA (CUDA version: ${CUDA_VER})"
        fi

        # Device count
        DEV_COUNT=$(python3 -c "import torch; print(torch.cuda.device_count())" 2>/dev/null || echo "0")
        pass "Device count: ${DEV_COUNT}"

        # Device name(s)
        for i in $(seq 0 $((DEV_COUNT - 1))); do
            DEV_NAME=$(python3 -c "import torch; print(torch.cuda.get_device_name($i))" 2>/dev/null || echo "unknown")
            pass "  [$i] ${DEV_NAME}"
        done
    else
        if [ "$GPU_BACKEND" = "rocm" ] || [ "$GPU_BACKEND" = "nvidia" ]; then
            fail "torch.cuda.is_available() = False — PyTorch was likely installed without ROCm/CUDA support"
            fail "Reinstall: pip install torch --index-url https://download.pytorch.org/whl/rocm6.2"
        else
            warn "torch.cuda.is_available() = False (expected — no GPU detected)"
        fi
    fi
fi

# ============================================================
# 5. Environment Variables
# ============================================================
header "Environment Variables"

# HIP_VISIBLE_DEVICES
if [ -n "${HIP_VISIBLE_DEVICES:-}" ]; then
    pass "HIP_VISIBLE_DEVICES = ${HIP_VISIBLE_DEVICES}"
fi

# ROCR_VISIBLE_DEVICES
if [ -n "${ROCR_VISIBLE_DEVICES:-}" ]; then
    pass "ROCR_VISIBLE_DEVICES = ${ROCR_VISIBLE_DEVICES}"
fi

# CUDA_VISIBLE_DEVICES (also honoured by ROCm)
if [ -n "${CUDA_VISIBLE_DEVICES:-}" ]; then
    pass "CUDA_VISIBLE_DEVICES = ${CUDA_VISIBLE_DEVICES}"
fi

# HSA_OVERRIDE_GFX_VERSION
if [ -n "${HSA_OVERRIDE_GFX_VERSION:-}" ]; then
    warn "HSA_OVERRIDE_GFX_VERSION = ${HSA_OVERRIDE_GFX_VERSION} (override active — use with caution)"
fi

# ROCM_PATH / ROCM_HOME
if [ -n "${ROCM_PATH:-}" ]; then
    pass "ROCM_PATH = ${ROCM_PATH}"
fi
if [ -n "${ROCM_HOME:-}" ]; then
    pass "ROCM_HOME = ${ROCM_HOME}"
fi

# HIPBLAS_WORKSPACE_CONFIG
if [ -n "${HIPBLAS_WORKSPACE_CONFIG:-}" ]; then
    pass "HIPBLAS_WORKSPACE_CONFIG = ${HIPBLAS_WORKSPACE_CONFIG}"
fi

# Check if any GPU-related env vars are set
if [ -z "${HIP_VISIBLE_DEVICES:-}" ] && [ -z "${ROCR_VISIBLE_DEVICES:-}" ] && [ -z "${CUDA_VISIBLE_DEVICES:-}" ]; then
    if $GPU_FOUND; then
        warn "No GPU visibility variables set (HIP_VISIBLE_DEVICES / ROCR_VISIBLE_DEVICES / CUDA_VISIBLE_DEVICES)"
        warn "All detected GPUs will be used"
    fi
fi

# ============================================================
# 6. User Groups (video / render)
# ============================================================
header "User Groups"

USER_GROUPS=$(groups 2>/dev/null || true)

if echo "$USER_GROUPS" | grep -q "video"; then
    pass "User is in the 'video' group"
else
    warn "User is NOT in the 'video' group — add with: sudo usermod -a -G video $USER"
fi

if echo "$USER_GROUPS" | grep -q "render"; then
    pass "User is in the 'render' group"
else
    warn "User is NOT in the 'render' group — add with: sudo usermod -a -G render $USER"
fi

# ============================================================
# Summary
# ============================================================
print_summary
