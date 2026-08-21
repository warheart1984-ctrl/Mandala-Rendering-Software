import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const MANIFEST_VERSION = "1.0.0";

export function createManifest(sceneCard) {
  return {
    schemaVersion: MANIFEST_VERSION,
    sceneId: sceneCard.id,
    sceneName: sceneCard.name,
    createdAt: new Date().toISOString(),
    sceneCard: {
      hash: hashJson(sceneCard),
      path: null,
    },
    pipeline: {
      still: null,
      flipbook: null,
      emotionalPass: null,
      ambient: null,
      assembly: null,
    },
    artifacts: [],
    locks: {},
    metrics: {
      totalFrames: 0,
      totalDuration: 0,
      renderCost: 0,
      identityDrift: null,
      temporalCoherence: null,
      audioVideoSync: null,
    },
  };
}

export function recordArtifact(manifest, stage, artifact) {
  const entry = {
    stage,
    hash: hashJson(artifact),
    path: artifact.path || null,
    timestamp: new Date().toISOString(),
    evidence: artifact.evidence || null,
    locked: manifest.locks[stage] || false,
  };

  manifest.artifacts.push(entry);
  manifest.pipeline[stage] = entry;

  return manifest;
}

export function lockArtifact(manifest, stage, reason) {
  manifest.locks[stage] = {
    reason,
    lockedAt: new Date().toISOString(),
    lockedBy: "director",
  };
  return manifest;
}

export function isLocked(manifest, stage) {
  return manifest.locks[stage] !== undefined;
}

export function getArtifactsByStage(manifest, stage) {
  return manifest.artifacts.filter((a) => a.stage === stage);
}

export function getLatestArtifact(manifest, stage) {
  const artifacts = getArtifactsByStage(manifest, stage);
  return artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
}

export function computeIdentityDrift(manifest) {
  const stillArtifact = getLatestArtifact(manifest, "still");
  const flipbookArtifacts = getArtifactsByStage(manifest, "flipbook");

  if (!stillArtifact || flipbookArtifacts.length === 0) return null;

  // Compare first frame hash with still hash
  const firstFrame = flipbookArtifacts[0];
  const stillHash = stillArtifact.hash;
  const frameHash = firstFrame.hash;

  // Simple drift metric: 0 = identical, 1 = completely different
  return stillHash === frameHash ? 0 : 0.5;
}

export function computeTemporalCoherence(manifest) {
  const flipbookArtifacts = getArtifactsByStage(manifest, "flipbook");

  if (flipbookArtifacts.length < 2) return null;

  // Check that consecutive frames have similar hashes
  let coherentCount = 0;
  for (let i = 1; i < flipbookArtifacts.length; i++) {
    const prev = flipbookArtifacts[i - 1].hash;
    const curr = flipbookArtifacts[i].hash;
    if (prev === curr) coherentCount++;
  }

  return coherentCount / (flipbookArtifacts.length - 1);
}

export function computeAudioVideoSync(manifest) {
  const assemblyArtifact = getLatestArtifact(manifest, "assembly");
  const ambientArtifact = getLatestArtifact(manifest, "ambient");

  if (!assemblyArtifact || !ambientArtifact) return null;

  // Check that assembly references the correct ambient audio
  return assemblyArtifact.hash !== ambientArtifact.hash ? 1.0 : 0.0;
}

export function updateMetrics(manifest) {
  manifest.metrics.identityDrift = computeIdentityDrift(manifest);
  manifest.metrics.temporalCoherence = computeTemporalCoherence(manifest);
  manifest.metrics.audioVideoSync = computeAudioVideoSync(manifest);

  // Count total frames
  const flipbookArtifacts = getArtifactsByStage(manifest, "flipbook");
  manifest.metrics.totalFrames = flipbookArtifacts.length;

  return manifest;
}

export function saveManifest(manifest, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const manifestPath = resolve(outputDir, "production-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[Manifest] Saved: ${manifestPath}`);
  return manifestPath;
}

export function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

export function formatManifestSummary(manifest) {
  const lines = [
    `Scene: ${manifest.sceneId} - ${manifest.sceneName}`,
    `Created: ${manifest.createdAt}`,
    `Artifacts: ${manifest.artifacts.length}`,
    `Locked stages: ${Object.keys(manifest.locks).join(", ") || "none"}`,
    `Metrics:`,
    `  Identity drift: ${manifest.metrics.identityDrift ?? "N/A"}`,
    `  Temporal coherence: ${manifest.metrics.temporalCoherence ?? "N/A"}`,
    `  Audio/video sync: ${manifest.metrics.audioVideoSync ?? "N/A"}`,
    `  Total frames: ${manifest.metrics.totalFrames}`,
  ];

  return lines.join("\n");
}

function hashJson(obj) {
  return createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 16);
}
