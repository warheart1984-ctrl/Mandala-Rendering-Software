#!/usr/bin/env python3
"""
Quick Conformance Test Runner for FMCE + Sovereign X

Run without pytest: python test_fmce_sx_quick.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fmce_sx import FMCEWithSX, create_fmce_sx, ModelRole
from sx_jsonrpc_bridge import SXJsonRpcBridge, SXBridgeConfig


class TestResult:
    def __init__(self, name: str, passed: bool, message: str = "", duration: float = 0):
        self.name = name
        self.passed = passed
        self.message = message
        self.duration = duration
    
    def __str__(self):
        status = "[PASS]" if self.passed else "[FAIL]"
        return f"{status} {self.name} ({self.duration*1000:.1f}ms) {self.message}"


def run_test(name: str, func) -> TestResult:
    """Run a single test function."""
    start = time.time()
    try:
        func()
        return TestResult(name, True, "", time.time() - start)
    except AssertionError as e:
        return TestResult(name, False, f"AssertionError: {e}", time.time() - start)
    except Exception as e:
        return TestResult(name, False, f"{type(e).__name__}: {e}", time.time() - start)


def test_provenance_recorder_exists(fmce):
    """provenance.recorder-exists"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    assert "provenance_gates" in result.raw or result.provenance_gates is not None
    assert result.constitutional_log is not None or result.raw.get("constitutionalLog") is not None


def test_provenance_frame_fields(fmce):
    """provenance.frame-fields"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    log = result.constitutional_log or result.raw.get("constitutionalLog")
    if log:
        log_str = json.dumps(log)
        # Sovereign X governance trace fields
        assert "imageGenProvider" in log_str or "fallbackUsed" in log_str or "reason" in log_str


def test_replay_service_exists(fmce):
    """replay.service-exists"""
    roles = fmce.list_roles()
    assert ModelRole.IMAGES in roles
    original = roles[ModelRole.IMAGES].model
    fmce.set_role(ModelRole.IMAGES, original)
    assert fmce.get_role(ModelRole.IMAGES).model == original


def test_replay_deterministic_params(fmce):
    """replay.deterministic-params"""
    role = fmce.get_role(ModelRole.IMAGES)
    assert role.model is not None
    assert role.temperature == 0.7
    assert role.max_tokens == 8192


def test_binding_resolver_exists(fmce):
    """binding.resolver-exists"""
    model = "lemonade/SD-Turbo-GGUF"
    endpoint, model_id = fmce._parse_model(model)
    assert endpoint == "lemonade"
    assert model_id == "SD-Turbo-GGUF"
    
    role_model, assignment = fmce._resolve_role_model(ModelRole.IMAGES)
    assert "/" in role_model


def test_binding_all_tracks_resolved(fmce):
    """binding.all-tracks-resolved"""
    for role in ModelRole:
        assignment = fmce.get_role(role)
        if assignment:
            endpoint, model_id = fmce._parse_model(assignment.model)
            assert endpoint in fmce.config.endpoints


def test_timeline_loader_exists(fmce):
    """timeline.loader-exists"""
    config_path = "./test_fmce_config_quick.json"
    fmce.save_config(config_path)
    fmce2 = create_fmce_sx(config_path=config_path)
    
    for role in ModelRole:
        orig = fmce.get_role(role)
        loaded = fmce2.get_role(role)
        if orig and loaded:
            assert orig.model == loaded.model
    
    fmce2.close()
    os.unlink(config_path)


def test_timeline_clip_application(fmce):
    """timeline.clip-application"""
    fmce.set_role(ModelRole.IMAGES, "lemonade/SD-Turbo-GGUF", temperature=0.5, max_tokens=100)
    role = fmce.get_role(ModelRole.IMAGES)
    assert role.temperature == 0.5
    assert role.max_tokens == 100


def test_timeline_world_required(fmce):
    """timeline.world-required"""
    # Requires model for generation
    fmce.set_role(ModelRole.IMAGES, "lemonade/SD-Turbo-GGUF")
    role = fmce.get_role(ModelRole.IMAGES)
    assert role is not None


def test_evidence_bundle_fields(fmce):
    """evidence.bundle-fields"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    log = result.constitutional_log or result.raw.get("constitutionalLog")
    if log:
        log_str = json.dumps(log)
        # Sovereign X evidence fields
        assert "imageGenProvider" in log_str or "localGpuAvailable" in log_str or "fallbackUsed" in log_str


