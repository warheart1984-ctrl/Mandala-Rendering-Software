#!/usr/bin/env python3
import hashlib, json

def compute_fingerprint(node_id, tier, vendor, model, vram_gb, backends, features):
    data = {
        "node_id": node_id,
        "tier": tier,
        "vendor": vendor,
        "model": model,
        "vram_gb": vram_gb,
        "backends": sorted(backends),
        "features": sorted(features)
    }
    s = json.dumps(data, sort_keys=True)
    h = hashlib.sha256(s.encode()).hexdigest()
    return f"CIEMS-CAP-FP:{h[:16]}"

if __name__ == "__main__":
    fp = compute_fingerprint(
        node_id="node-001",
        tier="S1",
        vendor="NVIDIA",
        model="Tesla M40",
        vram_gb=12,
        backends=["nvidia_ptx"],
        features=["FP32","FP64","EML","deterministic"]
    )
    print(fp)
