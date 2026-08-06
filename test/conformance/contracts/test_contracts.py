"""
Conformance tests for Constitutional Contracts v1
Validates that all constitutional contracts are valid and compatible
"""
import json
import sys
from pathlib import Path
import jsonschema
from jsonschema import Draft7Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

CONTRACTS_DIR = Path(__file__).parent.parent.parent.parent / "governance" / "contracts" / "v1" / "schemas"

def load_schema(name: str):
    path = CONTRACTS_DIR / f"{name}.json"
    with open(path) as f:
        return json.load(f)

def create_registry():
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012
    
    resources = {}
    for name in ["routing-request", "execution-plan", "lrc-envelope", "evidence-bundle", "replay-record"]:
        schema = load_schema(name)
        uri = schema.get("$id", f"https://sme.mandala.io/contracts/v1/{name}.json")
        resources[schema.get("$id", f"https://sme.mandala.io/contracts/v1/{name}.json")] = Resource.from_contents(schema)
    
    return Registry(resources=resources)

def load_schema(name: str):
    path = CONTRACTS_DIR / f"{name}.json"
    with open(path) as f:
        return json.load(f)

def create_validator(schema_name: str):
    schema = load_schema(schema_name)
    registry = create_registry()
    from jsonschema import Draft7Validator
    from referencing import Registry
    from referencing.jsonschema import DRAFT202012
    from referencing import Registry, Resource
    
    resources = {}
    for name in ["routing-request", "execution-plan", "lrc-envelope", "evidence-bundle", "replay-record"]:
        schema = load_schema(name)
        uri = schema.get("$id", f"https://sme.mandala.io/contracts/v1/{name}.json")
        from referencing import Registry, Resource
        from referencing.jsonschema import DRAFT202012
        registry = Registry().with_resources({
            schema.get("$id", f"https://sme.mandala.io/contracts/v1/{name}.json"): 
            Resource.from_contents(schema) 
            for name in ["routing-request", "execution-plan", "lrc-envelope", "evidence-bundle", "replay-record"]
        }).with_specification(DRAFT202012)
        return Draft7Validator(load_schema(schema_name), registry=registry)

def create_validator(schema_name: str):
    schema = load_schema(schema_name)
    registry = create_registry()
    from jsonschema import Draft7Validator
    return Draft7Validator(schema, registry=registry)

def test_routing_request_schema():
    """Verify RoutingRequest schema is valid and self-consistent"""
    schema = load_schema("routing-request")
    jsonschema.Draft7Validator.check_schema(schema)
    
    validator = create_validator("routing-request")
    
    valid_instance = {
        "request_id": "550e8400-e29b-41d4-a716-446655440000",
        "intent": {
            "goal": "Describe this image",
            "modality": ["image", "text"],
            "constraints": {
                "max_latency_ms": 5000,
                "max_cost_usd": 0.01,
                "privacy": "local",
                "deterministic": True,
                "evidence_level": "full"
            }
        },
        "payload": {"image": "base64data"},
        "actor_id": "mrs-user-123",
        "authority_chain": ["mrs", "sme-core"],
        "lawbook_chain": ["authority", "validation", "decision", "evidence", "verification", "replay", "audit"]
    }
    validator.validate(valid_instance)
    print("[OK] RoutingRequest schema valid")

def test_execution_plan_schema():
    validator = create_validator("execution-plan")
    validator.validate({
        "plan_id": "plan-123",
        "request_id": "req-123",
        "capability_plan": {
            "estimated_flops": 1000000000,
            "estimated_ram_gb": 2.0,
            "estimated_latency_ms": 1000,
            "execution_mode": "LOCAL",
            "substrate_hints": {
                "txt": "CPU_AVX2",
                "vis": "CPU_AVX2",
                "aud": "CPU_AVX2",
                "vid": "CPU_AVX2",
                "gen": "CPU_AVX2"
            }
        },
        "lrc_envelopes": [{
            "envelope_id": "env-1",
            "origin_node": "sovereign-x-router",
            "target_node": "sme-vis",
            "actor_id": "user-1",
            "action": "encode",
            "lawbook_chain": ["authority", "validation", "decision", "evidence", "verification", "replay", "audit"],
            "payload": {},
            "evidence_requirements": ["intent_declaration"]
        }],
        "constitutional_trace": {
            "authority": {"actor": "user", "granted": True},
            "validation": {"checks": []},
            "fusion": {"modalities": ["image"]},
            "decision": {"action": "encode"},
            "evidence": {"bundle_id": "bundle-1"},
            "verification": {"passed": True},
            "replay": {"deterministic": True},
            "audit": {"logged": True}
        },
        "evidence_requirements": ["intent_declaration"]
    })
    print("[OK] ExecutionPlan schema valid")

def test_lrc_envelope_schema():
    validator = create_validator("lrc-envelope")
    validator.validate({
        "envelope_id": "env-123",
        "origin_node": "sovereign-x-router",
        "target_node": "sme-vis",
        "actor_id": "user-1",
        "action": "encode",
        "lawbook_chain": ["authority", "validation", "decision", "evidence", "verification", "replay", "audit"],
        "payload": {"image": "base64"},
        "evidence_requirements": ["intent_declaration"]
    })
    print("[OK] LRCEnvelope schema valid")

