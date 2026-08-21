#!/usr/bin/env node
/**
 * Simulation Chamber v3 — persistent 4D world with multi-actor humanoid performance.
 *
 * Features:
 *   - Multiple AI actors with humanoid avatars (head, torso, arms, legs)
 *   - Beat-driven choreography per actor (scripted mode)
 *   - LLM-driven decisions (AI mode) — actors observe world, ask LLM what to do
 *   - Mythar TTS speech generation (Lemonade kokoro-v1)
 *   - Director override (lock beats, override decisions)
 *   - AI Factory spine profile integration (personality → behavior)
 *   - Frame-by-frame recording → MP4 assembly
 *
 * Usage:
 *   node simulation-chamber.mjs <scene-card.json> [output-dir] [options]
 *
 * Options:
 *   --width N          Render width (default: 128)
 *   --height N         Render height (default: 128)
 *   --fps N            Frames per second (default: 12)
 *   --samples N        Samples per pixel (default: 4)
 *   --maxDepth N       Max ray depth (default: 3)
 *   --no-tts           Disable TTS
 *   --llm              Enable LLM-driven decisions (actors ask AI what to do)
 *                      ACTOR_LLM_MODEL / ACTOR_LLM_BASE_URL select Lemonade chat model
 *                      (default tries Dolphin3.0-Llama3.2-1B-GGUF-Q4_K_M, falls back to Instruct)
 *   --llm-interval N   Seconds between LLM decisions (default: 2.0)
 *   --solver mandala-proto   Default. Certified −∇φ defect walk drives actor world positions.
 *                            Beat clock still drives Movie Lane / observer (ownsTime=false).
 *   --solver pose            Explicit fallback: beat lerp / pose_interpolation (notGradV).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { parseSceneSpecification } from "../mrs/packages/renderer-core/src/scene-spec/parse.js";
import {
  renderSceneFrame,
  buildScene,
  buildCamera,
  resolveSceneDescriptor,
} from "../mrs/packages/renderer-core/scripts/render-still.mjs";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";
import {
  buildHumanoidPrimitives,
  poseForBeat,
} from "./humanoid-avatar.mjs";
import { ActorDecisionEngine } from "./actor-decision-engine.mjs";
import {
  CHAR_RIGGED_GLB,
  describeCharacterHook,
} from "../character/tools/simulation-chamber-hook.mjs";
import {
  Hypersphere,
  Hyperplane,
  OrientedCapsule,
} from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import { characterMetadata } from "../character/tools/chamber-bridge.mjs";
import {
  describeChamberSubstrate,
  attachDefectTick,
  writeChamberReport,
  MOTION_DRIVER_PROTO,
  MOTION_DRIVER_POSE,
} from "../mandala/substrate/chamber-hook.mjs";
import {
  runCinematicProtoSolver,
  applyDefectMotionToActors,
  sampleWorldline,
  CHAMBER_SOLVER_ID,
  CHAMBER_SOLVER_POSE,
  CHAMBER_SOLVER_DEFAULT,
} from "../mandala/engine/chamber/solver-hook.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FFMPEG = resolve(__dirname, "../runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const TTS_SCRIPT = resolve(__dirname, "tts-segment.mjs");

// ---------------------------------------------------------------------------
// Director Override — locks and overrides
// ---------------------------------------------------------------------------

class DirectorOverride {
  constructor() {
    /** @type {Map<string, Object>} locked beats: actorId → { beatIndex, locked: true, ... } */
    this.lockedBeats = new Map();
    /** @type {Map<string, Function>} custom decision functions per actor */
    this.overrides = new Map();
  }

  lockBeat(actorId, beatIndex, lockedState) {
    this.lockedBeats.set(`${actorId}:${beatIndex}`, { beatIndex, locked: true, ...lockedState });
  }

  overrideDecision(actorId, fn) {
    this.overrides.set(actorId, fn);
  }

  isBeatLocked(actorId, beatIndex) {
    return this.lockedBeats.has(`${actorId}:${beatIndex}`);
  }

  getLockedState(actorId, beatIndex) {
    return this.lockedBeats.get(`${actorId}:${beatIndex}`);
  }

  hasOverride(actorId) {
    return this.overrides.has(actorId);
  }

  applyOverride(actorId, worldState, defaultDecision) {
    const fn = this.overrides.get(actorId);
    return fn ? fn(worldState, defaultDecision) : defaultDecision;
  }
}

