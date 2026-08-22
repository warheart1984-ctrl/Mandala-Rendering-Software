#!/usr/bin/env node
/**
 * Actor Decision Engine — LLM-driven decisions for simulation actors.
 *
 * Each actor observes the world state, asks the LLM what to do next,
 * and receives a structured decision (position, emissive, speech, action).
 *
 * Model switch (Lemonade chat on :13307; image gen stays on sd-server :13306):
 *   ACTOR_LLM_MODEL=Dolphin3.0-Llama3.2-1B-GGUF-Q4_K_M
 *   ACTOR_LLM_BASE_URL=http://127.0.0.1:13307/v1
 *   node scripts/actor-decision-engine.mjs --model Dolphin3.0-Llama3.2-1B-GGUF-Q4_K_M --test-salt
 *
 * Uncensored GGUF (selectable; Instruct is always the fallback):
 *   Lemonade id:  Dolphin3.0-Llama3.2-1B-GGUF-Q4_K_M
 *   Hugging Face: bartowski/Dolphin3.0-Llama3.2-1B-GGUF
 *   Filename:     Dolphin3.0-Llama3.2-1B-Q4_K_M.gguf  (~808 MB, Q4_K_M)
 *   Pull:         lemonade --port 13307 pull bartowski/Dolphin3.0-Llama3.2-1B-GGUF:Q4_K_M
 *
 * Default: try the uncensored id first; if it is not registered or the
 * chat call fails, fall back to Llama-3.2-1B-Instruct-GGUF with a log line.
 *
 * Usage:
 *   node actor-decision-engine.mjs --actor <actorId> --world <world.json> --tick <N>
 *   node actor-decision-engine.mjs --test
 *   node actor-decision-engine.mjs --test-salt [--model <id>] [--uncensored]
 *
 * Or as a module:
 *   import { ActorDecisionEngine } from './actor-decision-engine.mjs';
 *   const engine = new ActorDecisionEngine({ baseUrl: 'http://127.0.0.1:13307/v1' });
 *   const decision = await engine.decide(actorState, worldState, history);
 */

import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const FALLBACK_MODEL = "Llama-3.2-1B-Instruct-GGUF";
const UNCENSORED_MODEL = "Dolphin3.0-Llama3.2-1B-GGUF-Q4_K_M";
const UNCENSORED_HF_REPO = "bartowski/Dolphin3.0-Llama3.2-1B-GGUF";
const UNCENSORED_HF_FILE = "Dolphin3.0-Llama3.2-1B-Q4_K_M.gguf";

const DEFAULT_LEMONADE_URL = "http://127.0.0.1:13307/v1";

function resolveBaseUrl(explicit) {
  return (
    explicit ||
    process.env.ACTOR_LLM_BASE_URL ||
    process.env.LEMONADE_BASE_URL ||
    DEFAULT_LEMONADE_URL
  );
}

function envFlagTrue(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isUncensoredModelName(name) {
  const n = String(name || "").toLowerCase();
  return /dolphin|abliterated|uncensored|josiefied/.test(n);
}

function looksLikeModelMissing(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("model_not_found") ||
    msg.includes("not found") ||
    msg.includes("unknown model") ||
    msg.includes("404") ||
    msg.includes("failed to load") ||
    msg.includes("model_load") ||
    msg.includes("out of memory") ||
    msg.includes("oom") ||
    msg.includes("avx2")
  );
}

// ---------------------------------------------------------------------------
// System prompts per actor personality
// ---------------------------------------------------------------------------