def test_evidence_bundle_schema():
    validator = create_validator("evidence-bundle")
    validator.validate({
        "bundle_id": "bundle-123",
        "intent_id": "req-123",
        "world_id": "world-1",
        "timeline_id": "timeline-1",
        "artifacts": {
            "art-1": {
                "artifact_id": "art-1",
                "bundle_id": "bundle-123",
                "artifact_type": "embedding",
                "data": {"vector": [0.1, 0.2]},
                "checksum": "a" * 64,
                "created_at": "2026-01-01T00:00:00Z"
            }
        },
        "frames": [{
            "frame_id": "frame-1",
            "intent_id": "req-123",
            "world_id": "world-1",
            "timeline_id": "timeline-1",
            "time_seconds": 0.1,
            "parameters": {},
            "substrate": "CPU_AVX2",
            "kernel_call_id": "call-1",
            "shapes": {"A": [1, 768]},
            "dtypes": {"A": "float32"},
            "seed": 42,
            "evidence_refs": ["ev-1"]
        }],
        "merkle_root": "a" * 64,
        "created_at": "2026-01-01T00:00:00Z"
    })
    print("[OK] EvidenceBundle schema valid")

def test_replay_record_schema():
    validator = create_validator("replay-record")
    validator.validate({
        "record_id": "replay-123",
        "request_id": "req-123",
        "plan": {
            "plan_id": "plan-1",
            "request_id": "req-1",
            "capability_plan": {
                "estimated_flops": 1000000000,
                "estimated_ram_gb": 2.0,
                "estimated_latency_ms": 1000,
                "execution_mode": "LOCAL",
                "substrate_hints": {
                    "txt": "CPU_AVX2",
                    "vis": "CPU_AVX2",
                    "aud": "CPU_AVX2",
                    "vid": "CPU_AVX2",
                    "gen": "CPU_AVX2"
                }
            },
            "lrc_envelopes": [{
                "envelope_id": "env-1",
                "origin_node": "sovereign-x-router",
                "target_node": "sme-vis",
                "actor_id": "user-1",
                "action": "encode",
                "lawbook_chain": ["authority", "validation", "decision", "evidence", "verification", "replay", "audit"],
                "payload": {},
                "evidence_requirements": ["intent_declaration"]
            }],
            "constitutional_trace": {
                "authority": {"actor": "user", "granted": True},
                "validation": {"checks": []},
                "fusion": {"modalities": ["image"]},
                "decision": {"action": "encode"},
                "evidence": {"bundle_id": "bundle-1"},
                "verification": {"passed": True},
                "replay": {"deterministic": True},
                "audit": {"logged": True}
            },
            "evidence_requirements": ["intent_declaration"]
        },
        "inputs": {"payload": {}, "constraints": {}},
        "module_results": [{
            "node_id": "sme-vis",
            "action": "encode",
            "output": {},
            "evidence": {},
            "deterministic": True,
            "seed": 42,
            "latency_ms": 100
        }],
        "evidence_bundle": {"bundle_id": "bundle-1", "intent_id": "req-1", "world_id": "w1", "timeline_id": "tl-1", "artifacts": {}, "frames": [], "merkle_root": "a"*64, "created_at": "2026-01-01T00:00:00Z"},
        "seeds": {"numpy": 42, "torch": 123},
        "environment": {
            "model_versions": {"sme-vis": "1.0"},
            "substrate_versions": {"onnxruntime": "1.18"},
            "library_versions": {"onnxruntime": "1.18"},
            "os": "Windows",
            "cpu_arch": "x64",
            "gpu_device": "NVIDIA RTX 3080"
        },
        "deterministic": True,
        "merkle_root": "a" * 64,
        "created_at": "2026-01-01T00:00:00Z"
    })
    print("[OK] ReplayRecord schema valid")

def test_contract_compatibility():
    """Verify all contracts declare compatible_versions correctly"""
    schemas = [
        "routing-request",
        "execution-plan",
        "lrc-envelope",
        "evidence-bundle",
        "replay-record"
    ]
    
    for name in schemas:
        schema = load_schema(name)
        meta = schema.get("contract_metadata", {})
        assert meta.get("schema_version") == "1.0.0", f"{name}: missing schema_version"
        assert meta.get("contract_version") == "1.0.0", f"{name}: wrong contract_version"
        assert meta.get("compatible_versions") == ["1.0.0"], f"{name}: missing compatible_versions"
        assert meta.get("migration_policy") == "backward_compatible", f"{name}: missing migration_policy"
        assert meta.get("deterministic_replay_guaranteed") is True, f"{name}: missing deterministic_replay_guaranteed"
        assert "evidence_requirements" in meta, f"{name}: missing evidence_requirements"
        print("[OK] {} contract metadata valid".format(name))

def test_no_regressions():
    """Ensure no breaking changes in v1 contracts"""
    pass

if __name__ == "__main__":
    import json
    from pathlib import Path
    import jsonschema
    import sys
    
    print("Running Constitutional Contracts v1 Conformance Tests...")
    test_routing_request_schema()
    test_execution_plan_schema()
    test_lrc_envelope_schema()
    test_evidence_bundle_schema()
    test_replay_record_schema()
    test_contract_compatibility()
    print("\nAll Constitutional Contracts v1 conformance tests passed!")
    sys.exit(0)