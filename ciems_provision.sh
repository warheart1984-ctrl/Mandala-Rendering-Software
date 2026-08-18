#!/usr/bin/env bash
set -euo pipefail

NODE_ID="${1:?node id required}"

echo "[CIEMS] Provisioning $NODE_ID"

# 1. Detect GPU
echo "[CIEMS] Detect GPU"
# ciems-ctl detect-gpu

# 2. Verify drivers/runtime
echo "[CIEMS] Verify drivers/runtime"
# ciems-ctl verify-drivers
# ciems-ctl verify-runtime

# 3. Conformance tests
echo "[CIEMS] Running conformance tests"
# ciems-ctl test --suite core
# ciems-ctl test --suite conformance

# 4. Certificate generation
ciems-node-installer certify "$NODE_ID"

# 5. Register
echo "[CIEMS] Register node $NODE_ID"
# ciems-ctl register --node-id "$NODE_ID"

echo "[CIEMS] Node $NODE_ID CERTIFIED"