// ---------------------------------------------------------------------------
// Multi-Actor System
// ---------------------------------------------------------------------------

class MultiActorSim {
  constructor(options = {}) {
    this.width = options.width || 128;
    this.height = options.height || 128;
    this.samples = options.samples || 4;
    this.maxDepth = options.maxDepth || 3;
    this.fps = options.fps || 12;
    this.seed = options.seed || 42;
    this.enableTTS = options.enableTTS !== false;
    this.enableLLM = options.enableLLM || false;
    this.llmInterval = options.llmInterval || 2.0; // seconds between LLM decisions

    this.scene = null;
    this.camera = null;
    this.descriptor = null;
    this.actors = [];
    this.director = new DirectorOverride();
    this.time = 0;
    this.tickCount = 0;
    this.duration = 3;
    this.lastLLMDecisionTime = 0;

    // LLM decision engine
    this.decisionEngine = this.enableLLM ? new ActorDecisionEngine({
      baseUrl: process.env.ACTOR_LLM_BASE_URL || process.env.LEMONADE_BASE_URL || "http://127.0.0.1:13307/v1",
      model: process.env.ACTOR_LLM_MODEL,
    }) : null;

    // Recording
    this.frames = [];
    this.speechTimeline = []; // { time, actorId, text, audioPath? }
    this.rhfdCharacterGlb = Boolean(options.characterGlb);
    this.solver = options.solver || CHAMBER_SOLVER_DEFAULT;
    this.solverResult = null;
  }

  buildWorld(sceneCard) {
    this.duration = sceneCard.metadata?.duration || sceneCard.duration || 3;
    const prompt = sceneCard.description || sceneCard.name || "abstract 4D geometry";
    this.descriptor = resolveSceneDescriptor({
      prompt,
      scene: sceneCard.scene || null,
      palette: sceneCard.palette || null,
      seed: this.seed,
    });

    const { scene } = buildScene(this.descriptor, this.seed, { samples: this.samples });
    this.scene = scene;

    const { camera } = buildCamera(this.seed, this.width, this.height, this.descriptor);
    this.camera = camera;
    
    // Store initial camera state for animation
    this.cameraBase = {
      x: camera.position?.x || 0,
      y: camera.position?.y || 3,
      z: camera.position?.z || -8,
      lookAtX: camera.lookAt?.x || 0,
      lookAtY: camera.lookAt?.y || 1.5,
      lookAtZ: camera.lookAt?.z || 0,
    };

    this.addWorldProps(sceneCard);
    this.sceneCardCamera = sceneCard.camera || null;
    const cp = characterMetadata(sceneCard);
    if (cp) {
      console.log(`  Character pipeline: ${cp.id} (${cp.species}) — same armature as character/`);
    }
    console.log(`  World: ${scene.primitives.length} primitives, ${scene.lights.length} lights`);
    return this;
  }

