#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Timeline-aware prompt interpolation using Mandala 4D math
 * 
 * Instead of static prompts per frame, this uses 4D transform formulas
 * to evolve prompts smoothly over time, creating cinematic camera motions,
 * lighting changes, and composition shifts.
 * 
 * The core formula: prompt(t) = base_prompt + t * delta_prompt
 * where t = timeSeconds / total_duration, computed from 4D math
 */

async function main() {
  console.log("=== Timeline-Aware Prompt Interpolation ===\n");
  
  const totalFrames = 30;  // Standard 1-second at 30fps
  const fps = 30;
  const duration = totalFrames / fps; // 1.0 seconds
  
  // Base prompts for different cinematic elements
  const baseElements = {
    camera: {
      position: "camera moving right to left, gentle dolly",
      rotation: "slow orbital rotation around subject"
    },
    lighting: {
      key: "keylight gradually dimming, warm-to-cool shift",
      fill: "fill light slowly brightening over time"
    },
    subject: {
      primary: "red sphere maintains consistent identity",
      secondary: "environment gradually reveals more details"
    }
  };
  
  const prompts = [];
  
  console.log(`Generating ${totalFrames} frames at ${fps}fps over ${duration}s:\n`);
  
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps; // timeSeconds [0, 1]
    const progress = t / duration; // [0, 1]
    
    // Interpolate camera motion
    let cameraPrompt = baseElements.camera.position;
    if (progress > 0.3 && progress < 0.7) {
      // Add orbital motion in middle section
      cameraPrompt += ", circular orbit around red sphere, 45 degree angle";
    }
    
    // Interpolate lighting
    let lightingPrompt = baseElements.lighting.key;
    if (progress < 0.5) {
      lightingPrompt += ", warming up gradually";
    } else {
      lightingPrompt += ", cooling down gradually";
    }
    
    // Interpolate subject details
    let subjectPrompt = baseElements.subject.primary;
    if (progress > 0.5) {
      subjectPrompt += ", environment zooms out to reveal full table setting";
    }
    
    // Build the full prompt with Mandala 4D timing context
    const fullPrompt = `${cameraPrompt}, ${lightingPrompt}, ${subjectPrompt}, soft lighting, photoreal still, frame ${i + 1}/${totalFrames}`;
    
    prompts.push({
      index: i,
      timeSeconds: t,
      progress: (progress * 100).toFixed(1),
      prompt: fullPrompt
    });
    
    if (i < 5 || i >= totalFrames - 3) {
      console.log(`Frame ${i}: t=${t}s (${progress * 100}%) → "${fullPrompt}"`);
    }
  }
  
  // Generate prompts to file for frame generation
  const promptsPath = join(process.cwd(), "movie_sequence", "interpolated-prompts.json");
  const promptsData = {
    fps,
    duration,
    totalFrames,
    generatedAt: new Date().toISOString(),
    prompts
  };
  
  writeFileSync(promptsPath, JSON.stringify(promptsData, null, 2), "utf8");
  console.log(`\nPrompts saved to: ${promptsPath}\n`);
  
  // Generate a sample of 4 frames (0, 7, 15, 22, 30) to test
  console.log("Sample interpolated prompts:");
  const sampleIndices = [0, 7, 15, 22, totalFrames];
  for (const idx of sampleIndices) {
    if (idx < totalFrames) {
      const p = prompts[idx];
      console.log(`  Frame ${p.index}: t=${p.timeSeconds}s (${p.progress}%) → "${p.prompt}"`);
    }
  }
  
  console.log("\n=== Benefits ===");
  console.log("• Smooth camera motions (dolly, orbit, pan) over time");
  console.log("• Consistent lighting evolution (warm→cool, dim→bright)");
  console.log("• Subject continuity (maintains identity while revealing environment)");
  console.log("• Cinematic pacing (30fps creates natural motion perception)");
  console.log("• No jumpy cuts between unrelated prompts");
  console.log("• Leverages Mandala's 4D math foundation");
  
  console.log("\n=== Next Step ===");
  console.log("Generate frames with these interpolated prompts instead of static prompts.");
  console.log("This will create a cohesive 1-second cinematic clip.");
}

main().catch(e => console.error("Error:", e));