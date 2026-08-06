#!/bin/bash
# Build whisper.cpp with CPU optimizations
# Usage: ./scripts/build_whisper_cpp.sh [clean]

set -e

BUILD_DIR="whisper.cpp/build"
WHISPER_DIR="whisper.cpp"

if [ "$1" = "clean" ]; then
    echo "Cleaning whisper.cpp build..."
    rm -rf "$BUILD_DIR"
fi

# Clone whisper.cpp if not exists
if [ ! -d "$WHISPER_DIR" ]; then
    echo "Cloning whisper.cpp..."
    git clone https://github.com/ggerganov/whisper.cpp.git
fi

cd "$WHISPER_DIR"

# Create build directory
mkdir -p build
cd build

# Detect CPU features
CPU_FLAGS=""
if lscpu | grep -q "avx512f"; then
    CPU_FLAGS="-DWHISPER_AVX512=ON"
    echo "AVX-512 detected"
elif lscpu | grep -q "avx2"; then
    CPU_FLAGS="-DWHISPER_AVX2=ON"
    echo "AVX2 detected"
fi

if lscpu | grep -q "neon"; then
    CPU_FLAGS="$CPU_FLAGS -DWHISPER_NEON=ON"
    echo "NEON detected"
fi

# Configure
echo "Configuring with flags: $CPU_FLAGS"
cmake .. $CPU_FLAGS -DWHISPER_BUILD=ON -DWHISPER_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release

# Build
echo "Building whisper.cpp..."
cmake --build . --config Release -j$(nproc)

echo "whisper.cpp built successfully!"
echo "Binary: $(pwd)/bin/whisper-cli"
echo "Quantize: $(pwd)/bin/whisper-quantize"