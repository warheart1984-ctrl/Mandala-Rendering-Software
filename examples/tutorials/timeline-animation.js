/**
 * Tutorial: package Timeline / TimelinePlayer smoke (library API).
 *
 * Distinct from governed host timelines in demo/timelines/*.timeline.json
 * (those use clip/action schema consumed by js/ engine — open index.html).
 *
 *   node examples/tutorials/timeline-animation.js
 */
import {
  Timeline,
  TimelinePlayer,
} from "../../mrs/packages/renderer-core/src/timeline/TimelineEditor.js";

const target = { rotation: { theta: 0 } };
const timeline = new Timeline(4, 30);
const track = timeline.createTrack("theta", target, "rotation.theta", "linear");
track.addKeyframe(0, 0);
track.addKeyframe(2, Math.PI);
track.addKeyframe(4, Math.PI * 2);

const player = new TimelinePlayer(timeline);
player.loop = false;

const samples = [];
for (let i = 0; i <= 8; i++) {
  const t = i * 0.5;
  const result = player.seek(t);
  samples.push({ t, theta: target.rotation.theta, result });
}

console.log("TimelinePlayer seek samples (package API):");
console.log(JSON.stringify(samples, null, 2));
console.log(
  "Governed cinematic timelines: demo/timelines/ + npm start (browser host)."
);
