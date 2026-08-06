"""
Conformance test for provenance.recorder-exists
"""
import pytest

from sme_core.evr.engine import ProvenanceRecorder


def test_provenance_recorder_exists():
    """Verify ProvenanceRecorder is available and functional"""
    recorder = ProvenanceRecorder()
    
    # Should have all required methods
    assert hasattr(recorder, 'start_recording')
    assert hasattr(recorder, 'stop_recording')
    assert hasattr(recorder, 'record_frame')
    assert hasattr(recorder, 'get_frames')
    
    # Should work end-to-end
    recorder.start_recording("test-intent")
    frame = recorder.record_frame(
        parameters={"test": "value"},
        substrate="CPU_AVX2",
    )
    frames = recorder.stop_recording()
    
    assert frame is not None
    assert len(frames) == 1
    assert frames[0].parameters == {"test": "value"}