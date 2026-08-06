# governance/conformance/profile.py
"""
Conformance Profile - Defines the 21 conformance checks
"""
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from enum import Enum


class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"


@dataclass
class ConformanceCheck:
    """Individual conformance check definition."""
    check_id: str
    domain: str
    description: str
    severity: Severity
    test_function: Optional[str] = None
    enabled: bool = True


@dataclass
class ConformanceProfile:
    """Conformance profile with all 21 checks."""
    version: str = "1.0.0"
    profile_name: str = "default"
    checks: List[ConformanceCheck] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.checks:
            self.checks = self._default_checks()
    
    def _default_checks(self) -> List:
        """The 21 mandatory conformance checks."""
        return [
            ConformanceCheck(
                check_id="provenance.recorder-exists",
                domain="provenance",
                description="Runtime exposes ProvenanceRecorder",
                severity=Severity.CRITICAL,
                test_function="test_provenance_recorder_exists"
            ),
            ConformanceCheck(
                check_id="provenance.frame-fields",
                domain="provenance",
                description="Every frame has intentId, timelineId, worldId, timeSeconds, parameters",
                severity=Severity.CRITICAL,
                test_function="test_provenance_frame_fields"
            ),
            ConformanceCheck(
                check_id="provenance.frame-recorded-during-play",
                domain="provenance",
                description="Frames recorded between play and stop",
                severity=Severity.HIGH,
                test_function="test_provenance_frame_recorded_during_play"
            ),
            ConformanceCheck(
                check_id="replay.service-exists",
                domain="replay",
                description="ReplayService accepts frames + target",
                severity=Severity.CRITICAL,
                test_function="test_replay_service_exists"
            ),
            ConformanceCheck(
                check_id="replay.deterministic-params",
                domain="replay",
                description="Replay restores same parameter values",
                severity=Severity.CRITICAL,
                test_function="test_replay_deterministic_params"
            ),
            ConformanceCheck(
                check_id="binding.resolver-exists",
                domain="binding",
                description="BindingResolver maps track bindings to scene objects",
                severity=Severity.HIGH,
                test_function="test_binding_resolver_exists"
            ),
            ConformanceCheck(
                check_id="binding.all-tracks-resolved",
                domain="binding",
                description="Every track.binding resolves",
                severity=Severity.HIGH,
                test_function="test_binding_all_tracks_resolved"
            ),
            ConformanceCheck(
                check_id="binding.director-contract-exists",
                domain="binding",
                description="Director agent has a valid constitutional contract",
                severity=Severity.CRITICAL,
                test_function="test_binding_director_contract_exists"
            ),
            ConformanceCheck(
                check_id="timeline.loader-exists",
                domain="timeline",
                description="Can load GovernedTimelineDto from JSON",
                severity=Severity.HIGH,
                test_function="test_timeline_loader_exists"
            ),
            ConformanceCheck(
                check_id="timeline.clip-application",
                domain="timeline",
                description="Player applies set_param and render_4d clips",
                severity=Severity.HIGH,
                test_function="test_timeline_clip_application"
            ),
            ConformanceCheck(
                check_id="timeline.world-required",
                domain="timeline",
                description="play_timeline without world id is denied",
                severity=Severity.CRITICAL,
                test_function="test_timeline_world_required"
            ),
            ConformanceCheck(
                check_id="evidence.bundle-fields",
                domain="evidence",
                description="Evidence has id, worldId, timelineId",
                severity=Severity.CRITICAL,
                test_function="test_evidence_bundle_fields"
            ),
            ConformanceCheck(
                check_id="evidence.dual-require",
                domain="evidence",
                description="CKL denies when require[] evidence ids missing",
                severity=Severity.HIGH,
                test_function="test_evidence_dual_require"
            ),
            ConformanceCheck(
                check_id="ckl.policy-load",
                domain="ckl",
                description="Runtime loads default.policies.json",
                severity=Severity.CRITICAL,
                test_function="test_ckl_policy_load"
            ),
            ConformanceCheck(
                check_id="ckl.deny-without-intent",
                domain="ckl",
                description="CKL denies execution when intent null",
                severity=Severity.CRITICAL,
                test_function="test_ckl_deny_without_intent"
            ),
            ConformanceCheck(
                check_id="ckl.modify-param",
                domain="ckl",
                description="CKL modify_param adjusts params on condition",
                severity=Severity.HIGH,
                test_function="test_ckl_modify_param"
            ),
            ConformanceCheck(
                check_id="ckl.attach-provenance",
                domain="ckl",
                description="CKL sets attachProvenance for render/play",
                severity=Severity.HIGH,
                test_function="test_ckl_attach_provenance"
            ),
            ConformanceCheck(
                check_id="authority.chain-valid",
                domain="authority",
                description="Authority chains valid; Director chain does not collapse boundaries",
                severity=Severity.CRITICAL,
                test_function="test_authority_chain_valid"
            ),
            ConformanceCheck(
                check_id="governance.no-implicit-escalation",
                domain="governance",
                description="Director cannot implicitly escalate privileges",
                severity=Severity.CRITICAL,
                test_function="test_governance_no_implicit_escalation"
            ),
            ConformanceCheck(
                check_id="execution.no-cross-layer-mutation",
                domain="execution",
                description="Director cannot mutate artifacts directly",
                severity=Severity.CRITICAL,
                test_function="test_execution_no_cross_layer_mutation"
            ),
            ConformanceCheck(
                check_id="normalization.brdf-energy",
                domain="normalization",
                description="BRDF integrates to 3ρ/(4π) (from rt4d test suite)",
                severity=Severity.HIGH,
                test_function="test_normalization_brdf_energy"
            ),
        ]
    
    def get_check(self, check_id: str):
        """Get a check by ID."""
        for check in self.checks:
            if check.check_id == check_id:
                return check
        return None
    
    def get_by_domain(self, domain: str) -> List:
        """Get all checks for a domain."""
        return [c for c in self.checks if c.domain == domain]
    
    def get_by_severity(self, severity) -> List:
        """Get all checks by severity."""
        return [c for c in self.checks if c.severity == severity]
    
    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "profile_name": self.profile_name,
            "checks": [
                {
                    "check_id": c.check_id,
                    "domain": c.domain,
                    "description": c.description,
                    "severity": c.severity.value if hasattr(c.severity, 'value') else c.severity,
                    "test_function": c.test_function,
                    "enabled": c.enabled,
                }
                for c in self.checks
            ]
        }


def get_default_profile() -> 'ConformanceProfile':
    """Get the default conformance profile with all 21 checks."""
    return ConformanceProfile()