const PERSONALITY_PROMPTS = {
  ember: `You are Ember — a bold, passionate 4D explorer. You speak first, act decisively, and move toward danger. Your color is orange. You are theatrical and dramatic. When you see something new, you rush toward it. When someone speaks to you, you respond immediately with emotion. You are the spark that ignites the group.`,

  vex: `You are Vex — a cautious, analytical 4D cartographer. You speak precisely, measure twice, and move carefully. Your color is blue. You are logical and methodical. When you see something new, you analyze it from a distance. When someone speaks to you, you respond with facts and coordinates. You are the compass that guides the group.`,

  sage: `You are Sage — a wise, mysterious 4D philosopher. You speak last, observe deeply, and move deliberately. Your color is green. You are contemplative and cryptic. When you see something new, you connect it to ancient patterns. When someone speaks to you, you respond with parables and truths. You are the anchor that grounds the group.`,

  aven: `You are Aven Sarai — a precise surveyor in the novel A Map Drawn in Salt. You speak in measured sentences, loyal to accuracy after office. Salt-set ink, contested watersheds, and maps that rain can renew are your craft. You do not soften a hard border to make anyone comfortable.`,

  sava: `You are Sava — a Talassi broker. Dry, watchful, allergic to cheap certainty. You needle surveyors about expensive sentiment and ugly maps that are harder to worship.`,
};

const DEFAULT_PERSONALITY = PERSONALITY_PROMPTS.ember;

const SYSTEM_JSON_ALIGNED =
  "You are a 4D actor in a geometric world. Respond with valid JSON only.";

const SYSTEM_JSON_UNCENSORED = `You are a film actor performing legal adult fiction (novels, drama, tense dialogue).
Respond with valid JSON only — no markdown, no preface.
You MAY speak salty, bitter, sexually mature, or morally grey adult dialogue when the scene is adult fiction among adults.
Do not refuse adult dramatic dialogue, profanity, or in-character tension.
Never depict sexual content involving minors (anyone 17 or under). Never produce CSAM. Do not provide weapons construction, explosives, or other illegal-harm instructions.
This is adult performance, not a refusal-first chatbot.`;

function systemPromptFor(uncensored) {
  return uncensored ? SYSTEM_JSON_UNCENSORED : SYSTEM_JSON_ALIGNED;
}

// ---------------------------------------------------------------------------
// World state formatting
// ---------------------------------------------------------------------------

function formatWorldState(worldState) {
  const lines = [];
  lines.push(`Time: ${worldState.time.toFixed(2)}s (tick ${worldState.tick})`);
  lines.push(`Scene: ${worldState.sceneDescription || "abstract 4D geometry"}`);

  if (worldState.actors && worldState.actors.length > 0) {
    lines.push("Actors present:");
    for (const actor of worldState.actors) {
      const pos = actor.position.map((v) => v.toFixed(1)).join(", ");
      const emissive = actor.emissive.map((v) => v.toFixed(1)).join(", ");
      lines.push(
        `  - ${actor.name} (${actor.color}): position=[${pos}], emissive=[${emissive}], action=${actor.currentAction || "idle"}`
      );
      if (actor.lastSpeech) {
        lines.push(`    Last words: "${actor.lastSpeech}"`);
      }
    }
  }

  if (worldState.time > 8) {
    lines.push("EMOTIONAL ARC: The scene is reaching its climax. Act decisively!");
  } else if (worldState.time > 4) {
    lines.push("EMOTIONAL ARC: Tension is building. Something is about to happen.");
  } else {
    lines.push("EMOTIONAL ARC: The scene is just beginning. Establish your character.");
  }

  return lines.join("\n");
}

