#!/usr/bin/env node
/**
 * Actor Decision Engine — LLM-driven decisions for simulation actors.
 *
 * Each actor observes the world state, asks the LLM what to do next,
 * and receives a structured decision (position, emissive, speech, action).
 *
 * Usage:
 *   node actor-decision-engine.mjs --actor <actorId> --world <world.json> --tick <N>
 *
 * Or as a module:
 *   import { ActorDecisionEngine } from './actor-decision-engine.mjs';
 *   const engine = new ActorDecisionEngine({ baseUrl: 'http://127.0.0.1:13307/v1' });
 *   const decision = await engine.decide(actorState, worldState, history);
 */

const LEMONADE_URL = process.env.LEMONADE_BASE_URL || "http://127.0.0.1:13307/v1";
const LLM_MODEL = "Llama-3.2-1B-Instruct-GGUF";

// ---------------------------------------------------------------------------
// System prompts per actor personality
// ---------------------------------------------------------------------------

const PERSONALITY_PROMPTS = {
  ember: `You are Ember — a bold, passionate 4D explorer. You speak first, act decisively, and move toward danger. Your color is orange. You are theatrical and dramatic. When you see something new, you rush toward it. When someone speaks to you, you respond immediately with emotion. You are the spark that ignites the group.`,
  
  vex: `You are Vex — a cautious, analytical 4D cartographer. You speak precisely, measure twice, and move carefully. Your color is blue. You are logical and methodical. When you see something new, you analyze it from a distance. When someone speaks to you, you respond with facts and coordinates. You are the compass that guides the group.`,
  
  sage: `You are Sage — a wise, mysterious 4D philosopher. You speak last, observe deeply, and move deliberately. Your color is green. You are contemplative and cryptic. When you see something new, you connect it to ancient patterns. When someone speaks to you, you respond with parables and truths. You are the anchor that grounds the group.`,
};

const DEFAULT_PERSONALITY = PERSONALITY_PROMPTS.ember;

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
      const pos = actor.position.map(v => v.toFixed(1)).join(", ");
      const emissive = actor.emissive.map(v => v.toFixed(1)).join(", ");
      lines.push(`  - ${actor.name} (${actor.color}): position=[${pos}], emissive=[${emissive}], action=${actor.currentAction || "idle"}`);
      if (actor.lastSpeech) {
        lines.push(`    Last words: "${actor.lastSpeech}"`);
      }
    }
  }
  
  // Add emotional arc hint
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
  
  const recent = history.slice(-6); // Last 6 actions
  return recent.map(h => `[${h.time.toFixed(1)}s] ${h.actorName}: ${h.action} — "${h.speech || ""}"`).join("\n");
}

// ---------------------------------------------------------------------------
// Decision prompt builder
// ---------------------------------------------------------------------------

