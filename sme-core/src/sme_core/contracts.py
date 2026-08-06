"""
SME-Core — Contracts Module
Imports contracts from engine/constitution/contracts.js equivalent
"""
# This module provides access to the constitutional contracts
# The actual contracts are defined in engine/constitution/contracts.js
# This Python module provides a Python interface to those contracts

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class AuthorityResolution:
    """Result of authority resolution"""
    allowed: bool
    reason: str
    contract: Optional[str] = None
    authority: Optional[str] = None


# Contract definitions (mirroring engine/constitution/contracts.js)
CONTRACTS_DATA = {
    "contract.sme-core.v1": {
        "actor": "sme.core",
        "status": "declared",
        "authority": "coordinate",
        "allowedActions": [
            "dispatch", "collect", "validate", "check_policy",
            "resolve_conflicts", "request_approval", "publish"
        ],
        "forbiddenActions": [
            "write_code", "generate_artifacts", "mutate_models",
            "interpret", "invoke_external"
        ],
    },
    "contract.sme-txt.v1": {
        "actor": "sme.txt",
        "status": "declared",
        "authority": "infer",
        "allowedActions": [
            "generate_text", "embed_text", "produce_decision_record"
        ],
        "forbiddenActions": [
            "modify_governance", "bypass_authority", "generate_media"
        ],
    },
    "contract.sme-vis.v1": {
        "actor": "sme.vis",
        "status": "declared",
        "authority": "encode",
        "allowedActions": [
            "encode_image", "extract_features", "produce_evidence"
        ],
        "forbiddenActions": [
            "generate_images", "bypass_validation"
        ],
    },
    "contract.sme-aud.v1": {
        "actor": "sme.aud",
        "status": "declared",
        "authority": "transcribe",
        "allowedActions": [
            "transcribe_audio", "embed_audio", "produce_timecodes"
        ],
        "forbiddenActions": [
            "generate_audio", "bypass_validation"
        ],
    },
    "contract.sme-vid.v1": {
        "actor": "sme.vid",
        "status": "declared",
        "authority": "encode",
        "allowedActions": [
            "sample_frames", "encode_video", "aggregate_temporal",
            "produce_events"
        ],
        "forbiddenActions": [
            "generate_video", "bypass_resource_limits"
        ],
    },
    "contract.sme-gen.v1": {
        "actor": "sme.gen",
        "status": "declared",
        "authority": "generate",
        "allowedActions": [
            "generate_image", "generate_audio", "stitch_video",
            "offload_gpu"
        ],
        "forbiddenActions": [
            "generate_without_authority_grant", "bypass_safety_policy"
        ],
    },
    "contract.sme-log.v1": {
        "actor": "sme.log",
        "status": "declared",
        "authority": "record",
        "allowedActions": [
            "store_evidence", "index_replay", "write_audit", "verify_merkle"
        ],
        "forbiddenActions": [
            "mutate_evidence", "delete_audit_records"
        ],
    },
    "contract.director.v1": {
        "actor": "4dce.director",
        "status": "declared",
        "authority": "coordinate",
        "allowedActions": [
            "dispatch", "collect", "validate", "check_policy",
            "resolve_conflicts", "request_approval", "publish"
        ],
        "forbiddenActions": [
            "write_code", "generate_artifacts", "mutate_models",
            "interpret", "invoke_external"
        ],
    },
    "contract.user.v1": {
        "actor": "user:*",
        "status": "enforced",
        "authority": "request",
        "allowedActions": [
            "submit_intent", "poll_result", "retrieve_evidence",
            "request_replay"
        ],
        "forbiddenActions": [
            "bypass_authority", "modify_governance", "access_raw_models"
        ],
    },
}


def resolveAuthority(actor_id: str, action: str) -> AuthorityResolution:
    """Resolve authority for actor and action"""
    # Find matching contract
    contract = None
    for contract_id, contract_data in CONTRACTS_DATA.items():
        if contract_data["actor"] == actor_id or (
            contract_data["actor"].endswith(":*") and
            actor_id.startswith(contract_data["actor"][:-1])
        ):
            contract = contract_data
            break
    
    if not contract:
        return AuthorityResolution(
            allowed=False,
            reason=f"No contract found for actor: {actor_id}",
        )
    
    if action in contract["forbiddenActions"]:
        return AuthorityResolution(
            allowed=False,
            reason=f"Action {action} forbidden by {contract_id}",
            contract=contract_id,
            authority=contract["authority"],
        )
    
    if action not in contract["allowedActions"]:
        return AuthorityResolution(
            allowed=False,
            reason=f"Action {action} not in allow-list for {contract_id}",
            contract=contract_id,
            authority=contract["authority"],
        )
    
    return AuthorityResolution(
        allowed=True,
        reason="Action allowed",
        contract=contract_id,
        authority=contract["authority"],
    )


# Export for backward compatibility
CONTRACTS = {
    "resolveAuthority": resolveAuthority,
    "CONTRACTS_DATA": CONTRACTS_DATA,
}