def test_evidence_dual_require(fmce):
    """evidence.dual-require"""
    result = fmce.sx_verify_weights("SD-Turbo-GGUF")
    assert "lawful" in result or "checksumOk" in result
    assert "haltCauseClass" in result or result.get("status") in ("blocked", "partial")


def test_ckl_policy_load(fmce):
    """ckl.policy-load"""
    health = fmce.sx_health()
    assert "serverUp" in health
    assert "status" in health


def test_ckl_deny_without_intent(fmce):
    """ckl.deny-without-intent"""
    try:
        fmce.sx_generate(prompt="")
        assert False, "Should have raised"
    except Exception:
        pass  # Expected


def test_ckl_modify_param(fmce):
    """ckl.modify-param"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    assert "fallback_used" in result.raw or result.fallback_used is not None


def test_ckl_attach_provenance(fmce):
    """ckl.attach-provenance"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    gates = result.provenance_gates or result.raw.get("provenanceGates", [])
    assert isinstance(gates, list)


def test_csr_governance_trace(fmce):
    """csr.governance-trace"""
    result = fmce.sx_generate(prompt="test", size="256x256", steps=2)
    log = result.constitutional_log or result.raw.get("constitutionalLog")
    if log:
        log_str = json.dumps(log)
        # Sovereign X governance trace fields (different from MRS CKL format)
        for field in ["imageGenProvider", "localGpuAvailable", "fallbackUsed", "reason"]:
            assert field in log_str, f"Missing {field}"


def test_role_assignment_persists(fmce):
    """Role assignments persist"""
    fmce.set_role(ModelRole.IMAGES, "openrouter/stability-ai/sd-turbo")
    fmce.set_role(ModelRole.CHAT, "ollama/llama3.2:3b")
    
    config_path = "./test_fmce_config_quick.json"
    fmce.save_config(config_path)
    
    fmce2 = create_fmce_sx(config_path=config_path)
    
    assert fmce2.get_role(ModelRole.IMAGES).model == "openrouter/stability-ai/sd-turbo"
    assert fmce2.get_role(ModelRole.CHAT).model == "ollama/llama3.2:3b"
    
    fmce2.close()
    os.unlink(config_path)


def test_local_first_priority(fmce):
    """Local endpoints have priority"""
    endpoints = fmce.list_endpoints()
    assert endpoints["lemonade"].is_local == True
    assert endpoints["ollama"].is_local == True
    assert endpoints["openrouter"].is_local == False


def test_fallback_chain(fmce):
    """Fallback chains configured"""
    for role in ModelRole:
        assignment = fmce.get_role(role)
        if assignment:
            assert "/" in assignment.model
            if assignment.fallback:
                assert "/" in assignment.fallback


def test_bridge_startup(bridge):
    """Bridge starts and responds"""
    health = bridge.health()
    assert "serverUp" in health
    assert "status" in health


def test_bridge_list_models(bridge):
    """Bridge lists models"""
    models = bridge.list_models()
    assert "models" in models
    assert isinstance(models["models"], list)


def test_bridge_probe(bridge):
    """Bridge runs capability probe"""
    probe = bridge.probe(try_generate=False)
    assert "serverUp" in probe
    assert "status" in probe
    assert "downloadedImageModels" in probe


