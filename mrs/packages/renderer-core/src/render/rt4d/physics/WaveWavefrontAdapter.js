/**
 * GPU wave step adapter — Phase C **declared / roadmap** (Drive-G-1).
 * Does not require navigator.gpu. Live dispatch is Phase C+.
 */
export async function stepWaveField(rhi, _waveFieldConfig, _buffers) {
  const device = rhi && /** @type {{ device?: unknown }} */ (rhi).device;
  if (!device) {
    return {
      status: "noop",
      reason:
        "WaveWavefrontAdapter: no live GPU device — use CPU WaveField.step(); GPU step is roadmap / Phase C+",
    };
  }
  throw new Error(
    "WaveWavefrontAdapter.stepWaveField: GPU wave dispatch roadmap / Phase C+; not implemented"
  );
}

export default { stepWaveField };