function buildDecisionPrompt(actorState, worldState, history) {
  const personality = PERSONALITY_PROMPTS[actorState.id] || DEFAULT_PERSONALITY;
  
  return `You are an actor in a 4D geometric world. You must decide your next action.

PERSONALITY:
${personality}

CURRENT WORLD:
${formatWorldState(worldState)}

YOUR CURRENT STATE:
- Position: [${actorState.position.map(v => v.toFixed(1)).join(", ")}]
- Emissive (glow): [${actorState.emissive.map(v => v.toFixed(1)).join(", ")}]
- Current action: ${actorState.currentAction || "idle"}
- Scale: ${actorState.scale || 0.5}

PRIOR ACTIONS IN THIS SCENE:
${formatHistory(history)}

RULES:
1. You MUST respond with valid JSON only — no markdown, no explanation.
2. Position: [x, y, z, w] — x is left/right (-3 to 3), y is up (1.5 to 3.5), z is forward/back (-3 to 3), w is 4th axis (-2 to 2)
3. Emissive: [r, g, b] — 0.0 to 1.0 each — your glow color
4. Action: "idle" | "walk" | "speak" | "gesture" | "listen" | "reach" | "dramatic" | "curious"
5. Speech: a short line of dialogue (1 sentence, in character). Use "" if not speaking.
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

async function callLemonadeLLM(prompt, options = {}) {
  const baseUrl = options.baseUrl || LEMONADE_URL;
  const model = options.model || LLM_MODEL;
  const temperature = options.temperature ?? 0.8;
  const maxTokens = options.maxTokens ?? 512;
  
  const body = {
    model,
    messages: [
      { role: "system", content: "You are a 4D actor in a geometric world. Respond with valid JSON only." },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lemonade LLM error ${response.status}: ${text.slice(0, 200)}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return content;
}

// ---------------------------------------------------------------------------
// Parse LLM response
// ---------------------------------------------------------------------------

function parseDecision(raw) {
  // Try to extract JSON from the response
  let jsonStr = raw.trim();
  
  // Remove markdown code fences if present
  jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  jsonStr = jsonStr.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  
  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Try to fix truncated JSON by closing brackets
    const partialMatch = jsonStr.match(/\{[\s\S]*/);
    if (partialMatch) {
      let partial = partialMatch[0];
      // Close any open strings
      const quoteCount = (partial.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) partial += '"';
      // Close any open arrays/objects
      const openBrackets = (partial.match(/\[/g) || []).length;
      const closeBrackets = (partial.match(/\]/g) || []).length;
      for (let i = closeBrackets; i < openBrackets; i++) partial += ']';
      const openBraces = (partial.match(/\{/g) || []).length;
      const closeBraces = (partial.match(/\}/g) || []).length;
      for (let i = closeBraces; i < openBraces; i++) partial += '}';
      
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
    
    // Last resort: try to extract individual fields
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
    
    // Validate required fields
    if (!Array.isArray(parsed.position) || parsed.position.length < 3) {
      console.error("  Decision parse: invalid position", parsed.position);
      return null;
    }
    
    // Pad position to 4D if needed
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
    this.baseUrl = options.baseUrl || LEMONADE_URL;
    this.model = options.model || LLM_MODEL;
    this.temperature = options.temperature ?? 0.8;
    this.maxTokens = options.maxTokens ?? 1024;
    this.history = new Map(); // actorId → [{ time, action, speech, position }]
  }
  
  /**
   * Get a decision from the LLM for an actor.
   * @param {Object} actorState - current actor state
   * @param {Object} worldState - current world state
   * @returns {Object|null} decision or null on failure
   */
  async decide(actorState, worldState) {
    const actorHistory = this.history.get(actorState.id) || [];
    const prompt = buildDecisionPrompt(actorState, worldState, actorHistory);
    
    try {
      const raw = await callLemonadeLLM(prompt, {
        baseUrl: this.baseUrl,
        model: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });
      
      const decision = parseDecision(raw);
      
      if (decision) {
        // Record in history
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
  
  /**
   * Get decisions for multiple actors in parallel.
   */
  async decideAll(actors, worldState) {
    const decisions = await Promise.all(
      actors.map(actor => this.decide(actor, worldState))
    );
    
    const result = {};
    for (let i = 0; i < actors.length; i++) {
      result[actors[i].id] = decisions[i];
    }
    return result;
  }
  
  /**
   * Reset history for a new scene.
   */
  reset() {
    this.history.clear();
  }
  
  /**
   * Add a manual entry to history (for scripted beats that already happened).
   */
  recordAction(actorId, time, action, speech, position, actorName) {
    const history = this.history.get(actorId) || [];
    history.push({ time, action, speech, position, actorName });
    this.history.set(actorId, history);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes("--help") || args.length === 0) {
    console.log("Usage: node actor-decision-engine.mjs --actor <actorId> --world <world.json> --tick <N>");
    console.log("       node actor-decision-engine.mjs --test");
    process.exit(0);
  }
  
  if (args.includes("--test")) {
    // Quick test
    console.log("Testing Actor Decision Engine...");
    const engine = new ActorDecisionEngine();
    
    const actorState = {
      id: "ember",
      name: "Ember",
      color: "#ff6633",
      position: [-2, 2, 0, 0],
      emissive: [0.8, 0.4, 0.2],
      currentAction: "walk",
      scale: 0.5,
    };
    
    const worldState = {
      time: 1.5,
      tick: 18,
      sceneDescription: "abstract 4D geometry",
      actors: [
        { name: "Ember", color: "#ff6633", position: [-2, 2, 0, 0], emissive: [0.8, 0.4, 0.2], currentAction: "walk" },
        { name: "Vex", color: "#3366ff", position: [2, 2, 1, 0], emissive: [0.2, 0.4, 0.8], currentAction: "idle" },
        { name: "Sage", color: "#33ff99", position: [0, 3, -1, 0], emissive: [0.2, 0.8, 0.4], currentAction: "listen" },
      ],
    };
    
    engine.decide(actorState, worldState).then(decision => {
      if (decision) {
        console.log("Decision:", JSON.stringify(decision, null, 2));
      } else {
        console.log("Decision: null (LLM unavailable or parse failed)");
      }
    });
  }
}
