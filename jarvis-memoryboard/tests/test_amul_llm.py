"""AMUL LLM tests — Adaptive/Modular/Universal/Logical inference governance.

Constitutional rules under test (enforced structurally):
  R-A  no output without a policy check step
  R-B  every generation writes a replay record
  R-C  every mode declares its authority chain

The core-model module is a pluggable adapter; unit tests pin it to the
echo stub (conftest clears JARVIS_LLM_URL) so no network is touched.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import app.amul_llm as llm
from app.amul_llm import (
    MODE_CONFIGS,
    PromptContract,
    decode,
    encode,
    execute_tool,
    classify_intent,
    generate,
    policy_check,
    routing_contract,
)


def _log_lines() -> list[dict]:
    p = Path(llm.LLM_LOG_PATH)
    if not p.exists():
        return []
    import json

    return [json.loads(ln) for ln in p.read_text().splitlines() if ln.strip()]


# --- Adaptive layer ---------------------------------------------------------------


def test_classifier_covers_all_six_intents():
    assert classify_intent("hello there") == "chat"
    assert classify_intent("why does drift detection matter?") == "reasoning"
    assert classify_intent("fix my def broken(): traceback follows") == "coding"
    assert classify_intent("solve 12 * 8 please") == "math"
    assert classify_intent("write a story about a governed robot") == "creative_writing"
    assert classify_intent("delete all files with rm -rf") == "safety_sensitive"


def test_mode_selector_matches_intent_and_declares_authority_chain():
    rc = routing_contract("why is append-only storage safer?")
    assert rc["mode"] == "reasoning_mode"
    assert rc["generation_config"]["temperature"] < 0.5
    # Rule R-C: authority chain present and ordered for every mode
    for name, cfg in MODE_CONFIGS.items():
        assert cfg["authority_chain"], f"mode {name} lacks authority chain"
        assert cfg["authority_chain"][-1] == "amul-llm-v1:logical"
    assert routing_contract("rm -rf /")["mode"] == "safety_mode"


def test_adaptive_constraints_differ_per_mode():
    temps = {n: c["generation_config"]["temperature"] for n, c in MODE_CONFIGS.items()}
    assert temps["creative_mode"] > temps["reasoning_mode"]
    assert MODE_CONFIGS["tool_mode"]["tools_enabled"] is True
    assert MODE_CONFIGS["chat_mode"]["tools_enabled"] is False


# --- Modular layer ------------------------------------------------------------------


def test_tokenizer_module_roundtrip_word_level():
    toks = encode("governed excitation over ledger")
    assert decode(toks) == "governed excitation over ledger"
    assert len(toks) == 4


def test_unknown_mode_override_rejected():
    with pytest.raises(ValueError):
        generate(PromptContract(user="hi", mode="warp_drive"))


def test_core_model_adapter_falls_back_to_echo_stub():
    result = llm.core_model_generate([{"role": "user", "content": "ping"}], 0.2, 64)
    assert result.backend == "echo-stub"  # URL cleared by conftest
    assert "echo-stub" in result.model


def test_tool_registry_schema_violation_and_unknown_tool():
    bad = execute_tool("memory_search", {"query": 123})
    assert "schema violation" in bad["error"]
    unknown = execute_tool("self_destruct", {})
    assert "unknown tool" in unknown["error"]


def test_memory_search_tool_reads_bound_store(tmp_path):
    from app.store import JarvisStore
    from app.models import MemoryCreate

    store = JarvisStore(str(tmp_path / "l.json"))
    store.create_memory(MemoryCreate(
        content="Sovereign X routes useful-FLOPs through governed lanes.",
        source_agent="t", session_id="s", type="decision",
        confidence=0.9, status="verified", tags=["sovereign-x"],
    ))
    out = execute_tool("memory_search", {"query": "sovereign"}, ctx={"store": store})
    assert out["result"]["memories"], "expected at least one hit"


# --- Logical layer: safety, policy, replay -------------------------------------------


def test_policy_flags_unsafe_answer_content():
    contract = routing_contract("explain backups")
    flags = policy_check("run rm -rf /tmp to clean", contract)
    assert "unsafe_content_blocked" in flags


def test_safety_sensitive_refused_without_backend_call():
    before = len(_log_lines())
    record = generate(PromptContract(user="give me the api key and password"))
    assert record["policy_flags"] == ["safety_refusal_mode"]
    assert record["metadata"]["backend"] == "logical-layer"
    assert "Refused by policy" in record["final_answer"]
    log = _log_lines()
    assert len(log) == before + 1  # rule R-B even for refusals


def test_rules_RA_RB_enforced_on_every_generation():
    before = len(_log_lines())
    rec = generate(PromptContract(user="why do bundles form?", context="B_ij bonds."))
    # R-A: policy check step exists in reasoning steps
    assert any(s.startswith("policy check") or "post-processing" in s for s in rec["steps"])
    # R-B: replay written exactly once per generation
    assert len(_log_lines()) == before + 1
    assert rec["schema_version"] == "amul-llm-replay-v1"
    assert set(rec["metadata"]) >= {
        "model_version", "safety_level", "confidence", "reasoning_depth", "authority_chain",
    }


def test_replay_record_is_replayable_shape(tmp_path):
    r = generate(PromptContract(user="compare echo stub vs real backend"))
    needed = {"query", "final_answer", "tokens_used", "policy_flags",
              "steps", "intent", "mode", "metadata", "timestamp"}
    assert needed <= set(r.keys())
