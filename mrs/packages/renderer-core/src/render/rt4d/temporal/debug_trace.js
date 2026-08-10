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

console.log("=== Manual validation trace ===");

// REQUIRED check
const REQUIRED = [
  "operationId",
  "operationType",
  "sourceTimelineId",
  "resultTimelineId",
  "metric",
  "parentStateHash",
  "resultStateHash",
  "replayToken",
  "evidenceStatus",
];

console.log("REQUIRED check:");
for (const key of REQUIRED) {
  if (envelope[key] === undefined || envelope[key] === null || envelope[key] === "") {
    console.log("MISSING:", key);
  } else {
    console.log("OK:", key);
  }
}

const errors = [];

// operationType check
if (envelope.operationType && !["fork", "merge", "split"].includes(envelope.operationType)) {
  console.log("Invalid operationType");
}

// evidenceStatus check
if (envelope.evidenceStatus && !["draft", "substrate_verified", "declared"].includes(envelope.evidenceStatus)) {
  console.log("Invalid evidenceStatus");
}

// metric check
if (envelope.metric && typeof envelope.metric !== "object") {
  console.log("Invalid metric");
}

// evolutionLaw check
console.log("evolutionLaw:", envelope.evolutionLaw);
if (envelope.evolutionLaw != null) {
  console.log("evolutionLaw block would run");
} else {
  console.log("evolutionLaw is null/undefined, skipping block");
}

// replayStatus check
console.log("replayStatus:", envelope.replayStatus);
console.log("replayStatus != null:", envelope.replayStatus != null);
console.log("includes check:", ["verified", "failed", "declared"].includes(envelope.replayStatus));

const replayStatusErrors = [];
if (
  envelope.replayStatus != null &&
  !["verified", "failed", "declared"].includes(envelope.replayStatus)
) {
  console.log("WOULD PUSH replayStatus error");
} else {
  console.log("Would NOT push replayStatus error");
}

const result = validateTemporalEvidenceEnvelope(envelope);
console.log("=== Actual function result ===");
console.log("ok:", result.ok);
console.log("errors:", JSON.stringify(result.errors, null, 2));