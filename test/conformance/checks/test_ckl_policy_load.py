"""
Conformance test for ckl.policy-load
"""
import pytest

from sme_core.auth.policies import ConstitutionalKnowledgeLayer


def test_ckl_policy_load():
    """Verify CKL loads all 10 policies from default.policies.json"""
    ckl = ConstitutionalKnowledgeLayer()
    
    # Should have exactly 10 policies
    assert len(ckl.policies) == 10
    
    # Check all expected policies are loaded
    expected_policies = [
        "policy-no-execution-without-intent",
        "policy-no-state-change-without-evidence",
        "policy-no-render-without-provenance",
        "policy-no-authority-without-contract",
        "policy-play-timeline-requires-world",
        "policy-ascension-drift-throttle",
        "policy-ascension-evidence",
        "policy-director-contract-required",
        "policy-director-no-execution",
        "policy-director-mcp-provenance",
    ]
    
    for policy_id in expected_policies:
        assert policy_id in ckl.policies, f"Missing policy: {policy_id}"
        
        policy = ckl.policies[policy_id]
        assert policy.policy_id == policy_id
        assert policy.severity in ["critical", "high", "medium"]
        assert policy.action in ["deny_if_false", "attach_provenance", "modify_param", "deny_if_missing_world"]