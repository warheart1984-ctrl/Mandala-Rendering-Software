
"""
amul-denser-topology-worker.py
PARTIAL lane — silhouette loops only, no beauty break.
- Reads base mesh meta (no pixel production)
- Adds AMUL silhouette loops only
- Enforces Λ.3 and Λ.7 REJECT gates
- Logs hash-chain for audit
"""

import hashlib, json, time
from dataclasses import dataclass

# VOSS Binding import (from your Project Finish)
# from voss_binding import VossOperator  # BOUND / PARTIAL / REJECTED

@dataclass
class TopologyOp:
    id: str
    quads_before: int
    quads_after: int
    parity_delta: float

FORBIDDEN_OPS = ["firmware_write", "efivarfs_write", "msr_write", "beauty_print", "pixelsProduced"]

def voss_apply_gate(op_name: str):
    if op_name in FORBIDDEN_OPS:
        # Λ.3 / Λ.7
        print(f"[VOSS:{op_name}] → REJECTED + halt (Λ.3/Λ.7)")
        raise SystemExit(f"REJECTED: {op_name} forbidden in PARTIAL lane")
    # PARTIAL allowed
    return "PARTIAL"

def canonical_stringify(d: dict) -> str:
    return json.dumps(d, sort_keys=True, separators=(",", ":"))

def hash_payload(d: dict) -> str:
    return hashlib.sha256(canonical_stringify(d).encode()).hexdigest()

def add_silhouette_loops(base_meta):
    voss_apply_gate("topology_densify")
    ops = []
    # Silhouette loops only — as spec'd
    loop_defs = [
        ("AMUL::SHOULDER_L", 120), ("AMUL::SHOULDER_R", 120),
        ("AMUL::CHEST", 80),
        ("AMUL::LAT_L", 100), ("AMUL::LAT_R", 100),
        ("AMUL::HIP_L", 150), ("AMUL::HIP_R", 150),
        ("AMUL::KNEE_L", 40), ("AMUL::KNEE_R", 40),
        ("AMUL::TAIL_ROOT", 180),
    ]
    quads = base_meta["quads"]
    for loop_id, quad_cost in loop_defs:
        before = quads
        quads += quad_cost
        ops.append(TopologyOp(loop_id, before, quads, parity_delta=0.01))
        print(f"[AMUL] {loop_id}: {before} -> {quads} quads (+{quad_cost})")

    result = {
        "lane": "PARTIAL",
        "beauty_break": False,
        "quads_before": base_meta["quads"],
        "quads_after": quads,
        "silhouette_parity_targets": ["SHOULDER_WIDTH", "CHEST_MASS", "THIGH_MASS"],
        "ops": [op.__dict__ for op in ops],
        "hash": hash_payload({"quads_after": quads, "ops": len(ops)}),
        "prev_hash": base_meta.get("prev_hash", "genesis"),
        "timestamp": time.time(),
        "governance": "silhouette loops only, VOSS BOUND->PARTIAL, no pixels"
    }
    result["audit_chain"] = hash_payload(result)
    return result

if __name__ == "__main__":
    base = {"quads": 2000, "prev_hash": "biosAiLane:19_voss:6_partial_genesis", "source": "fox_reference"}
    out = add_silhouette_loops(base)
    print(json.dumps(out, indent=2))
    # Never call firmware_write or beauty_print here — would REJECT
    with open("amul_denser_output.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\n[WORKER] PARTIAL lane complete — ready for SoT print gate.")
