# governance/policies/default_policies.py
"""
Default Policies - Constitutional policies loaded at startup.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from pathlib import Path
import json


@dataclass
class Policy:
    """Policy definition."""
    policy_id: str
    scope: str
    severity: str  # "critical", "high", "medium"
    action: str    # "deny_if_false", "attach_provenance", "modify_param"
    condition: str
    description: str = ""


@dataclass
class PolicySet:
    """Collection of policies."""
    policies: Dict[str, any] = field(default_factory=dict)
    
    def get_policy(self, policy_id: str):
        return self.policies.get(policy_id)
    
    def evaluate(self, policy_id: str, context: Dict) -> bool:
        """Evaluate a policy against context."""
        policy = self.get_policy(policy_id)
        if not policy:
            return True
        # Simplified evaluation - would use actual condition evaluator
        return True


def load_default_policies(policy_path: str = None) -> Dict:
    """
    Load default policies from file or return built-in defaults.
    Matches the 10 policies from default.policies.json
    """
    
    default_policies = {
        "policy-no-execution-without-intent": {
            "policyId": "policy-no-execution-without-intent",
            "scope": "runtime",
            "severity": "critical",
            "action": "deny_if_false",
            "condition": "intent != null",
            "description": "Every execution must have a declared UserIntent with intentId"
        },
        "policy-no-state-change-without-evidence": {
            "policyId": "policy-no-state-change-without-evidence",
            "scope": "state",
            "severity": "high",
            "action": "deny_if_false",
            "condition": "evidence != null",
            "description": "Every state mutation must produce an EvidenceRecord"
        },
        "policy-no-render-without-provenance": {
            "policyId": "policy-no-render-without-provenance",
            "scope": "render",
            "severity": "high",
            "action": "attach_provenance",
            "condition": "always",
            "description": "Every render/generation must carry provenance metadata"
        },
        "policy-no-authority-without-contract": {
            "policyId": "policy-no-authority-without-contract",
            "scope": "authority",
            "severity": "critical",
            "action": "deny_if_false",
            "condition": "actor.contract != null",
            "description": "Actors must have a registered authority contract"
        },
        "policy-play-timeline-requires-world": {
            "policyId": "policy-play-timeline-requires-world",
            "scope": "timeline",
            "severity": "critical",
            "action": "deny_if_missing_world",
            "condition": "play_timeline",
            "description": "play_timeline requires a valid world id"
        },
        "policy-ascension-drift-throttle": {
            "policyId": "policy-ascension-drift-throttle",
            "scope": "render",
            "severity": "medium",
            "action": "modify_param",
            "condition": "drift > 0.7",
            "description": "Throttle generation speed when ascension drift exceeds threshold"
        },
        "policy-ascension-evidence": {
            "policyId": "policy-ascension-evidence",
            "scope": "runtime",
            "severity": "critical",
            "action": "deny_if_false",
            "condition": "dual_evidence",
            "description": "Mythar Ascension requires dual evidence (intent + provenance)"
        },
        "policy-director-contract-required": {
            "policyId": "policy-director-contract-required",
            "scope": "authority",
            "severity": "critical",
            "action": "deny_if_false",
            "condition": "director.contract != null",
            "description": "Director agent must have a valid constitutional contract"
        },
        "policy-director-no-execution": {
            "policyId": "policy-director-no-execution",
            "scope": "execution",
            "severity": "critical",
            "action": "deny_if_false",
            "condition": "director.action in forbidden",
            "description": "Director cannot perform forbidden actions"
        },
        "policy-director-mcp-provenance": {
            "policyId": "policy-director-mcp-provenance",
            "scope": "render",
            "severity": "high",
            "action": "attach_provenance",
            "condition": "director.mcp_invocation",
            "description": "All Director MCP invocations must carry provenance"
        },
    }
    
    return default_policies


def load_policies_from_file(path: str) -> Dict:
    """Load policies from JSON file."""
    import json
    with open(path, 'r') as f:
        data = json.load(f)
    return data.get("policies", {})


def get_default_policies() -> Dict:
    """Get the default policy set."""
    return load_default_policies()


def validate_policy(policy: Dict, context: Dict) -> tuple[bool, str]:
    """
    Validate a policy against a context.
    Returns (valid, error_message)
    """
    # Simplified validation - would use actual condition evaluator
    return True, ""