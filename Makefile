# SME — Makefile
# Constitutional build and test automation

.PHONY: help dev-setup test test-unit test-integration test-conformance test-replay \
        lint typecheck clean build pull-models quantize docker-build docker-up docker-down

# Default target
help:
	@echo "SME — Sovereign Multimodal Engine"
	@echo ""
	@echo "Targets:"
	@echo "  dev-setup       Install development dependencies and build runtimes"
	@echo "  pull-models     Download pinned model weights from HF Hub"
	@echo "  quantize        Quantize models for CPU inference"
	@echo "  test            Run all tests (unit + integration)"
	@echo "  test-unit       Run unit tests only"
	@echo "  test-integration Run integration tests"
	@echo "  test-conformance Run 21 constitutional conformance checks"
	@echo "  test-replay     Run deterministic replay verification"
	@echo "  lint            Run linters (ruff, mypy)"
	@echo "  typecheck       Run type checking"
	@echo "  build           Build all modules"
	@echo "  docker-build    Build Docker images"
	@echo "  docker-up       Start local stack with docker-compose"
	@echo "  docker-down     Stop local stack"
	@echo "  clean           Clean build artifacts"

# Development setup
dev-setup: build-llama-cpp build-ort build-whisper-cpp
	pip install -e ./sme-core -e ./sme-txt -e ./sme-vis -e ./sme-aud -e ./sme-vid -e ./sme-gen -e ./sme-log -e ./sdk/python
	pip install pytest pytest-asyncio pytest-cov ruff mypy pre-commit
	pre-commit install

# Build llama.cpp
build-llama-cpp:
	@./scripts/build_llama_cpp.sh

# Build ONNXRuntime
build-ort:
	@./scripts/build_ort.sh

# Build whisper.cpp
build-whisper-cpp:
	@./scripts/build_whisper_cpp.sh

# Pull models from HF Hub
pull-models:
	python ./scripts/pull_models.py --models-dir ./models --manifest ./models/manifest.yaml

# Quantize models
quantize:
	python ./scripts/quantize_all.py --models-dir ./models --llama-cpp ./llama.cpp/build

# Run all tests
test: test-unit test-integration test-conformance test-replay

# Unit tests
test-unit:
	pytest ./sme-core/tests ./sme-txt/tests ./sme-vis/tests ./sme-aud/tests ./sme-vid/tests ./sme-gen/tests ./sme-log/tests -v --tb=short

# Integration tests
test-integration:
	pytest ./test/integration -v --tb=short -m integration

# Conformance tests (21 checks)
test-conformance:
	python ./test/conformance/harness.py --verbose --junit ./test-results/conformance.xml --json ./test-results/conformance.json

# Replay verification tests
test-replay:
	pytest ./test/replay -v --tb=short

# Linting
lint:
	ruff check ./sme-core ./sme-txt ./sme-vis ./sme-aud ./sme-vid ./sme-gen ./sme-log ./sdk/python
	ruff format --check ./sme-core ./sme-txt ./sme-vis ./sme-aud ./sme-vid ./sme-gen ./sme-log ./sdk/python

# Type checking
typecheck:
	mypy ./sme-core ./sme-txt ./sme-vis ./sme-aud ./sme-vid ./sme-gen ./sme-log ./sdk/python

# Build all modules
build:
	pip install -e ./sme-core -e ./sme-txt -e ./sme-vis -e ./sme-aud -e ./sme-vid -e ./sme-gen -e ./sme-log

# Docker targets
docker-build:
	docker buildx bake -f ./deploy/docker/docker-compose.yml

docker-up:
	docker-compose -f ./deploy/docker/docker-compose.yml up -d

docker-down:
	docker-compose -f ./deploy/docker/docker-compose.yml down

# Clean
clean:
	rm -rf ./llama.cpp/build ./onnxruntime/build ./whisper.cpp/build
	rm -rf ./sme-core/build ./sme-txt/build ./sme-vis/build ./sme-aud/build ./sme-vid/build ./sme-gen/build ./sme-log/build
	rm -rf ./test-results
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Quick validation
validate: lint typecheck test-unit test-conformance
	@echo "Validation complete!"

# CI target
ci: dev-setup pull-models quantize validate
	@echo "CI pipeline complete!"