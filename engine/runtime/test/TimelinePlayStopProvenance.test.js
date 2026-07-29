/**
 * Timeline play → record frames → stop → replay (beyond unit-only probes).
 * Status: **partial** E2E — exercises TimelinePlayer + ProvenanceRecorder + ReplayService.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFrameProvenance,
  ProvenanceRecorder,
} from "../ProvenanceRecorder.js";
import { ReplayService } from "../ReplayService.js";
import { TimelinePlayer } from "../../../js/engine/cinematic/TimelinePlayer.js";

function sampleTimeline() {
  return {
    id: "e2e-timeline",
    durationSec: 2,
    tracks: [
      {
        id: "track-1",
        binding: "renderer",
        clips: [
          {
            id: "clip-1",
            action: "set_param",
            startSec: 0,
            durationSec: 2,
            payload: { param: "speed", from: 1, to: 3 },
          },
        ],
      },
    ],
  };
}

describe("Timeline play/stop provenance E2E", () => {
  it("records ordered frames between play and natural stop, then replays params", () => {
    const recorder = new ProvenanceRecorder();
    const timeline = sampleTimeline();
    const player = new TimelinePlayer(timeline);
    const renderer = { speed: 0 };

    player.play();
    assert.equal(player.playing, true);

    while (player.playing) {
      player.tick(0.25, renderer);
      recorder.record(
        createFrameProvenance({
          intentId: "intent-e2e",
          timelineId: timeline.id,
          worldId: "world-e2e",
          timeSeconds: player.timeSec,
          parameters: { speed: renderer.speed },
        }),
      );
    }

    assert.equal(player.playing, false);
    assert.ok(recorder.count >= 4, "expected multiple frames during play");

    const captured = [];
    ReplayService.replay(recorder.getFrames(), {
      applyFrame(frame) {
        captured.push({ ...frame.parameters });
      },
    });

    assert.equal(captured.length, recorder.count);
    assert.ok(captured[captured.length - 1].speed >= 2.9);
  });
});
