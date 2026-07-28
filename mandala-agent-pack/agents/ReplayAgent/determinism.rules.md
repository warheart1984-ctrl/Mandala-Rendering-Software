# Determinism Rules

1. Replay must restore identical parameter values for the same timeline.
2. Frames must be recorded in order between play and stop.
3. Every frame must carry intentId, timelineId, worldId, timeSeconds, parameters.
4. Replay output must be bit-identical for the same input parameters.
5. No time-dependent or random behavior in replay path.
