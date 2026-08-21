#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import {
  createManifest,
  recordArtifact,
  lockArtifact,
  updateMetrics,
  saveManifest,
  formatManifestSummary,
} from "./production-manifest.mjs";

const SCENE_CARDS_DIR = resolve(import.meta.dirname, "scene-cards");
const OUTPUT_DIR = resolve(import.meta.dirname, "../output/test-movie");
const FFMPEG = resolve(import.meta.dirname, "../runtime/toolchain/ffmpeg/usr/bin/ffmpeg");

const QUALITY = {
  width: 256,
  height: 256,
  samples: 8,
  maxDepth: 3,
  fps: 12,
};

function listSceneCards() {
  return readdirSync(SCENE_CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => resolve(SCENE_CARDS_DIR, f));
}

function runPipeline(sceneCardPath, outputDir) {
  const sceneCard = JSON.parse(readFileSync(sceneCardPath, "utf8"));
  const sceneId = sceneCard.id;
  const sceneDir = resolve(outputDir, sceneId);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scene: ${sceneId} - ${sceneCard.name}`);
  console.log(`${"=".repeat(60)}`);

  // Create production manifest
  const manifest = createManifest(sceneCard);
  manifest.sceneCard.path = sceneCardPath;

  // Step 1: Validate scene card
  console.log("\n[Step 1] Validating scene card...");
  try {
    execSync(`node scripts/scene-card-worker.mjs validate "${sceneCardPath}"`, {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
    });
    recordArtifact(manifest, "sceneCard", { path: sceneCardPath, evidence: { validated: true } });
    console.log("  PASS");
  } catch (err) {
    console.error("  FAIL");
    return null;
  }

  // Step 2: Render still frame
  console.log("\n[Step 2] Rendering still frame (Mandala)...");
  const stillDir = resolve(sceneDir, "still");
  try {
    execSync(`node scripts/render-scene-card.mjs "${sceneCardPath}" "${stillDir}" --width ${QUALITY.width} --height ${QUALITY.height} --samples ${QUALITY.samples} --maxDepth ${QUALITY.maxDepth}`, {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
    });
    const stillFiles = existsSync(stillDir) ? readdirSync(stillDir) : [];
    recordArtifact(manifest, "still", {
      path: stillDir,
      evidence: { width: QUALITY.width, height: QUALITY.height, samples: QUALITY.samples },
    });
    console.log("  PASS");
  } catch (err) {
    console.error("  FAIL:", err.message);
    return null;
  }

  // Step 3: Render flipbook (Simulation Chamber)
  console.log("\n[Step 3] Rendering flipbook (Simulation Chamber)...");
  const flipbookDir = resolve(sceneDir, "flipbook");
  try {
    execSync(`node scripts/render-flipbook.mjs "${sceneCardPath}" "${flipbookDir}" --width ${QUALITY.width} --height ${QUALITY.height} --samples ${QUALITY.samples} --maxDepth ${QUALITY.maxDepth} --fps ${QUALITY.fps}`, {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
    });
    const frameCount = existsSync(flipbookDir)
      ? readdirSync(flipbookDir).filter((f) => f.endsWith(".png")).length
      : 0;
    recordArtifact(manifest, "flipbook", {
      path: flipbookDir,
      evidence: { frameCount, fps: QUALITY.fps, duration: frameCount / QUALITY.fps },
    });
    console.log("  PASS");
  } catch (err) {
    console.error("  FAIL:", err.message);
    return null;
  }

  // Step 4: Emotional pass (AI Painter)
  console.log("\n[Step 4] Running emotional pass (AI Painter)...");
  const paintedDir = resolve(sceneDir, "painted");
  mkdirSync(paintedDir, { recursive: true });
  try {
    const flipbookFrames = readdirSync(flipbookDir).filter((f) => f.endsWith(".png")).sort();
    let paintedCount = 0;
    for (const frame of flipbookFrames) {
      const inputPath = resolve(flipbookDir, frame);
      const outputPath = resolve(paintedDir, frame);
      execSync(`node scripts/emotional-passer.mjs "${inputPath}" "${sceneCardPath}" "${outputPath}"`, {
        cwd: resolve(import.meta.dirname, ".."),
        stdio: "pipe",
      });
      paintedCount++;
    }
    recordArtifact(manifest, "emotionalPass", {
      path: paintedDir,
      evidence: { framesPainted: paintedCount, emotion: sceneCard.metadata?.emotion },
    });
    console.log(`  PASS (${paintedCount} frames)`);
  } catch (err) {
    console.error("  FAIL:", err.message);
    // Fallback: copy flipbook to painted
    try {
      execSync(`cp -r "${flipbookDir}/." "${paintedDir}/"`, { stdio: "pipe" });
      recordArtifact(manifest, "emotionalPass", {
        path: paintedDir,
        evidence: { fallback: true, reason: err.message },
      });
      console.log("  Fallback: copied flipbook to painted");
    } catch {}
  }

  // Step 5: Ambient soundscape (Mythar)
  console.log("\n[Step 5] Generating ambient soundscape (Mythar)...");
  const ambientPath = resolve(sceneDir, "ambient.wav");
  try {
    execSync(`node scripts/ambient-soundscape.mjs "${sceneCardPath}" "${ambientPath}"`, {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
    });
    recordArtifact(manifest, "ambient", {
      path: ambientPath,
      evidence: { duration: sceneCard.metadata?.duration || 3, emotion: sceneCard.metadata?.emotion },
    });
    console.log("  PASS");
  } catch (err) {
    console.error("  FAIL:", err.message);
    return null;
  }

  // Step 6: Assemble scene (Movie Lane)
  console.log("\n[Step 6] Assembling scene (Movie Lane)...");
  const assembledDir = resolve(sceneDir, "assembled");
  mkdirSync(assembledDir, { recursive: true });
  try {
    execSync(`node scripts/assemble-scene.mjs "${paintedDir}" "${ambientPath}" "${assembledDir}" ${QUALITY.fps}`, {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
    });
    recordArtifact(manifest, "assembly", {
      path: resolve(assembledDir, "scene.mp4"),
      evidence: { fps: QUALITY.fps, codec: "h264+aac" },
    });
    console.log("  PASS");
  } catch (err) {
    console.error("  FAIL:", err.message);
    return null;
  }

  // Update metrics and save manifest
  updateMetrics(manifest);
  const manifestPath = saveManifest(manifest, sceneDir);
  console.log(`\n${formatManifestSummary(manifest)}`);

  return {
    sceneId,
    sceneDir,
    stillDir,
    flipbookDir,
    paintedDir,
    ambientPath,
    assembledDir,
    mp4Path: resolve(assembledDir, "scene.mp4"),
    manifest,
    manifestPath,
  };
}

function concatenateScenes(sceneResults, outputDir) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Concatenating all scenes...");
  console.log(`${"=".repeat(60)}`);

  const finalOutput = resolve(outputDir, "final-film.mp4");
  const concatList = resolve(outputDir, "concat.txt");

  const lines = sceneResults
    .filter((r) => r && r.mp4Path)
    .map((r) => `file '${r.mp4Path}'`)
    .join("\n");

  writeFileSync(concatList, lines);

  try {
    execSync(
      `"${FFMPEG}" -y -f concat -safe 0 -i "${concatList}" -c copy "${finalOutput}"`,
      { stdio: "pipe" }
    );
    console.log(`  Final film: ${finalOutput}`);

    // Create master manifest
    const masterManifest = {
      schemaVersion: "1.0.0",
      type: "master-manifest",
      createdAt: new Date().toISOString(),
      quality: QUALITY,
      scenes: sceneResults
        .filter((r) => r && r.manifest)
        .map((r) => ({
          sceneId: r.sceneId,
          mp4Path: r.mp4Path,
          manifestPath: r.manifestPath,
          metrics: r.manifest.metrics,
        })),
      finalFilm: finalOutput,
    };

    const masterManifestPath = resolve(outputDir, "master-manifest.json");
    writeFileSync(masterManifestPath, JSON.stringify(masterManifest, null, 2));
    console.log(`  Master manifest: ${masterManifestPath}`);

    return finalOutput;
  } catch (err) {
    console.error(`  Concatenation error: ${err.message}`);
    return null;
  }
}

// Main
console.log("Mandala Rendering System - Test Movie Pipeline");
console.log("================================================\n");

const sceneCards = listSceneCards();
console.log(`Found ${sceneCards.length} scene cards`);

mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];
for (const sceneCardPath of sceneCards) {
  const result = runPipeline(sceneCardPath, OUTPUT_DIR);
  results.push(result);
}

const successful = results.filter((r) => r !== null);
console.log(`\n${"=".repeat(60)}`);
console.log(`Pipeline complete: ${successful.length}/${sceneCards.length} scenes rendered`);
console.log(`${"=".repeat(60)}`);

if (successful.length > 0) {
  const finalFilm = concatenateScenes(successful, OUTPUT_DIR);
  if (finalFilm) {
    console.log(`\nFinal film: ${finalFilm}`);
  }
}
