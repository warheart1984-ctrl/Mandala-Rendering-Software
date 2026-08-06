#!/bin/bash
# Build llama.cpp with CPU optimizations
# Usage: ./scripts/build_llama_cpp.sh [clean]

set -e

BUILD_DIR="llama.cpp/build"
LLAMA_CPP_DIR="llama.cpp"

if [ "$1" = "clean" ]; then
    echo "Cleaning llama.cpp build..."
    rm -rf "$BUILD_DIR"
fi

# Clone llama.cpp if not exists
if [ ! -d "$LLAMA_CPP_DIR" ]; then
    echo "Cloning llama.cpp..."
    git clone https://github.com/ggerganov/llama.cpp.git
fi

cd "$LLAMA_CPP_DIR"

# Create build directory
mkdir -p build
cd build

# Detect CPU features
CPU_FLAGS=""
if lscpu | grep -q "avx512f"; then
    CPU_FLAGS="-DLLAMA_AVX512=ON"
    echo "AVX-512 detected"
elif lscpu | grep -q "avx2"; then
    CPU_FLAGS="-DLLAMA_AVX2=ON"
    echo "AVX2 detected"
fi

if lscpu | grep -q "neon"; then
    CPU_FLAGS="$CPU_FLAGS -DLLAMA_NEON=ON"
    echo "NEON detected"
fi

# Configure
echo "Configuring with flags: $CPU_FLAGS"
cmake .. $CPU_FLAGS -DLLAMA_BUILD=ON -DLLAMA_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release

# Build
echo "Building llama.cpp..."
cmake --build . --config Release -j$(nproc)

echo "llama.cpp built successfully!"
echo "Binary: $(pwd)/bin/llama-cli"
echo "Quantize: $(pwd)/bin/llama-quantize"