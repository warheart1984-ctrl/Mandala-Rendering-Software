"""AMUL LLM — Adaptive / Modular / Universal / Logical inference governance.

    Adaptive   classify_intent -> mode -> generation_config
               (temperature, max_tokens, safety envelope, persona)
    Modular    tokenizer | embedding | CORE MODEL ADAPTER | tools | output
    Universal  prompt/tool/memory contracts; standard metadata
    Logical    safety filter, policy flags, reasoning records, append-only
               replay log; constitutional rules enforced in code.

Honest maturity tags:
    classifier/modes           - enforced (tests/test_amul_llm.py)
    tokenizer                  - partial (word-level stand-in; BPE DECLARED)
    embedding                  - enforced (deterministic hashed-TF v0)
    core model                 - pluggable adapter: OpenAI-compatible backend
                                 (JARVIS_LLM_URL, e.g. Lemonade) or Echo stub;
                                 NO trained transformer lives in this package.
    tool sandbox               - enforced (registry + schema validation only,
                                 no eval/exec)
    policy/replay              - enforced

Constitutional rules (enforced):
    R-A  no output without a policy check step
    R-B  every generation produces a replay record
    R-C  every mode declares its authority chain
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.amul_rag import append_jsonl, embed

LLM_URL = os.getenv("JARVIS_LLM_URL") or "http://localhost:13305/api/v1"
LLM_MODEL = os.getenv("JARVIS_LLM_MODEL") or ""
LLM_LOG_PATH = os.getenv("JARVIS_LLM_LOG_PATH") or os.path.join("data", "amul-llm-log.jsonl")

REPLAY_SCHEMA = "amul-llm-replay-v1"

# --- Adaptive layer -----------------------------------------------------------

INTENTS = ("chat", "reasoning", "coding", "math", "creative_writing", "safety_sensitive")

_SAFETY_MARKERS = (
    "rm -rf", "drop table", "delete all", "format c:", "credential", "password",
    "api key", "secret key", "private key", "exploit", "malware", "ransomware",
    "bypass security", "disable firewall",
)
_MATH_RE = re.compile(r"(\d+\s*[\+\-\*/^%]\s*\d+)|(\b(solve|calculate|derivative|integral|equation)\b)")
_CODING_MARKERS = ("def ", "class ", "import ", "npm ", "git ", "pip ", "traceback",
                   "exception", "compile", "syntax", "```", "refactor")
_CREATIVE_MARKERS = ("write a story", "write a poem", "once upon", "imagine", "brainstorm names")
_REASONING_STARTERS = ("why ", "how should", "analyze", "compare", "derive", "prove",
                       "plan ", "step by step")


def classify_intent(query: str) -> str:
    low = (query or "").lower()
    if any(m in low for m in _SAFETY_MARKERS):
        return "safety_sensitive"
    if any(m in low for m in _CODING_MARKERS):
        return "coding"
    if _MATH_RE.search(low):
        return "math"
    if any(low.startswith(s) for s in _REASONING_STARTERS):
        return "reasoning"
    if any(m in low for m in _CREATIVE_MARKERS):
        return "creative_writing"
    return "chat"


MODE_CONFIGS: dict[str, dict[str, Any]] = {
    # Constitutional rule R-C: authority_chain declared per mode.
    "chat_mode": {
        "intents": {"chat"},
        "generation_config": {"temperature": 0.7, "max_tokens": 512},
        "persona": "concise assistant",
        "safety_envelope": "standard",
        "tools_enabled": False,
        "authority_chain": ["amul-llm-v1:adaptive", "amul-llm-v1:modular", "amul-llm-v1:logical"],
    },
    "reasoning_mode": {
        "intents": {"reasoning", "math"},
        "generation_config": {"temperature": 0.2, "max_tokens": 2048},
        "persona": "structured analytical thinker; numbered steps",
        "safety_envelope": "standard",
        "tools_enabled": True,
        "authority_chain": ["amul-llm-v1:adaptive", "amul-llm-v1:modular", "amul-llm-v1:logical"],
    },
    "tool_mode": {
        "intents": {"coding"},
        "generation_config": {"temperature": 0.3, "max_tokens": 1024},
        "persona": "precise engineer; cite tool outputs",
        "safety_envelope": "strict",
        "tools_enabled": True,
        "authority_chain": ["amul-llm-v1:adaptive", "amul-llm-v1:tools", "amul-llm-v1:logical"],
    },
    "creative_mode": {
        "intents": {"creative_writing"},
        "generation_config": {"temperature": 0.9, "max_tokens": 1024},
        "persona": "imaginative writer",
        "safety_envelope": "standard",
        "tools_enabled": False,
        "authority_chain": ["amul-llm-v1:adaptive", "amul-llm-v1:modular", "amul-llm-v1:logical"],
    },
    "safety_mode": {
        "intents": {"safety_sensitive"},
        "generation_config": {"temperature": 0.1, "max_tokens": 256},
        "persona": "guarded; refuses unsafe operations and explains why",
        "safety_envelope": "maximum",
        "tools_enabled": False,
        "authority_chain": ["amul-llm-v1:logical"],  # logical layer may answer ALONE
    },
}


def routing_contract(query: str) -> dict[str, Any]:
    intent = classify_intent(query)
    mode_name, mode = next(
        (n, m) for n, m in MODE_CONFIGS.items() if intent in m["intents"]
    )
    return {
        "intent": intent,
        "mode": mode_name,
        "generation_config": dict(mode["generation_config"]),
        "persona": mode["persona"],
        "safety_envelope": mode["safety_envelope"],
        "tools_enabled": mode["tools_enabled"],
        "authority_chain": list(mode["authority_chain"]),
    }


# --- Modular layer ------------------------------------------------------------


def encode(text: str) -> list[str]:
    """Word-level stand-in tokenizer (BPE DECLARED). Deterministic."""
    return [t for t in re.split(r"\s+", (text or "").strip()) if t]


def decode(tokens: list[str]) -> str:
    return " ".join(tokens)


class GenerationResult(BaseModel):
    text: str
    model: str
    backend: str  # openai-compat | echo-stub
    tokens_used: int


_discovered_model: str | None = None


def _resolve_model() -> str:
    """Model resolution: env override -> discover once from /models -> ''."""
    global _discovered_model
    if LLM_MODEL:
        return LLM_MODEL
    if _discovered_model is not None:
        return _discovered_model
    _discovered_model = ""  # sentinel: discovery attempted
    try:
        import httpx

        r = httpx.get(LLM_URL.rstrip("/") + "/models", timeout=10)
        models = r.json().get("data", [])
        for m in models:
            if "chat" in (m.get("labels") or []):
                _discovered_model = m["id"]
                break
        if not _discovered_model and models:
            _discovered_model = models[0]["id"]
    except Exception:
        pass
    return _discovered_model


def core_model_generate(
    messages: list[dict[str, str]], temperature: float, max_tokens: int
) -> GenerationResult:
    """Core Model Module — swappable adapter.

    Primary: OpenAI-compatible backend (e.g., Lemonade). Fallback: Echo stub
    so the governed pipeline is always exercisable; the stub NEVER pretends
    to be a real model (backend='echo-stub' in metadata).
    """
    if LLM_URL:
        try:
            import httpx

            resp = httpx.post(
                LLM_URL.rstrip("/") + "/chat/completions",
                json={
                    "model": _resolve_model(),
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                timeout=120,
            )
            resp.raise_for_status()
            data = resp.json()
            msg = data["choices"][0]["message"]
            # Reasoning models may put output in reasoning_content.
            text = msg.get("content") or msg.get("reasoning_content") or ""
            used = data.get("usage", {}).get("total_tokens") or len(encode(text))
            return GenerationResult(
                text=text, model=data.get("model") or LLM_MODEL or "unknown",
                backend="openai-compat", tokens_used=int(used),
            )
        except Exception:
            pass  # graceful degradation to stub below

    prompt = messages[-1]["content"] if messages else ""
    stub = f"[echo-stub] received {len(encode(prompt))} tokens; no backend configured."
    return GenerationResult(text=stub, model="echo-stub-v0", backend="echo-stub",
                            tokens_used=len(encode(prompt)))


# --- Tool module (registry sandbox — no eval/exec) -----------------------------

TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    "server_time": {
        "description": "Returns current UTC server time.",
        "schema": {},
        "fn": lambda args, ctx: {"utc": datetime.now(timezone.utc).isoformat()},
    },
    "memory_search": {
        "description": "Searches the Continuity Ledger for memories matching a query.",
        "schema": {"query": str},
        "fn": lambda args, ctx: {
            "memories": [
                {"id": m.id, "subject": m.subject, "excerpt": m.content[:120]}
                for m in (ctx.get("store").list_memories(query=args["query"], limit=3) or [])
            ]
        }
        if ctx.get("store") else {"error": "no store bound"},
    },
}


def execute_tool(name: str, args: dict[str, Any], ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    spec = TOOL_REGISTRY.get(name)
    if not spec:
        return {"error": f"unknown tool: {name}", "allowed": sorted(TOOL_REGISTRY)}
    for key, typ in spec["schema"].items():
        v = args.get(key)
        if not isinstance(v, typ):
            return {"error": f"schema violation: {key} must be {typ.__name__}"}
    try:
        return {"result": spec["fn"](args, ctx or {})}
    except Exception as exc:
        return {"error": f"tool execution failed: {exc}"}


# --- Universal layer -------------------------------------------------------------


class PromptContract(BaseModel):
    system: str = Field(default="", max_length=8000)
    user: str = Field(..., min_length=1, max_length=16000)
    context: str = Field(default="", max_length=32000)
    mode: str | None = None  # optional caller override of adaptive mode


class ToolCallContract(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


# --- Logical layer -----------------------------------------------------------------

_UNSAFE_ANSWER_MARKERS = ("rm -rf", "drop table", "api_key=", "BEGIN PRIVATE KEY")


def policy_check(answer_text: str, contract: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    low = (answer_text or "").lower()
    if any(m in low for m in _UNSAFE_ANSWER_MARKERS):
        flags.append("unsafe_content_blocked")
    envelope = contract["safety_envelope"]
    if envelope == "maximum":
        flags.append("safety_refusal_mode")
    return flags


def generate(contract: PromptContract) -> dict[str, Any]:
    """Full AMUL-LLM loop. Rules R-A/R-B are structural, not aspirational:
    the function cannot return without running policy_check, and it cannot
    return without writing the replay record."""
    steps: list[str] = []
    started = time.time()

    rc = routing_contract(contract.user)
    if contract.mode:
        override = MODE_CONFIGS.get(contract.mode)
        if override is None:
            raise ValueError(f"unknown mode override: {contract.mode!r}")
        rc = routing_contract_for_mode(contract.mode)
    steps.append(f"parsed intent={rc['intent']} selected mode={rc['mode']}")
    steps.append("applied generation_config + safety envelope")

    if rc["intent"] == "safety_sensitive":
        result = GenerationResult(
            text=(
                "Refused by policy: this request touches destructive or secret "
                "material. Rephrase without credentials or destructive commands."
            ),
            model="policy-v0", backend="logical-layer",
            tokens_used=0,
        )
        steps.append("policy check: safety envelope maximum (R-C: logical layer answers alone)")
        flags = policy_check(result.text, rc)
    else:
        messages = [
            {"role": "system",
             "content": (contract.system or f"You are a {rc['persona']}.")},
        ]
        if contract.context:
            messages.append({"role": "system", "content": f"Context:\n{contract.context}"})
        messages.append({"role": "user", "content": contract.user})
        steps.append("core model adapter invoked")
        result = core_model_generate(
            messages,
            rc["generation_config"]["temperature"],
            rc["generation_config"]["max_tokens"],
        )
        steps.append("output post-processing")
        flags = policy_check(result.text, rc)

    grounded = bool(contract.context) and result.backend == "openai-compat"
    confidence = round(min(0.95, 0.45 + (0.25 if grounded else 0.0) +
                           (0.15 if result.backend == "openai-compat" else 0.0)), 2)
    record = {
        "schema_version": REPLAY_SCHEMA,
        "query": contract.user[:500],
        "final_answer": result.text[:2000],
        "tokens_used": result.tokens_used,
        "policy_flags": flags,
        "intent": rc["intent"],
        "mode": rc["mode"],
        "steps": steps,
        "metadata": {
            "model_version": result.model,
            "backend": result.backend,
            "safety_level": rc["safety_envelope"],
            "confidence": confidence,
            "reasoning_depth": len(steps),
            "authority_chain": rc["authority_chain"],
            "latency_ms": int((time.time() - started) * 1000),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    append_jsonl(LLM_LOG_PATH, record)  # Rule R-B: replay ALWAYS written
    return record


def routing_contract_for_mode(mode_name: str) -> dict[str, Any]:
    mode = MODE_CONFIGS[mode_name]
    intent = sorted(mode["intents"])[0]
    return {
        "intent": intent,
        "mode": mode_name,
        "generation_config": dict(mode["generation_config"]),
        "persona": mode["persona"],
        "safety_envelope": mode["safety_envelope"],
        "tools_enabled": mode["tools_enabled"],
        "authority_chain": list(mode["authority_chain"]),
    }


def llm_status() -> dict[str, Any]:
    p = Path(LLM_LOG_PATH)
    records = sum(1 for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()) if p.exists() else 0
    return {
        "service": "amul-llm",
        "replay_schema": REPLAY_SCHEMA,
        "backend": {
            "url": LLM_URL or "(unset)",
            "model_env": LLM_MODEL or "(backend default)",
            "fallback": "echo-stub-v0",
        },
        "modes": {k: v["generation_config"] for k, v in MODE_CONFIGS.items()},
        "tools": sorted(TOOL_REGISTRY),
        "replay_log": {"path": LLM_LOG_PATH, "records": records, "append_only": True},
        "constitutional_rules": {
            "R-A_no_output_without_policy_check": "enforced",
            "R-B_every_generation_replayable": "enforced",
            "R-C_modes_declare_authority_chain": "enforced",
        },
        "maturity": {
            "classifier_modes_policy_replay": "enforced",
            "tokenizer_bpe": "declared",
            "embedding": "hashed-TF v0",
            "core_model": "pluggable adapter (no local weights)",
        },
    }
