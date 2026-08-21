import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState, freezeCertifiedSnapshot } from "../../proto/certified-state.mjs";
import { speak, MYTHAR_STATUS } from "../mythar/index.mjs";

describe("Mythar organ", () => {
  it("writes a sound-lattice WAV from η / |∇φ| without mutating certified hash", () => {
    const state = createInitialCertifiedState({ seed: 4 });
    const hash = state.hash;
    const spoken = speak(freezeCertifiedSnapshot(state), { tryTts: false });
    assert.equal(MYTHAR_STATUS, "partial");
    assert.equal(spoken.mutatesCertified, false);
    assert.equal(spoken.wav.slice(0, 4).toString("ascii"), "RIFF");
    assert.equal(spoken.wav.slice(8, 12).toString("ascii"), "WAVE");
    assert.ok(spoken.lattice.freq > 0);
    assert.equal(spoken.tts.status, "skipped");
    assert.equal(state.hash, hash);
  });
});