  /**
   * Add scene-card entities (workroom, table, salt dish) as RT4D primitives.
   */
  addWorldProps(sceneCard) {
    for (const mat of sceneCard.materials || []) {
      const hex = (mat.color || "#888888").replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const type = mat.brdf === "ggx" ? "ggx" : "lambertian";
      this.scene.materials.createMaterial(mat.id, type, {
        albedo: vec4(r, g, b, 1),
        roughness: mat.roughness ?? 0.7,
      });
    }
    for (const ent of sceneCard.entities || []) {
      const g = ent.geometry || {};
      const mid = ent.materialId || "default";
      if (g.kind === "hypersphere") {
        const c = g.center || [0, 0, 0, 0];
        this.scene.addPrimitive(new Hypersphere(vec4(c[0], c[1], c[2], c[3] || 0), g.radius || 0.3), mid);
      } else if (g.kind === "plane") {
        this.scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), g.offset ?? 0), mid);
      } else if (g.kind === "box") {
        const c = g.center || [0, 0, 0, 0];
        const h = g.halfSize || [0.5, 0.5, 0.5];
        this.scene.addPrimitive(new OrientedCapsule(
          vec4(c[0] - h[0], c[1], c[2], c[3] || 0),
          vec4(c[0] + h[0], c[1], c[2], c[3] || 0),
          Math.max(h[1], 0.08),
        ), mid);
      } else if (g.kind === "capsule") {
        const a = g.a || [0, 0, 0, 0];
        const b = g.b || [0, 1, 0, 0];
        this.scene.addPrimitive(new OrientedCapsule(
          vec4(a[0], a[1], a[2], a[3] || 0),
          vec4(b[0], b[1], b[2], b[3] || 0),
          g.radius || 0.2,
        ), mid);
      }
    }
  }

  /**
   * Add an actor to the world.
   * @param {Object} actorDef - from scene card actors array
   */
  addActor(actorDef) {
    const matId = `actor-${actorDef.id}`;
    const hex = (actorDef.color || "#ffffff").replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Create material for this actor
    this.scene.materials.createMaterial(matId, "lambertian", {
      albedo: vec4(r * 0.3, g * 0.3, b * 0.3, 1), // dim initially
    });

    const actor = {
      id: actorDef.id,
      name: actorDef.name || actorDef.id,
      personality: actorDef.personality || "",
      color: actorDef.color,
      rgb: [r, g, b],
      voice: actorDef.voice || "shimmer",
      beats: actorDef.beats || [],
      materialId: matId,

      // Current state
      position: actorDef.beats?.[0]?.position ? [...actorDef.beats[0].position] : [0, 2, 0, 0],
      emissive: [...(actorDef.beats?.[0]?.emissive || [0.5, 0.5, 0.5])],
      scale: actorDef.beats?.[0]?.scale || 0.5,
      pose: { armAngle: 0, armSwing: 0, legSpread: 0, legSwing: 0, headTilt: 0, bodyLean: 0 },
      kind: "defect",
      _prevPosition: actorDef.beats?.[0]?.position ? [...actorDef.beats[0].position] : [0, 2, 0, 0],
      _solverRest: actorDef.beats?.[0]?.position ? [...actorDef.beats[0].position] : [0, 2, 0, 0],

      // Avatar primitives (set after first build)
      avatarPrimitives: [],
    };

    actor.kind = "defect";
    this.actors.push(actor);
    console.log(`  Actor "${actor.name}" (${actorDef.color}) — ${actor.beats.length} beats [RHFD defect / petal rupture]`);
    return actor;
  }

  /**
   * Build all humanoid avatars and add them to the scene.
   */
  buildAvatars() {
    for (const actor of this.actors) {
      const { primitives } = buildHumanoidPrimitives(
        actor.pose,
        actor.materialId,
        actor.position[1],
        actor.position,
      );
      actor.avatarPrimitives = primitives;

      // Add all body parts to scene
      for (const { primitive, materialId } of primitives) {
        this.scene.addPrimitive(primitive, materialId);
      }
    }
    this.scene.build();
    console.log(`  Avatars built: ${this.actors.length} humanoids (${this.actors[0]?.avatarPrimitives.length || 0} parts each)`);
  }

  /**
   * Update an actor's position by rebuilding their avatar primitives.
   */
  updateActorAvatar(actor) {
    // Remove old primitives
    for (const part of actor.avatarPrimitives) {
      const prim = part.primitive || part;
      const idx = this.scene.primitives.indexOf(prim);
      if (idx >= 0) this.scene.primitives.splice(idx, 1);
    }

    // Build new primitives at current position/pose
    const { primitives } = buildHumanoidPrimitives(
      actor.pose,
      actor.materialId,
      actor.position[1],
      actor.position,
    );
    actor.avatarPrimitives = primitives;

    for (const { primitive, materialId } of primitives) {
      this.scene.addPrimitive(primitive, materialId);
    }
  }

  /**
   * Interpolate between two beat states.
   * Carries forward state from previous beats — each beat only defines what changes.
   * `positions=false` keeps spawn layout and lets the proto solver own world translation.
   */
  interpolateBeats(actor, time, { positions = true } = {}) {
    const beats = actor.beats;
    if (!beats.length) return;

    // Accumulate state from all beats up to current time
    let accumulatedPosition = null;
    let accumulatedEmissive = null;
    let accumulatedScale = null;
    let currentAction = "idle";

    for (const beat of beats) {
      if (time < beat.time) break;

      currentAction = beat.action;
      if (beat.position) accumulatedPosition = [...beat.position];
      if (beat.emissive) accumulatedEmissive = [...beat.emissive];
      if (beat.scale != null) accumulatedScale = beat.scale;
    }

    // Find the NEXT beat for interpolation
    let nextBeat = null;
    for (const beat of beats) {
      if (beat.time > time) { nextBeat = beat; break; }
    }

    // Apply accumulated state
    if (positions && accumulatedPosition) actor.position = [...accumulatedPosition];
    if (accumulatedEmissive) actor.emissive = [...accumulatedEmissive];
    if (accumulatedScale != null) actor.scale = accumulatedScale;

    // Interpolate toward next beat if it exists
    if (positions && nextBeat && accumulatedPosition && nextBeat.position) {
      const beatDuration = nextBeat.time - (time - (time - (nextBeat.time - 1 / this.fps)));
      // Find the previous beat time
      let prevTime = 0;
      for (const beat of beats) {
        if (beat.time <= time) prevTime = beat.time;
      }
      const duration = nextBeat.time - prevTime;
      const t = duration > 0 ? (time - prevTime) / duration : 1;
      const ease = t * t * (3 - 2 * t);

      for (let i = 0; i < 4; i++) {
        actor.position[i] = lerp(accumulatedPosition[i] || 0, nextBeat.position[i] || 0, ease);
      }
    }

    if (nextBeat && accumulatedEmissive && nextBeat.emissive) {
      let prevTime = 0;
      for (const beat of beats) {
        if (beat.time <= time) prevTime = beat.time;
      }
      const duration = nextBeat.time - prevTime;
      const t = duration > 0 ? (time - prevTime) / duration : 1;
      const ease = t * t * (3 - 2 * t);

      for (let i = 0; i < 3; i++) {
        actor.emissive[i] = lerp(accumulatedEmissive[i] || 0, nextBeat.emissive[i] || 0, ease);
      }
    }

    if (nextBeat && accumulatedScale != null && nextBeat.scale != null) {
      let prevTime = 0;
      for (const beat of beats) {
        if (beat.time <= time) prevTime = beat.time;
      }
      const duration = nextBeat.time - prevTime;
      const t = duration > 0 ? (time - prevTime) / duration : 1;
      const ease = t * t * (3 - 2 * t);
      actor.scale = lerp(accumulatedScale, nextBeat.scale, ease);
    }

    // Pose from action
    actor.pose = poseForBeat(currentAction, time);
  }

  applyProtoMotion(actor) {
    if (!this.solverResult?.defectWorldline?.length) return false;
    if (!actor._solverRest) actor._solverRest = [...(actor.position || [0, 0, 0, 0])];
    const tNorm = this.duration > 0 ? this.time / this.duration : 0;
    const defect = sampleWorldline(this.solverResult.defectWorldline, tNorm);
    const origin = this.solverResult.defectOrigin || this.solverResult.defectWorldline[0];
    if (!defect || !origin) return false;
    applyDefectMotionToActors([actor], defect, origin);
    return true;
  }

  /**
   * One simulation tick.
   */
  async step() {
    const dt = 1 / this.fps;
    this.time += dt;
    this.tickCount++;

    const tickSpeech = [];

    // LLM-driven decisions: ask AI what to do at each interval
    if (this.enableLLM && this.decisionEngine && (this.time - this.lastLLMDecisionTime >= this.llmInterval)) {
      this.lastLLMDecisionTime = this.time;
      
      const worldState = {
        time: this.time,
        tick: this.tickCount,
        sceneDescription: this.descriptor?.prompt || "abstract 4D geometry",
        actors: this.actors.map(a => ({
          name: a.name,
          color: a.color,
          position: [...a.position],
          emissive: [...a.emissive],
          currentAction: a.currentAction || "idle",
          lastSpeech: a.lastSpeech || "",
        })),
      };
      
      const decisions = await this.decisionEngine.decideAll(
        this.actors.map(a => ({
          id: a.id,
          name: a.name,
          color: a.color,
          position: [...a.position],
          emissive: [...a.emissive],
          currentAction: a.currentAction || "idle",
          scale: a.scale,
        })),
        worldState
      );
      
      for (const actor of this.actors) {
        const decision = decisions[actor.id];
        if (decision) {
          actor.position = [...decision.position];
          actor.emissive = [...decision.emissive];
          actor.scale = decision.scale;
          actor.currentAction = decision.action;
          
          if (decision.speech) {
            tickSpeech.push({ actorId: actor.id, text: decision.speech, time: this.time });
            actor.lastSpeech = decision.speech;
            console.log(`    LLM [${this.time.toFixed(1)}s] ${actor.name}: "${decision.speech}"`);
          }
        }
      }
    }

    for (const actor of this.actors) {
      // 1. Appearance from beats; world translation from proto solver when active
      const protoMotion = this.solver === CHAMBER_SOLVER_ID && this.solverResult;
      if (!this.enableLLM) {
        this.interpolateBeats(actor, this.time, { positions: !protoMotion });
        if (protoMotion) this.applyProtoMotion(actor);
      } else {
        // In LLM mode, still update pose from current action
        actor.pose = poseForBeat(actor.currentAction || "idle", this.time);
      }
      // RHFD: actor = defect. Proto solver drives world position; pose path reports a surrogate.
      attachDefectTick(actor, dt, { fromGradV: this.solver === CHAMBER_SOLVER_ID && Boolean(this.solverResult) });

      // 2. Director override
      if (this.director.hasOverride(actor.id)) {
        const defaultDecision = {
          position: actor.position,
          emissive: actor.emissive,
          scale: actor.scale,
        };
        const overridden = this.director.applyOverride(actor.id, { time: this.time }, defaultDecision);
        if (overridden.position) actor.position = overridden.position;
        if (overridden.emissive) actor.emissive = overridden.emissive;
      }

      // 3. Update material color
      const mat = this.scene.materials.get(actor.materialId);
      if (mat) {
        mat.albedo = vec4(
          Math.min(1, actor.emissive[0] * 0.85),
          Math.min(1, actor.emissive[1] * 0.85),
          Math.min(1, actor.emissive[2] * 0.85),
          1
        );
      }

      // 4. Rebuild avatar primitives at new position/pose
      this.updateActorAvatar(actor);

      // 5. Check for speech (scripted mode only)
      if (!this.enableLLM) {
        for (const beat of actor.beats) {
          if (beat.speech && beat.action === "speak") {
            const already = this.speechTimeline.some(
              (s) => s.actorId === actor.id && s.text === beat.speech,
            );
            if (!already && this.time >= beat.time && this.time < beat.time + 1 / this.fps) {
              tickSpeech.push({ actorId: actor.id, text: beat.speech, time: this.time });
            }
          }
        }
      }
    }

    // 6. Rebuild BVH
    this.scene.build();

    // 7. Animate camera — orbit around center of mass of actors
    if (this.cameraBase && this.actors.length > 0) {
      const centerX = this.actors.reduce((sum, a) => sum + a.position[0], 0) / this.actors.length;
      const centerY = this.actors.reduce((sum, a) => sum + a.position[1], 0) / this.actors.length;
      const centerZ = this.actors.reduce((sum, a) => sum + a.position[2], 0) / this.actors.length;
      
      const orbitAngle = this.time * 0.18;
      const orbitRadius = this.sceneCardCamera?.radius || 3.6;
      const cameraX = centerX + Math.sin(orbitAngle) * orbitRadius;
      const cameraY = centerY + 0.85;
      const cameraZ = centerZ + Math.cos(orbitAngle) * orbitRadius;
      
      // Update camera position and look-at
      if (this.camera.position) {
        this.camera.position.x = cameraX;
        this.camera.position.y = cameraY;
        this.camera.position.z = cameraZ;
      }
      if (this.camera.lookAt) {
        this.camera.lookAt.x = centerX;
        this.camera.lookAt.y = centerY + 0.35;
        this.camera.lookAt.z = centerZ;
      }
      if (typeof this.camera._buildBasis === "function") {
        this.camera._buildBasis();
      }
    }

    // 8. Render frame
    const png = renderSceneFrame(this.scene, this.camera, {
      width: this.width,
      height: this.height,
      samples: this.samples,
      maxDepth: this.maxDepth,
      seed: this.seed + this.tickCount,
      palette: this.descriptor?.palette || { albedo: [0.5, 0.5, 0.6] },
    });

    this.frames.push(png);

    // 8. Record speech
    for (const s of tickSpeech) {
      this.speechTimeline.push(s);
    }

    return { png, speech: tickSpeech, tick: this.tickCount };
  }

  async run() {
    const totalFrames = Math.ceil(this.duration * this.fps);
    const mode = this.enableLLM ? "LLM-driven" : "beat-driven";
    console.log(`  Simulation: ${totalFrames} ticks @ ${this.fps}fps (${this.duration}s) [${mode}]`);
    console.log(`  Actors: ${this.actors.map(a => a.name).join(", ")}`);
    if (this.enableLLM) {
      console.log(`  LLM interval: ${this.llmInterval}s (decisions every ${Math.ceil(this.llmInterval * this.fps)} ticks)`);
    }

    for (let i = 0; i < totalFrames; i++) {
      const result = await this.step();

      if (result.speech.length > 0) {
        for (const s of result.speech) {
          const actor = this.actors.find(a => a.id === s.actorId);
          if (!this.enableLLM) { // LLM mode already prints above
            console.log(`    Tick ${result.tick} [${this.time.toFixed(2)}s] ${actor?.name || s.actorId}: "${s.text}"`);
          }
        }
      } else if (result.tick % 10 === 0 || result.tick === totalFrames) {
        const positions = this.actors.map(a => `${a.name}=[${a.position.map(v => v.toFixed(1)).join(",")}]`).join(" ");
        console.log(`    Tick ${result.tick}/${totalFrames} [${this.time.toFixed(2)}s] ${positions}`);
      }
    }

    return {
      frames: this.frames,
      speechTimeline: this.speechTimeline,
      totalFrames: this.frames.length,
      duration: this.duration,
    };
  }

  async assemble(outputDir, sceneCard) {
    mkdirSync(outputDir, { recursive: true });

    const rhfdReport = writeChamberReport(this.actors, {
      characterGlb: this.rhfdCharacterGlb,
      ticks: this.tickCount,
      mapping: "mandala/substrate/MAPPING.md",
      motionDriverActual:
        this.solver === CHAMBER_SOLVER_ID && this.solverResult
          ? MOTION_DRIVER_PROTO
          : MOTION_DRIVER_POSE,
      solver: this.solver,
    });
    writeFileSync(
      resolve(outputDir, "rhfd-substrate-report.json"),
      JSON.stringify(rhfdReport, null, 2) + "\n",
    );
    console.log(`  RHFD substrate report: ${rhfdReport.gradVStatus} motion=${rhfdReport.motionDriverActual} meanSurrogate=${rhfdReport.meanSurrogateMag.toFixed(4)}`);

    // Save frames
    const framesDir = resolve(outputDir, "frames");
    mkdirSync(framesDir, { recursive: true });
    for (let i = 0; i < this.frames.length; i++) {
      writeFileSync(resolve(framesDir, `frame-${String(i).padStart(4, "0")}.png`), this.frames[i]);
    }
    console.log(`  Saved ${this.frames.length} frames`);

    // Generate TTS for speech segments
    const audioDir = resolve(outputDir, "audio");
    mkdirSync(audioDir, { recursive: true });
    const ttsSegments = [];

    if (this.enableTTS && this.speechTimeline.length > 0) {
      console.log(`  Generating ${this.speechTimeline.length} TTS segments...`);
      for (let i = 0; i < this.speechTimeline.length; i++) {
        const seg = this.speechTimeline[i];
        const actor = this.actors.find(a => a.id === seg.actorId);
        const voice = actor?.voice || "shimmer";
        const outPath = resolve(audioDir, `speech-${String(i).padStart(3, "0")}.mp3`);

        try {
          execSync(`node "${TTS_SCRIPT}" "${seg.text}" "${outPath}" --voice ${voice}`, {
            cwd: resolve(__dirname, ".."),
            stdio: "pipe",
            timeout: 15000,
          });
          ttsSegments.push({ ...seg, audioPath: outPath });
          console.log(`    TTS ${i + 1}: ${actor?.name} → ${voice} (${seg.text.slice(0, 40)}...)`);
        } catch (err) {
          console.log(`    TTS ${i + 1} failed: ${err.message?.slice(0, 60)}`);
        }
      }
    }

    // Generate ambient audio
    const ambientPath = resolve(outputDir, "ambient.wav");
    try {
      const tmpScene = resolve(outputDir, "_tmp_scene.json");
      writeFileSync(tmpScene, JSON.stringify(sceneCard));
      execSync(`node "${resolve(__dirname, "ambient-soundscape.mjs")}" "${tmpScene}" "${ambientPath}"`, {
        cwd: resolve(__dirname, ".."),
        stdio: "pipe",
        timeout: 10000,
      });
      try { unlinkSync(tmpScene); } catch {}
    } catch (err) {
      console.log(`  Ambient: skipped`);
    }

    // Assemble with ffmpeg
    const mp4Path = resolve(outputDir, "scene.mp4");
    if (!existsSync(FFMPEG)) {
      console.log(`  Assembly: ffmpeg not found at ${FFMPEG}`);
      return { framesDir, mp4Path };
    }

    try {
      let ffmpegCmd = `"${FFMPEG}" -y -framerate ${this.fps} -i "${framesDir}/frame-%04d.png"`;

      // Mix speech segments at their correct timestamps
      if (ttsSegments.length > 0) {
        for (let i = 0; i < ttsSegments.length; i++) {
          const delay = Math.round(ttsSegments[i].time * 1000);
          ffmpegCmd += ` -i "${ttsSegments[i].audioPath}"`;
        }
        ffmpegCmd += ` -filter_complex "`;
        for (let i = 0; i < ttsSegments.length; i++) {
          const delay = Math.round(ttsSegments[i].time * 1000);
          ffmpegCmd += `[${i + 1}]adelay=${delay}|${delay},apad[s${i}];`;
        }
        const audioInputs = ttsSegments.map((_, i) => `[s${i}]`).join("");
        ffmpegCmd += `${audioInputs}amix=inputs=${ttsSegments.length}:duration=longest[audio]"`;
        ffmpegCmd += ` -map 0:v -map "[audio]" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${mp4Path}"`;
      } else if (existsSync(ambientPath)) {
        ffmpegCmd += ` -i "${ambientPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${mp4Path}"`;
      } else {
        ffmpegCmd += ` -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;
      }

      execSync(ffmpegCmd, { stdio: "pipe", timeout: 30000 });
      console.log(`  Assembled: ${mp4Path}`);
    } catch (err) {
      console.log(`  Assembly: ${err.message?.slice(0, 80)}`);
    }

    return { framesDir, mp4Path, audioDir, ttsSegments };
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--holo")) {
  // Official holographic recorder lives in simulation-chamber-holo.mjs (raw .bin).
  // Keep this file on the legacy PNG / capsule path.
  console.log("Redirecting --holo → scripts/simulation-chamber-holo.mjs (official raw .bin recorder)");
  const holoScript = join(__dirname, "simulation-chamber-holo.mjs");
  const r = spawnSync(process.execPath, [holoScript, ...args], { stdio: "inherit" });
  process.exit(r.status === null ? 1 : r.status);
}
if (args.length === 0) {
  console.error("Usage: node simulation-chamber.mjs <scene-card.json> [output-dir] [options]");
  console.error("Options: --width N --height N --fps N --samples N --maxDepth N --no-tts --llm --llm-interval N");
  console.error("         --character-glb [path]  consume character/models/exports/char_rigged.glb (partial hook)");
  console.error("         --solver mandala-proto  default: certified −∇φ defect walk drives actors");
  console.error("         --solver pose           beat lerp / pose_interpolation fallback");
  console.error("         --holo                  redirects to scripts/simulation-chamber-holo.mjs (raw .bin)");
  process.exit(1);
}

const positionalArgs = [];
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--width" && args[i + 1]) { options.width = parseInt(args[++i]); }
  else if (args[i] === "--height" && args[i + 1]) { options.height = parseInt(args[++i]); }
  else if (args[i] === "--fps" && args[i + 1]) { options.fps = parseInt(args[++i]); }
  else if (args[i] === "--samples" && args[i + 1]) { options.samples = parseInt(args[++i]); }
  else if (args[i] === "--maxDepth" && args[i + 1]) { options.maxDepth = parseInt(args[++i]); }
  else if (args[i] === "--no-tts") { options.enableTTS = false; }
  else if (args[i] === "--llm") { options.enableLLM = true; }
  else if (args[i] === "--llm-interval" && args[i + 1]) { options.llmInterval = parseFloat(args[++i]); }
  else if (args[i] === "--character-glb") {
    if (args[i + 1] && !String(args[i + 1]).startsWith("--")) options.characterGlb = args[++i];
    else options.characterGlb = CHAR_RIGGED_GLB;
  }
  else if (args[i] === "--solver" && args[i + 1]) { options.solver = args[++i]; }
  else { positionalArgs.push(args[i]); }
}

if (!options.solver) options.solver = CHAMBER_SOLVER_DEFAULT;

const sceneCardPath = resolve(positionalArgs[0]);
const outputDir = positionalArgs[1]
  ? resolve(positionalArgs[1])
  : resolve(__dirname, "../output/simulation", basename(sceneCardPath, ".json"));

const raw = readFileSync(sceneCardPath, "utf8");
const sceneCard = JSON.parse(raw);

// Support both old format (single entity) and new format (actors array)
const hasActors = sceneCard.actors && sceneCard.actors.length > 0;

console.log(`\nSimulation Chamber v3 — "${sceneCard.name || sceneCard.id}"`);
console.log("=".repeat(60));

const characterHook = describeCharacterHook(options.characterGlb || CHAR_RIGGED_GLB);
console.log(`  Character pipeline: ${characterHook.path}`);
console.log(`  Hook: ${characterHook.status} — ${characterHook.note}`);
if (options.characterGlb) {
  console.log("  --character-glb set; RT4D still uses humanoid-avatar primitives until mesh consume lands (no third character system).");
}

const sim = new MultiActorSim(options);
sim.buildWorld(sceneCard);

if (hasActors) {
  for (const actorDef of sceneCard.actors) {
    sim.addActor(actorDef);
  }
  sim.buildAvatars();
} else {
  // Fallback: single default actor
  sim.addActor({
    id: "default",
    name: "Observer",
    color: "#ffffff",
    beats: [{ time: 0, action: "glow", position: [0, 2, 0, 0], emissive: [0.8, 0.8, 0.8], scale: 0.5 }],
  });
  sim.buildAvatars();
}

const rhfdHook = describeChamberSubstrate({
  actors: sim.actors,
  characterGlb: Boolean(options.characterGlb),
  motionDriver:
    (options.solver || CHAMBER_SOLVER_DEFAULT) === CHAMBER_SOLVER_POSE
      ? MOTION_DRIVER_POSE
      : MOTION_DRIVER_PROTO,
});
console.log(`  RHFD substrate: ${rhfdHook.gradVStatus} — motion=${rhfdHook.motionDriverActual}; actors=hex petal defects`);
if ((options.solver || CHAMBER_SOLVER_DEFAULT) === CHAMBER_SOLVER_POSE) {
  console.log("  Solver: --solver pose (pose_interpolation / notGradV).");
}

function maybeProtoSolver() {
  if ((options.solver || CHAMBER_SOLVER_DEFAULT) === CHAMBER_SOLVER_POSE) {
    return Promise.resolve(null);
  }
  const tEnd = Math.min(63, Math.max(8, Math.ceil(sim.duration || 8)));
  const solverResult = runCinematicProtoSolver({
    seed: options.seed || sim.seed || 42,
    tEnd,
    beatDuration: sim.duration,
  });
  sim.solver = CHAMBER_SOLVER_ID;
  sim.solverResult = solverResult;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, "mandala-proto-solver.json"),
    JSON.stringify(
      {
        ...solverResult,
        receipts: solverResult.receipts,
      },
      null,
      2,
    ),
  );
  const moved = solverResult.actorSample;
  console.log(
    `  Solver: mandala-proto — ${solverResult.committedSteps} certified steps; actors follow −∇φ defect walk (Movie Lane ownsTime=false); sample ${moved.rest} → ${moved.position.map((v) => v.toFixed(3))}`,
  );
  return Promise.resolve(solverResult);
}

maybeProtoSolver().then(() => sim.run()).then(result => {
  console.log(`\n  Assembling...`);
  return sim.assemble(outputDir, sceneCard);
}).then(() => {
  console.log(`  Done. ${sim.frames.length} frames, ${sim.speechTimeline.length} speech segments.`);
  console.log(`  Output: ${outputDir}`);
});
