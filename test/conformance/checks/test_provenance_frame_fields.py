"""
Conformance test for provenance.frame-fields
"""
import pytest

from sme_core.evr.engine import ProvenanceRecorder


def test_provenance_frame_fields():
    """Verify all required frame fields are present"""
    recorder = ProvenanceRecorder()
    recorder.start_recording("test-intent", "world-test", "timeline-test")
    
    frame = recorder.record_frame(
        parameters={"layer": 0, "op": "matmul"},
        substrate="CPU_AVX2",
        shapes={"A": [1, 768]},
        dtypes={"A": "float32"},
        seed=42,
    )
    
    recorder.stop_recording()
    
    # Check all required fields
    required_fields = ["frame_id", "intent_id", "world_id", "timeline_id", 
                       "time_seconds", "parameters"]
    
    frame_dict = frame.to_dict()
    
    for field in required_fields:
        assert field in frame_dict, f"Missing required field: {field}"
    
    # Check field types
    assert isinstance(frame_dict["frame_id"], str)
    assert isinstance(frame_dict["intent_id"], str)
    assert isinstance(frame_dict["world_id"], str)
    assert isinstance(frame_dict["timeline_id"], str)
    assert isinstance(frame_dict["time_seconds"], float)
    assert isinstance(frame_dict["parameters"], dict)
    
    # Check specific values
    assert frame_dict["intent_id"] == "test-intent"
    assert frame_dict["world_id"] == "world-test"
    assert frame_dict["timeline_id"] == "timeline-test"
    assert frame_dict["parameters"] == {"layer": 0, "op": "matmul"}