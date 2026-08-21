#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const FFMPEG = resolve(import.meta.dirname, "../../runtime/toolchain/ffmpeg/usr/bin/ffmpeg");

function hashFile(path) {
  try {
    const content = readFileSync(path);
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function hashJson(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

function createEvidence(worker, input, output, extra = {}) {
  return {
    worker,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    input: typeof input === "string" ? { path: input, hash: hashFile(input) } : { hash: hashJson(input) },
    output: typeof output === "string" ? { path: output, hash: hashFile(output) } : { hash: hashJson(output) },
    ...extra,
  };
}

function saveEvidence(evidence, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const path = resolve(outputDir, `${evidence.worker}-evidence.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  return path;
}

// Scene Card Worker
export async function sceneCardWorker(sceneCardPath, outputDir) {
  console.log("[AAIS:scene_card_worker] Validating scene card...");

  const raw = readFileSync(sceneCardPath, "utf8");
  const sceneCard = JSON.parse(raw);

  // Validate against schema
  const { parseSceneSpecification } = await import("../../mrs/packages/renderer-core/src/scene-spec/parse.js");
  const validation = parseSceneSpecification(sceneCard);

  const evidence = createEvidence("scene_card_worker", sceneCardPath, sceneCardPath, {
    validated: validation.ok,
    errors: validation.errors || [],
    sceneId: sceneCard.id,
    entityCount: sceneCard.entities?.length || 0,
  });

  saveEvidence(evidence, outputDir);

  if (!validation.ok) {
    throw new Error(`Scene card validation failed: ${validation.errors.map((e) => e.message).join(", ")}`);
  }

  return { sceneCard, evidence };
}

// Camera Path Worker
export function cameraPathWorker(sceneCard, outputDir) {
  console.log("[AAIS:camera_path_worker] Generating camera path...");

  const meta = sceneCard.metadata || {};
  const duration = meta.duration || 3;
  const fps = 24;
  const totalFrames = Math.ceil(duration * fps);

  // Generate camera keyframes
  const keyframes = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const angle = t * Math.PI * 2;
    const radius = 5;
    const baseY = 2;

    keyframes.push({
      time: t * duration,
      position: [
        Math.cos(angle) * radius,
        baseY + Math.sin(angle * 2) * 0.5,
        Math.sin(angle) * radius,
        0,
      ],
      target: [0, 0, 0, 0],
    });
  }

  const evidence = createEvidence("camera_path_worker", sceneCard.id, "camera-path", {
    duration,
    fps,
    totalFrames,
    keyframeCount: keyframes.length,
  });

  saveEvidence(evidence, outputDir);

  return { keyframes, duration, fps, totalFrames, evidence };
}

// Lighting Worker
export function lightingWorker(sceneCard, outputDir) {
  console.log("[AAIS:lighting_worker] Generating lighting setup...");

  const meta = sceneCard.metadata || {};
  const genome = meta.emotionGenome || { valence: 0.5, arousal: 0.5, dominance: 0.5 };

  // Map emotion to lighting
  const lighting = {
    ambient: {
      color: [0.1 + genome.valence * 0.2, 0.1 + genome.valence * 0.1, 0.15 + genome.dominance * 0.1],
      intensity: 0.3 + genome.arousal * 0.3,
    },
    key: {
      color: [0.8 + genome.valence * 0.2, 0.7 + genome.arousal * 0.3, 0.6],
      intensity: 0.5 + genome.dominance * 0.5,
      direction: [4, 7, -3],
    },
    fill: {
      color: [0.3, 0.4 + genome.valence * 0.2, 0.6 + genome.arousal * 0.2],
      intensity: 0.2 + genome.dominance * 0.2,
      direction: [-3, 2, 4],
    },
  };

  const evidence = createEvidence("lighting_worker", sceneCard.id, "lighting", {
    emotion: meta.emotion,
    genome,
    ambientIntensity: lighting.ambient.intensity,
    keyIntensity: lighting.key.intensity,
  });

  saveEvidence(evidence, outputDir);

  return { lighting, evidence };
}

// Painter Worker
export function painterWorker(inputPath, sceneCard, outputDir) {
  console.log("[AAIS:painter_worker] Running emotional pass...");

  const meta = sceneCard.metadata || {};
  const emotion = meta.emotion || "calm";

  const EMOTION_PROMPTS = {
    awe: "ethereal divine majestic soft glowing light sacred cathedral atmosphere",
    tension: "dark ominous foreboding claustrophobic tight shadows cold blue light",
    calm: "serene peaceful soft gentle warm light tranquil ocean breeze",
    fury: "violent intense burning red hot aggressive dynamic storm flames",
    peace: "gentle warm serene soft green garden calm morning light",
  };

  const prompt = EMOTION_PROMPTS[emotion] || EMOTION_PROMPTS.calm;

  // Call emotional passer
  execSync(`node scripts/emotional-passer.mjs "${inputPath}" "${sceneCard.id}" "${outputDir}"`, {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "pipe",
  });

  const evidence = createEvidence("painter_worker", inputPath, outputDir, {
    emotion,
    prompt,
    denoisingStrength: 0.45,
  });

  saveEvidence(evidence, outputDir);

  return { evidence };
}

// Sound Worker
export function soundWorker(sceneCard, outputDir) {
  console.log("[AAIS:sound_worker] Generating ambient soundscape...");

  const meta = sceneCard.metadata || {};
  const genome = meta.emotionGenome || { valence: 0.5, arousal: 0.5, dominance: 0.5 };

  // Generate audio parameters from emotion
  const audioParams = {
    baseFreq: 180 + (genome.valence - 0.5) * 40 + (genome.arousal - 0.5) * 60,
    breathRate: 1.5 + genome.arousal * 3,
    amplitude: 0.3 + genome.arousal * 0.4,
    duration: meta.duration || 3,
  };

  const evidence = createEvidence("sound_worker", sceneCard.id, "ambient", {
    emotion: meta.emotion,
    genome,
    audioParams,
  });

  saveEvidence(evidence, outputDir);

  return { audioParams, evidence };
}

// Assembly Worker
export async function assemblyWorker(framesDir, audioPath, outputDir, fps = 24) {
  console.log("[AAIS:assembly_worker] Assembling scene...");

  const { readdirSync } = await import("node:fs");
  const frameCount = readdirSync(framesDir).filter((f) => f.endsWith(".png")).length;

  // Assembly is handled by assemble-scene.mjs
  const evidence = createEvidence("assembly_worker", framesDir, outputDir, {
    frameCount,
    fps,
    codec: "h264+aac",
  });

  saveEvidence(evidence, outputDir);

  return { evidence };
}

// Main CLI
if (process.argv[1] && process.argv[1].includes("index.mjs")) {
  const worker = process.argv[2];
  const input = process.argv[3];

  if (!worker || !input) {
    console.error("Usage: node index.mjs <worker-name> <input> [output-dir]");
    console.error("Workers: scene_card, camera_path, lighting, painter, sound, assembly");
    process.exit(1);
  }

  const outputDir = process.argv[4] || resolve(process.cwd(), "output/workers");

  try {
    let result;
    switch (worker) {
      case "scene_card":
        result = await sceneCardWorker(input, outputDir);
        break;
      case "camera_path":
        const sceneCard = JSON.parse(readFileSync(input, "utf8"));
        result = await cameraPathWorker(sceneCard, outputDir);
        break;
      case "lighting":
        const lightingScene = JSON.parse(readFileSync(input, "utf8"));
        result = await lightingWorker(lightingScene, outputDir);
        break;
      case "painter":
        result = await painterWorker(input, JSON.parse(readFileSync(input, "utf8")), outputDir);
        break;
      case "sound":
        const soundScene = JSON.parse(readFileSync(input, "utf8"));
        result = await soundWorker(soundScene, outputDir);
        break;
      case "assembly":
        result = await assemblyWorker(input, process.argv[4] || "", outputDir);
        break;
      default:
        console.error(`Unknown worker: ${worker}`);
        process.exit(1);
    }

    console.log(`[AAIS:${worker}] Done. Evidence: ${outputDir}`);
  } catch (err) {
    console.error(`[AAIS:${worker}] Error: ${err.message}`);
    process.exit(1);
  }
}