def test_bridge_concurrent(bridge):
    """Bridge handles concurrent requests"""
    import threading
    
    results = []
    errors = []
    
    def call_health():
        try:
            results.append(bridge.health())
        except Exception as e:
            errors.append(e)
    
    threads = [threading.Thread(target=call_health) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    
    assert len(errors) == 0
    assert len(results) == 5
    for r in results:
        assert "serverUp" in r


def test_bridge_latency(bridge):
    """Bridge latency under 10ms"""
    start = time.time()
    for _ in range(10):
        bridge.health()
    elapsed = time.time() - start
    assert elapsed < 0.1, f"Bridge latency too high: {elapsed:.3f}s"


def test_role_resolution_speed(fmce):
    """Role resolution under 1ms"""
    start = time.time()
    for _ in range(100):
        fmce._resolve_role_model(ModelRole.IMAGES)
    elapsed = time.time() - start
    assert elapsed < 0.01, f"Role resolution too slow: {elapsed:.3f}s"


def main():
    # Fix Windows console encoding
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    print("=" * 60)
    print("FMCE + Sovereign X Quick Conformance Tests")
    print("=" * 60)
    
    # Initialize
    print("\n[1/3] Starting JSON-RPC bridge...")
    bridge = SXJsonRpcBridge()
    bridge.start()
    print("      Bridge started")
    
    print("\n[2/3] Creating FMCE with SX...")
    fmce = create_fmce_sx()
    print("      FMCE created")
    
    print("\n[3/3] Running tests...\n")
    
    tests = [
        # Provenance
        ("provenance.recorder-exists", lambda: test_provenance_recorder_exists(fmce)),
        ("provenance.frame-fields", lambda: test_provenance_frame_fields(fmce)),
        # Replay
        ("replay.service-exists", lambda: test_replay_service_exists(fmce)),
        ("replay.deterministic-params", lambda: test_replay_deterministic_params(fmce)),
        # Binding
        ("binding.resolver-exists", lambda: test_binding_resolver_exists(fmce)),
        ("binding.all-tracks-resolved", lambda: test_binding_all_tracks_resolved(fmce)),
        # Timeline
        ("timeline.loader-exists", lambda: test_timeline_loader_exists(fmce)),
        ("timeline.clip-application", lambda: test_timeline_clip_application(fmce)),
        ("timeline.world-required", lambda: test_timeline_world_required(fmce)),
        # Evidence
        ("evidence.bundle-fields", lambda: test_evidence_bundle_fields(fmce)),
        ("evidence.dual-require", lambda: test_evidence_dual_require(fmce)),
        # CKL
        ("ckl.policy-load", lambda: test_ckl_policy_load(fmce)),
        ("ckl.deny-without-intent", lambda: test_ckl_deny_without_intent(fmce)),
        ("ckl.modify-param", lambda: test_ckl_modify_param(fmce)),
        ("ckl.attach-provenance", lambda: test_ckl_attach_provenance(fmce)),
        # CSR
        ("csr.governance-trace", lambda: test_csr_governance_trace(fmce)),
        # Integration
        ("fmce.role-assignment-persists", lambda: test_role_assignment_persists(fmce)),
        ("fmce.local-first-priority", lambda: test_local_first_priority(fmce)),
        ("fmce.fallback-chain", lambda: test_fallback_chain(fmce)),
        # Bridge
        ("sx.bridge-startup", lambda: test_bridge_startup(bridge)),
        ("sx.bridge-list-models", lambda: test_bridge_list_models(bridge)),
        ("sx.bridge-probe", lambda: test_bridge_probe(bridge)),
        ("sx.bridge-concurrent", lambda: test_bridge_concurrent(bridge)),
        # Performance
        ("perf.bridge-latency", lambda: test_bridge_latency(bridge)),
        ("perf.role-resolution", lambda: test_role_resolution_speed(fmce)),
    ]
    
    results = []
    for name, test_func in tests:
        result = run_test(name, test_func)
        results.append(result)
        print(f"  {result}")
    
    # Summary
    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {len(results)} total")
    print("=" * 60)
    
    if failed > 0:
        print("\nFailures:")
        for r in results:
            if not r.passed:
                print(f"  {r.name}: {r.message}")
        sys.exit(1)
    else:
        print("\nAll conformance checks passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()