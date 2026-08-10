import { validateTemporalEvidenceEnvelope } from "./TemporalEvidenceEnvelope.js";

const envelope = {
  operationId: "op-1",
  operationType: "fork",
  sourceTimelineId: "tl-1",
  resultTimelineId: "tl-2",
  metric: { type: "euclidean" },
  parentStateHash: "hash-1",
  resultStateHash: "hash-2",
  replayToken: "token",
  evidenceStatus: "draft",
  replayStatus: "invalid",
};

const errors = [];
if (
  envelope.replayStatus != null &&
  !["verified", "failed", "declared"].includes(envelope.replayStatus)
) {
  console.log("Would push error for replayStatus");
} else {
  console.log("Would NOT push error for replayStatus");
}

console.log("replayStatus:", envelope.replayStatus);
console.log("replayStatus != null:", envelope.replayStatus != null);
console.log("includes check:", ["verified", "failed", "declared"].includes(envelope.replayStatus));
console.log("Condition result:", envelope.replayStatus != null && !["verified", "failed", "declared"].includes(envelope.replayStatus));

const result = validateTemporalEvidenceEnvelope(envelope);
console.log("Result:", result);