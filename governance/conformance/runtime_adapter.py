# governance/conformance/runtime_adapter.py
"""
Runtime Adapter - Adapts the governance runtime to the conformance profile
"""
from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Callable
from governance.conformance.profile import ConformanceProfile, ConformanceCheck


@dataclass
class CheckResult:
    """Result of a conformance check."""
    check_id: str
    passed: bool
    duration_ms: float = 0.0
    error: Optional[str] = None
    details: Dict = None


class RuntimeAdapter:
    """
    Runtime Adapter - Maps conformance checks to runtime verification.
    """
    
    def __init__(self, profile: 'ConformanceProfile' = None):
        self.profile = profile or ConformanceProfile()
        self.test_registry: Dict[str, Callable] = {}
    
    def register_test(self, check_id: str, test_fn: Callable):
        """Register a test function for a check."""
        self.test_registry[check_id] = test_fn
    
    def run_check(self, check: 'ConformanceCheck') -> 'CheckResult':
        """Run a single conformance check."""
        import time
        start = time.time()
        
        try:
            if check.check_id in self.test_registry:
                result = self.test_registry[check.check_id]()
                passed = bool(result)
                error = None
            else:
                # Default implementation attempts to run the named test function
                passed = self._run_default_check(check)
                error = None if passed else "Test not implemented"
        except Exception as e:
            passed = False
            error = str(e)
        
        duration_ms = (time.time() - start) * 1000
        
        return type('CheckResult', (), {
            'check_id': check.check_id,
            'passed': passed,
            'duration_ms': (time.time() - start) * 1000,
            'error': None if passed else (error or "Check failed"),
            'details': {}
        })()
    
    def _run_default_check(self, check) -> bool:
        """Run default implementation for known checks."""
        # Would implement default behavior for known checks
        return False
    
    def run_all(self) -> Dict:
        """Run all conformance checks."""
        import time
        start = time.time()
        
        results = []
        for check in self.profile.checks:
            if check.enabled:
                result = self.run_check(check)
                results.append(result)
        
        total_time = time.time() - start
        passed = sum(1 for r in results if r.passed)
        total = len(results)
        
        return {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "success_rate": passed / total if total > 0 else 0,
            "duration_seconds": total_time,
            "results": [
                {
                    "check_id": r.check_id,
                    "passed": r.passed,
                    "duration_ms": r.duration_ms,
                    "error": r.error,
                }
                for r in results
            ]
        }
    
    def run_domain(self, domain: str) -> Dict:
        """Run checks for a specific domain."""
        checks = [c for c in self.profile.checks if c.domain == domain]
        results = [self.run_check(c) for c in checks if c.enabled]
        passed = sum(1 for r in results if r.passed)
        return {
            "domain": domain,
            "total": len(results),
            "passed": passed,
            "results": [
                {"check_id": r.check_id, "passed": r.passed}
                for r in results
            ]
        }
    
    def to_junit_xml(self, results: List) -> str:
        """Export results as JUnit XML."""
        import xml.etree.ElementTree as ET
        
        testsuites = ET.Element("testsuites")
        testsuite = ET.SubElement(testsuites, "testsuite", {
            "name": "SME Conformance Checks",
            "tests": str(len(results)),
            "failures": str(len([r for r in results if not r.passed])),
            "time": str(sum(r.duration_ms for r in results) / 1000),
        })
        
        for result in results:
            testcase = ET.SubElement(testsuite, "testcase", {
                "name": result.check_id,
                "time": str(result.duration_ms / 1000),
            })
            if not result.passed:
                failure = ET.SubElement(testcase, "failure", {
                    "message": result.error or "Check failed"
                })
                failure.text = result.error
        
        return ET.tostring(testsuites, encoding='unicode')


# Default runtime adapter instance
def create_runtime_adapter() -> 'RuntimeAdapter':
    """Create a runtime adapter with default profile."""
    from governance.conformance.profile import ConformanceProfile
    profile = ConformanceProfile()
    return RuntimeAdapter(profile)