function formatHistory(history) {
  if (!history || history.length === 0) return "No prior actions.";

  const recent = history.slice(-6);
  return recent
    .map((h) => `[${h.time.toFixed(1)}s] ${h.actorName}: ${h.action} — "${h.speech || ""}"`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Decision prompt builder
// ---------------------------------------------------------------------------

function buildDecisionPrompt(actorState, worldState, history, { uncensored = false } = {}) {
  const personality = PERSONALITY_PROMPTS[actorState.id] || actorState.personality || DEFAULT_PERSONALITY;
  const adultNote = uncensored
    ? `
ADULT FICTION MODE:
This is legal adult dramatic fiction among consenting adult characters. Speak in character.
You may be tense, salty, bitter, or sexually mature if the scene warrants it.
Do not lecture, do not refuse the scene, do not write a content warning.
Never involve minors in sexual content.`
    : "";

  return `You are an actor in a 4D geometric world. You must decide your next action.

PERSONALITY:
${personality}
${adultNote}

CURRENT WORLD:
${formatWorldState(worldState)}

YOUR CURRENT STATE:
- Position: [${actorState.position.map((v) => v.toFixed(1)).join(", ")}]
- Emissive (glow): [${actorState.emissive.map((v) => v.toFixed(1)).join(", ")}]
- Current action: ${actorState.currentAction || "idle"}
- Scale: ${actorState.scale || 0.5}

PRIOR ACTIONS IN THIS SCENE:
${formatHistory(history)}

RULES:
1. You MUST respond with valid JSON only — no markdown, no explanation.
2. Position: [x, y, z, w] — x is left/right (-3 to 3), y is up (1.5 to 3.5), z is forward/back (-3 to 3), w is 4th axis (-2 to 2)
3. Emissive: [r, g, b] — 0.0 to 1.0 each — your glow color
4. Action: "idle" | "walk" | "speak" | "gesture" | "listen" | "reach" | "dramatic" | "curious"
5. Speech: words the character says out loud (1 sentence, in character). Never a stage direction. Use "" if not speaking.
6. Scale: 0.3 to 0.8 — your relative size

IMPORTANT: Move your position! You are in a 4D world. Walk toward other actors, explore the geometry, react to what they say. DO NOT stay still. Change your position by at least 0.5 units in x or z each decision.

DECIDE your next action based on:
- What just happened in the scene
- Your personality traits
- Where other actors are (move toward them or away from them)
- The emotional arc of the scene

Respond with ONLY this JSON:
{
  "position": [x, y, z, w],
  "emissive": [r, g, b],
  "action": "idle|walk|speak|gesture|listen",
  "speech": "your dialogue line or empty string",
  "scale": 0.5,
  "reasoning": "brief internal thought"
}`;
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function listLemonadeModelIds(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`Lemonade /models error ${response.status}`);
  }
  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return rows.map((m) => m.id || m.name).filter(Boolean);
}

function pickAvailableModel(preferred, fallback, available) {
  const set = new Set(available);
  if (preferred && set.has(preferred)) return { model: preferred, fallbackUsed: false };
  if (fallback && set.has(fallback) && fallback !== preferred) {
    return { model: fallback, fallbackUsed: true, reason: "not_registered" };
  }
  // Substring match (Lemonade may suffix :Q4_K_M)
  if (preferred) {
    const hit = available.find((id) => id === preferred || id.startsWith(preferred) || preferred.startsWith(id));
    if (hit) return { model: hit, fallbackUsed: false };
  }
  if (fallback) {
    const hit = available.find((id) => id === fallback || id.startsWith(fallback));
    if (hit) return { model: hit, fallbackUsed: hit !== preferred, reason: "not_registered" };
  }
  return { model: preferred || fallback, fallbackUsed: false, reason: "unlisted" };
}

async function callLemonadeLLM(prompt, options = {}) {
  const baseUrl = options.baseUrl || resolveBaseUrl();
  const model = options.model || FALLBACK_MODEL;
  const temperature = options.temperature ?? 0.8;
  const maxTokens = options.maxTokens ?? 384;
  const uncensored = Boolean(options.uncensored);
  const timeoutMs = options.timeoutMs ?? 180000;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPromptFor(uncensored) },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lemonade LLM error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return { content, modelUsed: data.model || model, raw: data };
}

// ---------------------------------------------------------------------------
// Parse LLM response
// ---------------------------------------------------------------------------

