#!/bin/bash
# Build ONNXRuntime with CPU optimizations
# Usage: ./scripts/build_ort.sh [clean]

set -e

ORT_VERSION="1.17.0"
BUILD_DIR="onnxruntime/build"
ORT_DIR="onnxruntime"

if [ "$1" = "clean" ]; then
    echo "Cleaning ONNXRuntime build..."
    rm -rf "$BUILD_DIR"
fi

# Clone ONNXRuntime if not exists
if [ ! -d "$ORT_DIR" ]; then
    echo "Cloning ONNXRuntime v$ORT_VERSION..."
    git clone --branch v$ORT_VERSION --depth 1 https://github.com/microsoft/onnxruntime.git
fi

cd "$ORT_DIR"

# Build with CPU optimizations
echo "Building ONNXRuntime..."
./build.sh \
    --config Release \
    --parallel \
    --build_shared_lib \
    --enable_pybind \
    --cmake_extra_defines \
        onnxruntime_BUILD_SHARED_LIB=ON \
        onnxruntime_ENABLE_PYTHON=ON \
        onnxruntime_ENABLE_TRAINING=OFF \
        onnxruntime_USE_MKL=ON \
        onnxruntime_USE_MKLML=ON \
        onnxruntime_USE_OPENMP=ON \
    --cmake_generator "Ninja"

echo "ONNXRuntime built successfully!"
echo "Python package: $(pwd)/build/Linux/Release/dist/*.whl"