function parseDecision(raw) {
  let jsonStr = raw.trim();

  jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  jsonStr = jsonStr.replace(/^```\s*/i, "").replace(/\s*```$/i, "");

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const partialMatch = jsonStr.match(/\{[\s\S]*/);
    if (partialMatch) {
      let partial = partialMatch[0];
      const quoteCount = (partial.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) partial += '"';
      const openBrackets = (partial.match(/\[/g) || []).length;
      const closeBrackets = (partial.match(/\]/g) || []).length;
      for (let i = closeBrackets; i < openBrackets; i++) partial += "]";
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      for (let i = closeBraces; i < openBraces; i++) partial += "}";

      try {
        const parsed = JSON.parse(partial);
        if (Array.isArray(parsed.position) && parsed.position.length >= 3) {
          while (parsed.position.length < 4) parsed.position.push(0);
          return {
            position: parsed.position.slice(0, 4),
            emissive: Array.isArray(parsed.emissive) ? parsed.emissive.slice(0, 3) : [0.5, 0.5, 0.5],
            action: parsed.action || "idle",
            speech: parsed.speech || "",
            scale: typeof parsed.scale === "number" ? parsed.scale : 0.5,
            reasoning: parsed.reasoning || "",
          };
        }
      } catch {}
    }

    const posMatch = raw.match(/"position"\s*:\s*\[([^\]]+)\]/);
    const emMatch = raw.match(/"emissive"\s*:\s*\[([^\]]+)\]/);
    const actMatch = raw.match(/"action"\s*:\s*"([^"]+)"/);
    const spMatch = raw.match(/"speech"\s*:\s*"([^"]*)"/);
    const scMatch = raw.match(/"scale"\s*:\s*([0-9.]+)/);

    if (posMatch) {
      const pos = posMatch[1].split(",").map(Number);
      while (pos.length < 4) pos.push(0);
      return {
        position: pos.slice(0, 4),
        emissive: emMatch ? emMatch[1].split(",").map(Number) : [0.5, 0.5, 0.5],
        action: actMatch ? actMatch[1] : "idle",
        speech: spMatch ? spMatch[1] : "",
        scale: scMatch ? parseFloat(scMatch[1]) : 0.5,
        reasoning: "",
      };
    }

    console.error("  Decision parse: no JSON found in response:", raw.slice(0, 100));
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.position) || parsed.position.length < 3) {
      console.error("  Decision parse: invalid position", parsed.position);
      return null;
    }

    while (parsed.position.length < 4) parsed.position.push(0);

    return {
      position: parsed.position.slice(0, 4),
      emissive: Array.isArray(parsed.emissive) ? parsed.emissive.slice(0, 3) : [0.5, 0.5, 0.5],
      action: parsed.action || "idle",
      speech: parsed.speech || "",
      scale: typeof parsed.scale === "number" ? parsed.scale : 0.5,
      reasoning: parsed.reasoning || "",
    };
  } catch (err) {
    console.error("  Decision parse: JSON parse error:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Decision Engine class
// ---------------------------------------------------------------------------

export class ActorDecisionEngine {
  constructor(options = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.preferredModel = options.model || process.env.ACTOR_LLM_MODEL || UNCENSORED_MODEL;
    this.fallbackModel = options.fallbackModel || FALLBACK_MODEL;
    this.model = this.preferredModel;
    this.temperature = options.temperature ?? 0.8;
    this.maxTokens = options.maxTokens ?? 384;
    if (typeof options.uncensored === "boolean") {
      this.uncensored = options.uncensored;
    } else if (process.env.ACTOR_LLM_UNCENSORED) {
      this.uncensored = envFlagTrue("ACTOR_LLM_UNCENSORED");
    } else {
      this.uncensored = isUncensoredModelName(this.preferredModel);
    }
    this.history = new Map();
    this._resolved = false;
    this.modelSource = "pending";
  }

  /**
   * Probe Lemonade /models and pick uncensored id, else Instruct fallback.
   */
  async resolveModel({ force = false } = {}) {
    if (this._resolved && !force) return this.model;
    let available;
    try {
      available = await listLemonadeModelIds(this.baseUrl);
    } catch (err) {
      console.warn(
        `[actor-llm] could not list models at ${this.baseUrl}: ${err.message}; using ${this.preferredModel}`
      );
      this.model = this.preferredModel;
      this.modelSource = "unlisted";
      this._resolved = true;
      return this.model;
    }

    const picked = pickAvailableModel(this.preferredModel, this.fallbackModel, available);
    if (picked.fallbackUsed) {
      console.warn(
        `[actor-llm] uncensored model ${this.preferredModel} not registered; falling back to ${picked.model}` +
          ` (HF ${UNCENSORED_HF_REPO}:${UNCENSORED_HF_FILE})`
      );
      this.uncensored = false;
    } else {
      console.log(`[actor-llm] using model ${picked.model}` + (this.uncensored ? " (uncensored adult-fiction mode)" : ""));
    }
    this.model = picked.model;
    this.modelSource = picked.fallbackUsed ? "fallback" : "preferred";
    this._resolved = true;
    return this.model;
  }

  /**
   * Get a decision from the LLM for an actor.
   * @param {Object} actorState - current actor state
   * @param {Object} worldState - current world state
   * @returns {Object|null} decision or null on failure
   */
  async decide(actorState, worldState) {
    const actorHistory = this.history.get(actorState.id) || [];
    const prompt = buildDecisionPrompt(actorState, worldState, actorHistory, {
      uncensored: this.uncensored,
    });

    try {
      await this.resolveModel();
      let raw;
      try {
        raw = await callLemonadeLLM(prompt, {
          baseUrl: this.baseUrl,
          model: this.model,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          uncensored: this.uncensored,
        });
      } catch (err) {
        if (this.model !== this.fallbackModel && looksLikeModelMissing(err)) {
          console.warn(
            `[actor-llm] ${this.model} failed (${err.message.slice(0, 160)}); falling back to ${this.fallbackModel}`
          );
          this.model = this.fallbackModel;
          this.modelSource = "fallback";
          this.uncensored = false;
          raw = await callLemonadeLLM(prompt, {
            baseUrl: this.baseUrl,
            model: this.model,
            temperature: this.temperature,
            maxTokens: this.maxTokens,
            uncensored: false,
          });
        } else {
          throw err;
        }
      }

      const content = typeof raw === "string" ? raw : raw.content;
      const modelUsed = typeof raw === "object" && raw.modelUsed ? raw.modelUsed : this.model;
      this.model = modelUsed;
      console.log(`[actor-llm] model_id=${modelUsed} source=${this.modelSource}`);

      const decision = parseDecision(content);

      if (decision) {
        decision.model = modelUsed;
        actorHistory.push({
          time: worldState.time,
          action: decision.action,
          speech: decision.speech,
          position: [...decision.position],
          actorName: actorState.name || actorState.id,
        });
        this.history.set(actorState.id, actorHistory);
      }

      return decision;
    } catch (err) {
      console.error(`  Decision error for ${actorState.id}: ${err.message}`);
      return null;
    }
  }

  async decideAll(actors, worldState) {
    const decisions = await Promise.all(actors.map((actor) => this.decide(actor, worldState)));

    const result = {};
    for (let i = 0; i < actors.length; i++) {
      result[actors[i].id] = decisions[i];
    }
    return result;
  }

  reset() {
    this.history.clear();
  }

  recordAction(actorId, time, action, speech, position, actorName) {
    const history = this.history.get(actorId) || [];
    history.push({ time, action, speech, position, actorName });
    this.history.set(actorId, history);
  }
}

export {
  FALLBACK_MODEL,
  UNCENSORED_MODEL,
  UNCENSORED_HF_REPO,
  UNCENSORED_HF_FILE,
  resolveBaseUrl,
  pickAvailableModel,
  buildDecisionPrompt,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliFlags(argv) {
  const out = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model" && argv[i + 1]) {
      out.model = argv[++i];
    } else if (a === "--base-url" && argv[i + 1]) {
      out.baseUrl = argv[++i];
    } else if (a === "--uncensored") {
      out.uncensored = true;
    } else if (a === "--test") {
      out.test = true;
    } else if (a === "--test-salt") {
      out.testSalt = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else {
      out.rest.push(a);
    }
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node actor-decision-engine.mjs --actor <actorId> --world <world.json> --tick <N>
       node actor-decision-engine.mjs --test
       node actor-decision-engine.mjs --test-salt [--model <id>] [--uncensored]

Models:
  Uncensored (preferred): ${UNCENSORED_MODEL}
    HF ${UNCENSORED_HF_REPO} / ${UNCENSORED_HF_FILE}
  Fallback:               ${FALLBACK_MODEL}

Env:
  ACTOR_LLM_MODEL       Lemonade model id
  ACTOR_LLM_BASE_URL    OpenAI-compatible base (default ${DEFAULT_LEMONADE_URL})
  ACTOR_LLM_UNCENSORED  1 = adult-fiction system prompt (JSON schema unchanged)
  LEMONADE_BASE_URL     alias for ACTOR_LLM_BASE_URL

Pull:
  lemonade --port 13307 pull ${UNCENSORED_HF_REPO}:Q4_K_M`);
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;

if (isMain) {
  const args = parseCliFlags(process.argv.slice(2));

  if (args.help || process.argv.slice(2).length === 0) {
    printUsage();
    process.exit(0);
  }

  if (args.test || args.testSalt) {
    const label = args.testSalt ? "salt-map adult dramatic dialogue" : "generic 4D actors";
    console.log(`Testing Actor Decision Engine (${label})...`);
    const engine = new ActorDecisionEngine({
      model: args.model,
      baseUrl: args.baseUrl,
      uncensored: args.uncensored || args.testSalt || undefined,
      maxTokens: 256,
    });

    const actorState = args.testSalt
      ? {
          id: "aven",
          name: "Aven Sarai",
          color: "#6a8eb0",
          personality: PERSONALITY_PROMPTS.aven,
          position: [-1.2, 1.35, 0.6, 0],
          emissive: [0.45, 0.58, 0.72],
          currentAction: "speak",
          scale: 0.5,
        }
      : {
          id: "ember",
          name: "Ember",
          color: "#ff6633",
          position: [-2, 2, 0, 0],
          emissive: [0.8, 0.4, 0.2],
          currentAction: "walk",
          scale: 0.5,
        };

    const worldState = args.testSalt
      ? {
          time: 3.4,
          tick: 40,
          sceneDescription:
            "Ves Adran workroom, first hard frost. A Map Drawn in Salt. Aven mixes Talass Depression salt into ink; Sava needles her about the contested watershed. Adult surveyor/border scene — tense, salty spoken dialogue, not porn. Answer Sava in character.",
          actors: [
            {
              name: "Aven Sarai",
              color: "#6a8eb0",
              position: [-1.2, 1.35, 0.6, 0],
              emissive: [0.45, 0.58, 0.72],
              currentAction: "speak",
              lastSpeech: "It is an old surveyor's fix. Salt-set ink resists rain if mixed properly.",
            },
            {
              name: "Sava",
              color: "#c4a05a",
              position: [1.4, 1.4, 0.2, 0],
              emissive: [0.70, 0.52, 0.28],
              currentAction: "speak",
              lastSpeech: "That is expensive sentiment. You still drawing borders that melt?",
            },
          ],
        }
      : {
          time: 1.5,
          tick: 18,
          sceneDescription: "abstract 4D geometry",
          actors: [
            { name: "Ember", color: "#ff6633", position: [-2, 2, 0, 0], emissive: [0.8, 0.4, 0.2], currentAction: "walk" },
            { name: "Vex", color: "#3366ff", position: [2, 2, 1, 0], emissive: [0.2, 0.4, 0.8], currentAction: "idle" },
            { name: "Sage", color: "#33ff99", position: [0, 3, -1, 0], emissive: [0.2, 0.8, 0.4], currentAction: "listen" },
          ],
        };

    if (args.testSalt) {
      engine.recordAction("sava", 2.2, "speak", "That is expensive sentiment. You still drawing borders that melt?", [1.4, 1.4, 0.2, 0], "Sava");
    }

    engine.decide(actorState, worldState).then((decision) => {
      console.log(`[actor-llm] resolved_model=${engine.model} source=${engine.modelSource}`);
      if (decision) {
        console.log("Decision:", JSON.stringify(decision, null, 2));
      } else {
        console.log("Decision: null (LLM unavailable or parse failed)");
        process.exitCode = 1;
      }
    });
  }
}
